/**
 * SessionStore — 会话镜像折叠（纯 TS，零 RN 依赖，可单测）。
 * 将下行帧增量折叠为：会话摘要（含投影派生）、转录消息、待应答请求。
 * 未知/无法识别的帧一律忽略（宽容）。
 */

import type { DownlinkFrame } from "@dsh-remote/protocol";

export interface SessionSummary {
  id: string;
  title?: string;
  workspace?: string;
  lastMessage?: string;
  updatedAt: number;
  goalStatus?: string;
  goalObjective?: string;
  todos?: TranscriptTodo[];
  plan?: unknown;
  tokenUsageTotal?: number;
  contextPercent?: number;
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
}

export interface PendingRequest {
  rpcId: string;
  kind: string;
  payload: unknown;
  receivedAt: number;
}

type Frame = DownlinkFrame & Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

export class SessionStore {
  private sessions = new Map<string, SessionSummary>();
  private transcripts = new Map<string, TranscriptMessage[]>();
  private pending = new Map<string, PendingRequest>();
  private streaming = new Map<string, TranscriptMessage>();
  private listeners = new Set<() => void>();
  private tick = 0;

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
      case "server/request":
        this.applyServerRequest(f);
        break;
      default:
        return; // unknown / queue / task / host — 忽略
    }
    this.notify();
  }

  getSessions(): SessionSummary[] {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getTranscript(sessionId: string): TranscriptMessage[] {
    return this.transcripts.get(sessionId) ?? [];
  }

  getPendingRequests(): PendingRequest[] {
    return [...this.pending.values()].sort((a, b) => a.receivedAt - b.receivedAt);
  }

  getPendingRequest(rpcId: string): PendingRequest | undefined {
    return this.pending.get(rpcId);
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
    this.notify();
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  private touchSession(id: string): SessionSummary {
    const existing = this.sessions.get(id);
    const s: SessionSummary = existing ?? { id, updatedAt: 0 };
    // 严格单调递增，保证同一毫秒内的多次更新排序稳定
    this.tick += 1;
    s.updatedAt = this.tick;
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

  private applyProjection(f: Frame): void {
    const id = str(f.sessionId);
    if (!id) return;
    const s = this.touchSession(id);
    const title = str(f.title);
    if (title !== undefined) s.title = title;

    const goal = f.goal as { status?: unknown; objective?: unknown } | undefined;
    if (goal && typeof goal === "object") {
      const status = str(goal.status);
      if (status !== undefined) s.goalStatus = status;
      const objective = str(goal.objective);
      if (objective !== undefined) s.goalObjective = objective;
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

  private applyEvent(f: Frame): void {
    const id = str(f.sessionId);
    if (!id) return;
    this.touchSession(id); // 会话列表随活动自动出现（即使没有注册表帧）
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

  private applyServerRequest(f: Frame): void {
    const rpcId = str(f.rpcId);
    const kind = str(f.kind);
    if (!rpcId || !kind) return;
    this.pending.set(rpcId, { rpcId, kind, payload: f.payload, receivedAt: Date.now() });
  }

  private pushMessage(sessionId: string, m: TranscriptMessage): void {
    const list = this.transcripts.get(sessionId) ?? [];
    list.push(m);
    this.transcripts.set(sessionId, list);
    const s = this.touchSession(sessionId); // 保持 updatedAt 单调（tick 尺度）
    s.lastMessage = m.content || s.lastMessage;
  }
}
