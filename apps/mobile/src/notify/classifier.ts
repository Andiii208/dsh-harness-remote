/**
 * NotificationClassifier — 把下行帧归类为通知事件（turn 完成 / goal 完成
 * 或受阻 / 审批等待 / 提问等待），按去重键去重。纯 TS，可单测。
 */

import type { DownlinkFrame } from "@dsh-remote/protocol";

export type NotificationKind =
  | "turn-complete"
  | "goal-complete"
  | "goal-blocked"
  | "approval-waiting"
  | "question-waiting"
  | "context-pressure";

export interface NotificationEvent {
  kind: NotificationKind;
  sessionId?: string;
  rpcId?: string;
  prompt?: string;
  /** 上下文用量百分比（context-pressure 事件）。 */
  percent?: number;
  /** 进入应用内事件列表的时间戳。 */
  receivedAt?: number;
  /** 去重键：同一键的同类事件不重复通知。 */
  dedupeKey: string;
}

type Frame = DownlinkFrame & Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export class NotificationClassifier {
  private seen = new Map<string, string>();
  private static readonly MAX_KEYS = 500;

  /** 返回需要通知的事件；无需通知返回 null。 */
  classify(frame: DownlinkFrame): NotificationEvent | null {
    if (!frame || typeof frame !== "object") return null; // 宽容：垃圾输入忽略
    const f = frame as Frame;
    if (f.type === "unknown") return null;

    if (f.type === "server/request") {
      const rpcId = str(f.rpcId);
      const kind = str(f.kind);
      if (!rpcId || !kind) return null;
      const payload = (f.payload ?? {}) as Record<string, unknown>;
      if (kind === "approval") {
        return this.approval(rpcId, str(payload.prompt) ?? str(payload.command));
      }
      if (kind === "question") {
        return this.question(rpcId, str(payload.question));
      }
      return null;
    }

    // 真实 DSH 也会直接发 approval/requested / question/requested 帧。
    if (f.type === "approval/requested") {
      const rpcId = str(f.rpcId);
      if (!rpcId) return null;
      return this.approval(rpcId, str(f.reason) ?? str(f.toolName));
    }
    if (f.type === "question/requested") {
      const rpcId = str(f.rpcId);
      if (!rpcId) return null;
      const questions = Array.isArray(f.questions) ? f.questions : [];
      const first = typeof questions[0] === "object" && questions[0] !== null ? (questions[0] as Record<string, unknown>) : {};
      return this.question(rpcId, str(first.question) ?? str(first.id));
    }

    if (f.type === "session/event") {
      const sessionId = str(f.sessionId);

      // Desktop / 新版宿主：event 是 { type, seq, time, data } 对象。
      if (f.event && typeof f.event === "object") {
        const evObj = f.event as Record<string, unknown>;
        const ev = str(evObj.type);
        if (ev !== "turn/complete") return null;
        const data = typeof evObj.data === "object" && evObj.data !== null ? (evObj.data as Record<string, unknown>) : {};
        const seq = typeof evObj.seq === "number" ? evObj.seq : undefined;
        const turnId = str(data.id) ?? str(data.turnId) ?? (typeof data.turn === "object" && data.turn !== null ? str((data.turn as Record<string, unknown>).id) : undefined) ?? (seq !== undefined ? `seq:${seq}` : undefined);
        if (!turnId) return null;
        const key = `turn:${sessionId}:${turnId}`;
        if (this.seen.get(key) === turnId) return null;
        this.markSeen(key, turnId);
        return { kind: "turn-complete", sessionId, dedupeKey: key };
      }

      // 旧 mock / 早期 fixture：event 是字符串。
      const ev = str(f.event);
      if (ev === "turn/complete") {
        const turn = f.turn as { id?: unknown } | undefined;
        const turnId = turn && typeof turn === "object" ? str(turn.id) : undefined;
        if (!turnId) return null; // 无 id 不通知（避免刷屏）
        const key = `turn:${sessionId}:${turnId}`;
        if (this.seen.get(key) === turnId) return null;
        this.markSeen(key, turnId);
        return { kind: "turn-complete", sessionId, dedupeKey: key };
      }
      return null;
    }

    if (f.type === "session/projection") {
      const sessionId = str(f.sessionId);

      // Desktop：projection 帧是 { key, value } 形式。
      const key = str(f.key);
      if (key !== undefined) {
        if (key === "goal") {
          const goal = typeof f.value === "object" && f.value !== null ? (f.value as Record<string, unknown>) : {};
          const status = str(goal.phase) ?? str(goal.status);
          if (!sessionId || !status) return null;
          if (status === "complete") {
            const k = `goal:complete:${sessionId}`;
            if (this.seen.get(k) === status) return null;
            this.markSeen(k, status);
            return { kind: "goal-complete", sessionId, dedupeKey: k };
          }
          if (status === "blocked") {
            const k = `goal:blocked:${sessionId}`;
            if (this.seen.get(k) === status) return null;
            this.markSeen(k, status);
            return { kind: "goal-blocked", sessionId, dedupeKey: k };
          }
          return null;
        }
        if (key === "contextPressure") {
          const pressure = typeof f.value === "object" && f.value !== null ? (f.value as Record<string, unknown>) : {};
          const percent = typeof pressure.percent === "number" ? pressure.percent : undefined;
          if (!sessionId || percent === undefined || percent < 85) return null;
          const k = `context:high:${sessionId}`;
          if (this.seen.get(k) === "high") return null;
          this.markSeen(k, "high");
          return { kind: "context-pressure", sessionId, percent, dedupeKey: k };
        }
        return null;
      }

      // 旧 mock / 早期 fixture：字段平铺在帧上。
      const goal = f.goal as { status?: unknown } | undefined;
      const status = goal && typeof goal === "object" ? str(goal.status) : undefined;
      if (!sessionId || !status) return null;
      if (status === "complete") {
        const k = `goal:complete:${sessionId}`;
        if (this.seen.get(k) === status) return null;
        this.markSeen(k, status);
        return { kind: "goal-complete", sessionId, dedupeKey: k };
      }
      if (status === "blocked") {
        const k = `goal:blocked:${sessionId}`;
        if (this.seen.get(k) === status) return null;
        this.markSeen(k, status);
        return { kind: "goal-blocked", sessionId, dedupeKey: k };
      }
      return null;
    }

    return null;
  }

  private approval(rpcId: string, prompt: string | undefined): NotificationEvent | null {
    const key = `approval:${rpcId}`;
    if (this.seen.get(key) === rpcId) return null;
    this.markSeen(key, rpcId);
    return {
      kind: "approval-waiting",
      rpcId,
      prompt,
      dedupeKey: key,
    };
  }

  private question(rpcId: string, prompt: string | undefined): NotificationEvent | null {
    const key = `question:${rpcId}`;
    if (this.seen.get(key) === rpcId) return null;
    this.markSeen(key, rpcId);
    return {
      kind: "question-waiting",
      rpcId,
      prompt,
      dedupeKey: key,
    };
  }

  private markSeen(key: string, value: string): void {
    if (this.seen.size >= NotificationClassifier.MAX_KEYS) {
      // 有界去重：超限时丢弃最早的一条
      const first = this.seen.keys().next().value;
      if (first !== undefined) this.seen.delete(first);
    }
    this.seen.set(key, value);
  }
}
