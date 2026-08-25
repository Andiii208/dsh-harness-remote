/**
 * SessionStore — 会话镜像折叠（纯 TS，零 RN 依赖，可单测）。
 * 将下行帧增量折叠为：会话摘要（含投影派生）、转录消息、待应答请求。
 * 未知/无法识别的帧一律忽略（宽容）。
 */

import type { DownlinkFrame } from "@dsh-remote/protocol";
import { extractTranscriptImages, parseImageLimits, type ImageLimits, type TranscriptImage } from "./imageMessage";
import { applyStepEvent, type TranscriptStep } from "./transcriptSteps";

export interface SessionSummary {
  id: string;
  title?: string;
  workspace?: string;
  lastMessage?: string;
  updatedAt: number;
  /** 最近一次活动的时间戳（Date.now()，用于列表相对时间显示）。 */
  lastActiveAt?: number;
  /** 单调排序键（tick 尺度）。服务器 updatedAt 是毫秒尺度，不能混用。 */
  sortKey?: number;
  /** 服务器返回的 updatedAt（毫秒尺度），仅用于展示/对照，不参与排序。 */
  serverUpdatedAt?: number;
  /** 会话是否在运行（host/session-status 帧更新）。 */
  running?: boolean;
  goalStatus?: string;
  goalObjective?: string;
  goalRef?: GoalRef;
  todos?: TranscriptTodo[];
  plan?: unknown;
  tokenUsageTotal?: number;
  contextPercent?: number;
  /** 原生 DSH permissions projection：可选权限预设与当前值。 */
  permissionOptions?: string[];
  permissionCurrent?: string;
  /** 当前模型（session.models 的结果缓存，聊天页可先用列表投影）。 */
  modelProvider?: string;
  model?: string;
  /** 宿主图片限制投影（imageLimits）；未返回时不限制。 */
  imageLimits?: ImageLimits;
}

export interface GoalRef {
  id: string;
  revision: number;
}

export interface QueueItem {
  id: string;
  placement: "queued" | "steering" | "context";
  role: string;
  text: string;
}

export interface JobInfo {
  id: string;
  kind: string;
  label: string;
  status: "running" | "stopping" | "completed" | "killed" | "failed";
  detail?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface TranscriptTodo {
  content: string;
  status: "pending" | "in_progress" | "completed" | string;
}

export interface TranscriptMessage {
  id?: string;
  role?: string;
  content: string;
  interrupted?: boolean;
  /** 间隙标记：消息流中断/缺失导致的断点。 */
  gap?: boolean;
  /** 图片消息：content block 折叠出的 attachmentId/mediaType 引用。 */
  images?: TranscriptImage[];
  /** 思考过程（reasoning-delta 折叠），仅 DSH Desktop 新宿主。 */
  thinking?: string;
  /** 来源事件 seq（用于历史分页 beforeSeq 计算）。 */
  seq?: number;
  /** 来源事件 time（epoch ms，用于聊天日期分组；旧事件/间隙标记无此字段）。 */
  ts?: number;
}

export interface PendingRequest {
  rpcId: string;
  kind: string;
  payload: unknown;
  receivedAt: number;
}

type Frame = DownlinkFrame & Record<string, unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

/** 从 DSH Desktop 的 content 块（text / content / message / delta）里递归提取纯文本。 */
function extractDshText(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map((item) => extractDshText(item)).join("");
  if (!isRecord(v)) return "";
  if (typeof v.text === "string") return v.text;
  if (typeof v.delta === "string") return v.delta;
  if (typeof v.content === "string") return v.content;
  if (v.content !== undefined) return extractDshText(v.content);
  if (typeof v.message === "string") return v.message;
  return "";
}

/** 从 DSH Desktop 事件的 data（{content:[...]} 或 {message:{content:[...]}}）折叠图片块。 */
function extractDshImages(data: unknown): TranscriptImage[] {
  if (Array.isArray(data)) return extractTranscriptImages(data);
  if (!isRecord(data)) return [];
  if (Array.isArray(data.content)) return extractTranscriptImages(data.content);
  if (isRecord(data.message) && Array.isArray(data.message.content)) {
    return extractTranscriptImages(data.message.content);
  }
  return [];
}

export class SessionStore {
  private sessions = new Map<string, SessionSummary>();
  private transcripts = new Map<string, TranscriptMessage[]>();
  private pending = new Map<string, PendingRequest>();
  private streaming = new Map<string, TranscriptMessage>();
  private steps = new Map<string, TranscriptStep[]>();
  private queues = new Map<string, QueueItem[]>();
  private jobs = new Map<string, JobInfo[]>();
  private listeners = new Set<() => void>();
  private tick = 0;
  /** 已加载过 session.history 的会话 seq 集合（按 seq 去重合并，支持分页）。 */
  private historySeqs = new Map<string, Set<number>>();

  applyFrame(frame: DownlinkFrame): void {
    if (!frame || typeof frame !== "object") return; // 宽容：垃圾输入忽略
    const f = frame as Frame;
    switch (f.type) {
      case "session/registry":
        this.applyRegistry(f);
        break;
      case "session/event":
        this.applyEvent(f);
        break;
      case "session/projection":
        this.applyProjection(f);
        break;
      case "session/queue":
        this.applyQueue(f);
        break;
      case "session/jobs":
        this.applyJobs(f);
        break;
      case "server/request":
        this.applyServerRequest(f);
        break;
      case "approval/requested":
        this.applyApprovalRequested(f);
        break;
      case "approval/resolved":
      case "question/resolved":
        if (str(f.rpcId)) this.pending.delete(str(f.rpcId)!);
        break;
      case "question/requested":
        this.applyQuestionRequested(f);
        break;
      case "host/session-added":
        this.applyHostSessionAdded(f);
        break;
      case "host/session-removed": {
        const id = str(f.sessionId);
        if (id) {
          this.sessions.delete(id);
          this.transcripts.delete(id);
          this.streaming.delete(id);
          this.steps.delete(id);
          this.queues.delete(id);
          this.jobs.delete(id);
          this.historySeqs.delete(id);
        }
        break;
      }
      case "host/session-status": {
        const id = str(f.sessionId);
        if (id) {
          const s = this.sessions.get(id);
          if (s) s.running = f.running === true;
        }
        break;
      }
      case "host/agent-error": {
        const id = str(f.sessionId);
        if (id) {
          const s = this.sessions.get(id);
          if (s) {
            s.lastMessage = str(f.message) ?? s.lastMessage;
            this.touchSession(id);
          }
        }
        break;
      }
      case "host/workspace-changed": {
        // workspace 帧暂不改变 session 列表，仅确保 notify（后续 workspace 分组消费）
        break;
      }
      case "host/archived-sessions-changed": {
        // 归档变化：本地先不做强一致处理，依赖 refreshSessions 对齐
        break;
      }
      default:
        return; // unknown / host/workspace-* / stream/error — 忽略
    }
    this.notify();
  }

  getSessions(): SessionSummary[] {
    return [...this.sessions.values()].sort((a, b) => (b.sortKey ?? b.updatedAt) - (a.sortKey ?? a.updatedAt));
  }

  getTranscript(sessionId: string): TranscriptMessage[] {
    return this.transcripts.get(sessionId) ?? [];
  }

  /** 轨迹步骤（tool/call、tool/result、turn/*、step/end 折叠）。 */
  getSteps(sessionId: string): TranscriptStep[] {
    return this.steps.get(sessionId) ?? [];
  }

  /** 当前正在流式累积的消息（message/delta 未 complete 前）。 */
  getLiveMessage(sessionId: string): TranscriptMessage | undefined {
    return this.streaming.get(sessionId);
  }

  getPendingRequests(): PendingRequest[] {
    return [...this.pending.values()].sort((a, b) => a.receivedAt - b.receivedAt);
  }

  getPendingRequest(rpcId: string): PendingRequest | undefined {
    return this.pending.get(rpcId);
  }

  getQueueItems(sessionId: string): QueueItem[] {
    return this.queues.get(sessionId) ?? [];
  }

  getJobs(sessionId: string): JobInfo[] {
    return this.jobs.get(sessionId) ?? [];
  }

  resolvePending(rpcId: string): void {
    this.pending.delete(rpcId);
    this.notify();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  clear(): void {
    this.sessions.clear();
    this.transcripts.clear();
    this.pending.clear();
    this.streaming.clear();
    this.steps.clear();
    this.queues.clear();
    this.jobs.clear();
    this.historySeqs.clear();
    this.notify();
  }

  /**
   * 用 session.history 的结果批量消费事件，构建转录消息。
   * 事件按 seq 顺序处理，订阅后流式事件也会继续增量更新。
   */
  applyHistory(events: Array<Record<string, unknown>>, sessionId: string): void {
    if (!Array.isArray(events) || events.length === 0) return;
    const seen = this.historySeqs.get(sessionId) ?? new Set<number>();
    this.historySeqs.set(sessionId, seen);
    this.touchSession(sessionId);
    for (const entry of events) {
      const event = isRecord(entry) ? (isRecord(entry.event) ? entry.event : entry) : null;
      if (!event) continue;
      // 分页合并：同一 seq 只应用一次；无 seq 的旧事件保持宽容消费。
      const seq = num(event.seq) ?? num(entry.seq);
      if (seq !== undefined) {
        if (seen.has(seq)) continue;
        seen.add(seq);
      }
      const ev = str(event.type);
      const data = event.data;
      const time = num(event.time) ?? num(entry.time);
      if (ev) this.applyDshEvent(sessionId, ev, data, seq, time);
    }
    // 确保 streaming 中没有残留的未完成消息
    const cur = this.streaming.get(sessionId);
    if (cur && cur.content.length > 0) {
      this.pushMessage(sessionId, cur);
      this.streaming.delete(sessionId);
    }
    this.notify();
  }

  /** 用 session.list 的结果全量替换会话列表（保留已存在会话的派生字段）。 */
  applySessionList(list: Array<Record<string, unknown>>): void {
    if (!Array.isArray(list)) return;
    const seen = new Set<string>();
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const id = str(rec.id) ?? str(rec.sessionId);
      if (!id) continue;
      // 兼容真实 DSH rc.7：title 在 projections.values.title，工作区在 cwd。
      const projections = isRecord(rec.projections) ? rec.projections as Record<string, unknown> : undefined;
      const values = projections && isRecord(projections.values) ? projections.values as Record<string, unknown> : undefined;
      const title = str(rec.title) ?? (values ? str(values.title) : undefined);
      const workspace = str(rec.workspace) ?? str(rec.cwd);
      const updatedAt = num(rec.updatedAt);
      const existing = this.sessions.get(id);
      // H1：服务器 updatedAt（毫秒）仅存为 serverUpdatedAt/updatedAt 展示值；
      // 排序字段 sortKey 只在 touchSession（实时活动）时推进，不再被服务器时间覆盖。
      const s = existing ?? this.touchSession(id);
      if (title !== undefined) s.title = title;
      if (workspace !== undefined) s.workspace = workspace;
      if (updatedAt !== undefined) {
        s.updatedAt = updatedAt;
        s.serverUpdatedAt = updatedAt;
      }
      if (values && isRecord(values.goal)) {
        const g = values.goal as Record<string, unknown>;
        const goalStatus = str(g.phase) ?? str(g.status);
        if (goalStatus !== undefined) s.goalStatus = goalStatus;
        const objective = str(g.objective);
        if (objective !== undefined) s.goalObjective = objective;
        const goalId = str(g.id);
        const goalRev = num(g.revision);
        if (goalId !== undefined && goalRev !== undefined) s.goalRef = { id: goalId, revision: goalRev };
      }
      if (values && isRecord(values.permissions)) {
        const perm = values.permissions as Record<string, unknown>;
        const current = str(perm.currentValue);
        if (current !== undefined) s.permissionCurrent = current;
        if (Array.isArray(perm.options)) {
          const options: string[] = [];
          for (const opt of perm.options) {
            const v = isRecord(opt) ? str(opt.value) : undefined;
            if (v) options.push(v);
          }
          if (options.length > 0) s.permissionOptions = options;
        }
      }
      if (values) {
        const limits = parseImageLimits(values.imageLimits);
        if (limits) s.imageLimits = limits;
      }
      seen.add(id);
    }
    for (const id of [...this.sessions.keys()]) {
      if (!seen.has(id)) {
        this.sessions.delete(id);
        this.transcripts.delete(id); // 孤儿转录一并清理（评审 #1）
        this.streaming.delete(id);
        this.steps.delete(id);
        this.queues.delete(id);
        this.jobs.delete(id);
        this.historySeqs.delete(id);
      }
    }
    this.notify();
  }

  /** 乐观更新 goal 状态（暂停/恢复后立即反映，下一条投影帧为准）。 */
  setGoalStatus(sessionId: string, status: string): void {
    const s = this.sessions.get(sessionId);
    if (!s) return;
    s.goalStatus = status;
    this.notify();
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  private touchSession(id: string): SessionSummary {
    const existing = this.sessions.get(id);
    const s: SessionSummary = existing ?? { id, updatedAt: 0 };
    // 严格单调递增，保证同一毫秒内的多次更新排序稳定。
    // sortKey 是排序唯一事实；updatedAt 保留旧字段（服务器 ms 或 tick）供视图兼容。
    this.tick += 1;
    s.sortKey = this.tick;
    s.updatedAt = this.tick;
    s.lastActiveAt = Date.now();
    this.sessions.set(id, s);
    return s;
  }

  private applyRegistry(f: Frame): void {
    const id = str(f.sessionId);
    if (!id) return;
    if (f.action === "removed") {
      this.sessions.delete(id);
      return;
    }
    const s = this.touchSession(id);
    const title = str(f.title);
    const workspace = str(f.workspace);
    if (title !== undefined) s.title = title;
    if (workspace !== undefined) s.workspace = workspace;
  }

  /** 原生 DSH session/queue 帧：替换当前会话的排队消息快照。 */
  private applyQueue(f: Frame): void {
    const id = str(f.sessionId);
    if (!id) return;
    if (!Array.isArray(f.items)) {
      this.queues.delete(id);
      return;
    }
    const items: QueueItem[] = [];
    for (const item of f.items) {
      if (!isRecord(item)) continue;
      const itemId = str(item.id);
      if (!itemId) continue;
      const message = isRecord(item.message) ? item.message : {};
      items.push({
        id: itemId,
        placement: str(item.placement) === "queued" || str(item.placement) === "context" ? (str(item.placement) as QueueItem["placement"]) : "steering",
        role: str(message.role) ?? "user",
        text: extractDshText(message.content) ?? "",
      });
    }
    this.queues.set(id, items);
    this.touchSession(id);
  }

  /** 原生 DSH session/jobs 帧：替换当前会话的后台任务快照。 */
  private applyJobs(f: Frame): void {
    const id = str(f.sessionId);
    if (!id) return;
    if (!Array.isArray(f.jobs)) {
      this.jobs.delete(id);
      return;
    }
    const items: JobInfo[] = [];
    for (const job of f.jobs) {
      if (!isRecord(job)) continue;
      const jobId = str(job.id);
      if (!jobId) continue;
      items.push({
        id: jobId,
        kind: str(job.kind) ?? "job",
        label: str(job.label) ?? jobId,
        status: (str(job.status) as JobInfo["status"]) ?? "running",
        detail: str(job.detail),
        startedAt: num(job.startedAt) ?? Date.now(),
        finishedAt: num(job.finishedAt),
      });
    }
    this.jobs.set(id, items);
    this.touchSession(id);
  }

  /** 原生 DSH host/session-added 帧：增量补一条会话摘要。 */
  private applyHostSessionAdded(f: Frame): void {
    const id = str(f.sessionId);
    if (!id) return;
    const existing = this.sessions.get(id);
    const s = existing ?? this.touchSession(id);
    const cwd = str(f.cwd);
    if (cwd !== undefined) s.workspace = cwd;
    if (f.blank === true && s.title === undefined) s.title = "新会话";
    if (f.origin === "subagent") s.workspace = s.workspace ?? "subagent";
  }

  private applyProjection(f: Frame): void {
    const id = str(f.sessionId);
    if (!id) return;
    const s = this.touchSession(id);

    // DSH Desktop：projection 帧是 { key, value } 形式。
    const key = str(f.key);
    if (key !== undefined) {
      this.applyProjectionValue(s, key, f.value);
      return;
    }

    // 旧 mock / 早期 fixture：字段平铺在帧上。
    const title = str(f.title);
    if (title !== undefined) s.title = title;

    const goal = f.goal as { status?: unknown; phase?: unknown; objective?: unknown; id?: unknown; revision?: unknown } | undefined;
    if (goal && typeof goal === "object") {
      const status = str(goal.phase) ?? str(goal.status);
      if (status !== undefined) s.goalStatus = status;
      const objective = str(goal.objective);
      if (objective !== undefined) s.goalObjective = objective;
      const goalId = str(goal.id);
      const goalRev = num(goal.revision);
      if (goalId !== undefined && goalRev !== undefined) s.goalRef = { id: goalId, revision: goalRev };
    }
    if (Array.isArray(f.todos)) {
      const todos: TranscriptTodo[] = [];
      for (const t of f.todos) {
        if (t && typeof t === "object") {
          const content = str((t as Record<string, unknown>).content);
          const status = str((t as Record<string, unknown>).status);
          if (content !== undefined && status !== undefined) {
            todos.push({ content, status });
          }
        }
      }
      if (todos.length > 0) s.todos = todos;
    }
    if (f.plan !== undefined) s.plan = f.plan;
    const usage = f.tokenUsage as { total?: unknown } | undefined;
    if (usage && typeof usage === "object") {
      const total = num(usage.total);
      if (total !== undefined) s.tokenUsageTotal = total;
    }
    const pressure = f.contextPressure as { percent?: unknown } | undefined;
    if (pressure && typeof pressure === "object") {
      const percent = num(pressure.percent);
      if (percent !== undefined) s.contextPercent = percent;
    }
  }

  private applyProjectionValue(s: SessionSummary, key: string, value: unknown): void {
    switch (key) {
      case "title":
        s.title = str(value) ?? s.title;
        break;
      case "goal": {
        if (!isRecord(value)) break;
        const status = str(value.phase) ?? str(value.status);
        if (status !== undefined) s.goalStatus = status;
        const objective = str(value.objective);
        if (objective !== undefined) s.goalObjective = objective;
        const goalId = str(value.id);
        const goalRev = num(value.revision);
        if (goalId !== undefined && goalRev !== undefined) s.goalRef = { id: goalId, revision: goalRev };
        break;
      }
      case "todos": {
        if (!Array.isArray(value)) break;
        const todos: TranscriptTodo[] = [];
        for (const t of value) {
          if (!isRecord(t)) continue;
          const content = str(t.content);
          const status = str(t.status);
          if (content !== undefined && status !== undefined) {
            todos.push({ content, status });
          }
        }
        if (todos.length > 0) s.todos = todos;
        break;
      }
      case "tokenUsage": {
        if (!isRecord(value)) break;
        const total = num(value.total);
        if (total !== undefined) s.tokenUsageTotal = total;
        break;
      }
      case "contextPressure": {
        if (!isRecord(value)) break;
        const percent = num(value.percent);
        if (percent !== undefined) s.contextPercent = percent;
        break;
      }
      case "plan":
        s.plan = value;
        break;
      case "permissions": {
        if (!isRecord(value)) break;
        const current = str(value.currentValue);
        if (current !== undefined) s.permissionCurrent = current;
        if (Array.isArray(value.options)) {
          const options: string[] = [];
          for (const opt of value.options) {
            const v = isRecord(opt) ? str(opt.value) : undefined;
            if (v) options.push(v);
          }
          if (options.length > 0) s.permissionOptions = options;
        }
        break;
      }
      case "imageLimits": {
        const limits = parseImageLimits(value);
        if (limits) s.imageLimits = limits;
        break;
      }
      default:
        break;
    }
  }

  private applyEvent(f: Frame): void {
    const id = str(f.sessionId);
    if (!id) return;
    this.touchSession(id); // 会话列表随活动自动出现（即使没有注册表帧）

    // DSH Desktop / 新版宿主：event 是 { type, seq, time, data } 对象。
    if (isRecord(f.event)) {
      // H2：实时事件带 seq 时登记到 historySeqs，后续重载历史可跳过同一 seq。
      const seq = num(f.event.seq);
      if (seq !== undefined) {
        const seen = this.historySeqs.get(id) ?? new Set<number>();
        this.historySeqs.set(id, seen);
        if (seen.has(seq)) return;
        seen.add(seq);
      }
      const ev = str(f.event.type);
      const time = num(f.event.time);
      if (ev) this.applyDshEvent(id, ev, f.event.data, seq, time);
      return;
    }

    // 旧 mock / 早期 fixture：event 是字符串，消息体在 f.message。
    const ev = str(f.event);
    if (!ev) return;
    const msg = f.message as Record<string, unknown> | undefined;

    switch (ev) {
      case "turn/start": {
        // 新回合开始：若上一回合残留未完成消息 → 视为间隙
        const leftover = this.streaming.get(id);
        if (leftover && leftover.content.length > 0) {
          this.pushMessage(id, { role: leftover.role, content: "…（间隙：消息流中断）", gap: true });
        }
        this.streaming.delete(id);
        break;
      }
      case "gap": {
        const cur = this.streaming.get(id);
        if (cur) cur.interrupted = true;
        this.pushMessage(id, { role: "system", content: "…（间隙：消息流缺失）", gap: true });
        this.streaming.delete(id);
        break;
      }
      case "message/delta": {
        if (!msg) break;
        const mid = str(msg.id);
        const cur = this.streaming.get(id);
        const delta = str(msg.delta) ?? "";
        if (cur && mid !== undefined && cur.id === mid) {
          cur.content += delta;
        } else {
          this.streaming.set(id, {
            id: mid,
            role: str(msg.role) ?? "assistant",
            content: delta,
          });
        }
        break;
      }
      case "message/complete": {
        if (!msg) break;
        const final: TranscriptMessage = {
          id: str(msg.id),
          role: str(msg.role) ?? "assistant",
          content: str(msg.content) ?? str(msg.delta) ?? "",
          ...(msg.interrupted === true ? { interrupted: true } : {}),
        };
        this.pushMessage(id, final);
        this.streaming.delete(id);
        break;
      }
      case "interrupted": {
        const cur = this.streaming.get(id);
        if (cur) cur.interrupted = true;
        break;
      }
      case "turn/complete": {
        const cur = this.streaming.get(id);
        if (cur) {
          this.pushMessage(id, cur);
          this.streaming.delete(id);
        }
        break;
      }
      default:
        break;
    }
  }

  /** DSH Desktop 事件折叠：user/message、assistant/chunk、assistant/message、turn/*。 */
  private applyDshEvent(id: string, ev: string, data: unknown, seq?: number, time?: number): void {
    if (
      ev === "turn/start" ||
      ev === "turn/complete" ||
      ev === "step/end" ||
      ev === "tool/call" ||
      ev === "tool/result"
    ) {
      this.steps.set(id, applyStepEvent(this.steps.get(id) ?? [], ev, data));
    }
    switch (ev) {
      case "turn/start": {
        const leftover = this.streaming.get(id);
        if (leftover && leftover.content.length > 0) {
          this.pushMessage(id, { role: leftover.role, content: "…（间隙：消息流中断）", gap: true });
        }
        this.streaming.delete(id);
        break;
      }
      case "user/message": {
        const text = extractDshText(data);
        const images = extractDshImages(data);
        if (text.length > 0 || images.length > 0) {
          this.pushMessage(id, {
            role: "user",
            content: text,
            ...(images.length > 0 ? { images } : {}),
            ...(seq !== undefined ? { seq } : {}),
            ...(time !== undefined ? { ts: time } : {}),
          });
        }
        break;
      }
      case "assistant/chunk": {
        const chunk = isRecord(data) ? data.chunk : undefined;
        if (!isRecord(chunk)) break;
        const chunkType = str(chunk.type);
        const cur0 = this.streaming.get(id);
        const ensureSeq = (m: TranscriptMessage) => {
          if (seq !== undefined && m.seq === undefined) m.seq = seq;
        };
        const ensureTs = (m: TranscriptMessage) => {
          if (time !== undefined && m.ts === undefined) m.ts = time;
        };
        if (chunkType === "reasoning-delta") {
          const delta = str(chunk.text) ?? str(chunk.delta) ?? "";
          if (cur0) {
            ensureSeq(cur0);
            ensureTs(cur0);
            cur0.thinking = `${cur0.thinking ?? ""}${delta}`;
          } else {
            this.streaming.set(id, { role: "assistant", content: "", thinking: delta, ...(seq !== undefined ? { seq } : {}), ...(time !== undefined ? { ts: time } : {}) });
          }
        } else if (chunkType === "block-start" && str(chunk.blockType) === "reasoning") {
          if (cur0) {
            ensureSeq(cur0);
            ensureTs(cur0);
            if (cur0.thinking === undefined) cur0.thinking = "";
          } else {
            this.streaming.set(id, { role: "assistant", content: "", thinking: "", ...(seq !== undefined ? { seq } : {}), ...(time !== undefined ? { ts: time } : {}) });
          }
        } else if (chunkType === "text-delta" || chunkType === "text") {
          const delta = str(chunk.text) ?? str(chunk.delta) ?? "";
          if (cur0) {
            ensureSeq(cur0);
            ensureTs(cur0);
            cur0.content += delta;
          } else {
            this.streaming.set(id, { role: "assistant", content: delta, ...(seq !== undefined ? { seq } : {}), ...(time !== undefined ? { ts: time } : {}) });
          }
        }
        break;
      }
      case "assistant/message": {
        const message = isRecord(data) ? data.message : undefined;
        const text = extractDshText(message);
        const images = extractDshImages(data);
        const live = this.streaming.get(id);
        if (text.length > 0 || images.length > 0) {
          this.pushMessage(id, {
            role: "assistant",
            content: text,
            ...(live?.thinking !== undefined ? { thinking: live.thinking } : {}),
            ...(images.length > 0 ? { images } : {}),
            ...(seq !== undefined ? { seq } : {}),
            ...(time !== undefined ? { ts: time } : {}),
          });
        } else if (live && live.content.length > 0) {
          this.pushMessage(id, live);
        }
        this.streaming.delete(id);
        break;
      }
      case "tool/call": {
        // 原生 DSH：工具调用事件，折叠为一条紧凑的 tool 转录消息。
        if (!isRecord(data)) break;
        const name = str(data.name) ?? "tool";
        const callId = str(data.callId);
        const args = isRecord(data.arguments) ? JSON.stringify(data.arguments) : str(data.arguments);
        const argsText = args && args.length > 0 ? ` ${args.slice(0, 120)}${args.length > 120 ? "…" : ""}` : "";
        this.pushMessage(id, {
          id: callId,
          role: "tool",
          content: `工具调用 · ${name}${argsText}`,
          ...(seq !== undefined ? { seq } : {}),
          ...(time !== undefined ? { ts: time } : {}),
        });
        break;
      }
      case "tool/result": {
        if (!isRecord(data)) break;
        const message = isRecord(data.message) ? data.message : data;
        const text = extractDshText(message);
        const truncated = text.length > 240 ? `${text.slice(0, 240)}…` : text;
        if (truncated.length > 0) {
          this.pushMessage(id, { role: "tool", content: `工具结果 · ${truncated}`, ...(seq !== undefined ? { seq } : {}), ...(time !== undefined ? { ts: time } : {}) });
        }
        break;
      }
      case "session/title": {
        const title = str(data);
        if (title) {
          const s = this.sessions.get(id);
          if (s) {
            s.title = title;
            s.lastMessage = title;
          }
        }
        break;
      }
      case "turn/complete":
      case "turn/end":
      case "step/end": {
        const cur = this.streaming.get(id);
        if (cur) {
          this.pushMessage(id, cur);
          this.streaming.delete(id);
        }
        break;
      }
      case "interrupted": {
        const cur = this.streaming.get(id);
        if (cur) cur.interrupted = true;
        break;
      }
      default:
        break;
    }
  }

  private applyServerRequest(f: Frame): void {
    const rpcId = str(f.rpcId);
    const kind = str(f.kind);
    if (!rpcId || !kind) return;
    this.pending.set(rpcId, { rpcId, kind, payload: f.payload, receivedAt: Date.now() });
  }

  private applyApprovalRequested(f: Frame): void {
    const rpcId = str(f.rpcId);
    const approvalId = str(f.approvalId);
    const sessionId = str(f.sessionId);
    if (!rpcId || !approvalId || !sessionId) return;
    this.pending.set(rpcId, {
      rpcId,
      kind: "approval",
      payload: {
        approvalId,
        sessionId,
        prompt: str(f.reason) ?? str(f.toolName) ?? "允许执行？",
        command: str(f.toolName) ?? undefined,
      },
      receivedAt: Date.now(),
    });
  }

  private applyQuestionRequested(f: Frame): void {
    const rpcId = str(f.rpcId);
    const sessionId = str(f.sessionId);
    const questions = Array.isArray(f.questions) ? f.questions : [];
    if (!rpcId || !sessionId || questions.length === 0) return;
    const first = isRecord(questions[0]) ? questions[0] as Record<string, unknown> : {};
    this.pending.set(rpcId, {
      rpcId,
      kind: "question",
      payload: {
        sessionId,
        questions,
        question: str(first.question) ?? str(first.id) ?? "请回答",
      },
      receivedAt: Date.now(),
    });
  }

  private pushMessage(sessionId: string, m: TranscriptMessage): void {
    const list = this.transcripts.get(sessionId) ?? [];
    list.push(m);
    this.transcripts.set(sessionId, list);
    const s = this.touchSession(sessionId); // 保持 updatedAt 单调（tick 尺度）
    if (m.images && m.images.length > 0) {
      s.lastMessage = m.content.length > 0 ? `[图片] ${m.content}` : "[图片]";
    } else {
      s.lastMessage = m.content || s.lastMessage;
    }
  }
}
