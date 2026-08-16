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
  | "question-waiting";

export interface NotificationEvent {
  kind: NotificationKind;
  sessionId?: string;
  rpcId?: string;
  prompt?: string;
  /** 去重键：同一键的同类事件不重复通知。 */
  dedupeKey: string;
}

type Frame = DownlinkFrame & Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export class NotificationClassifier {
  private seen = new Map<string, string>();

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
        const key = `approval:${rpcId}`;
        if (this.seen.get(key) === rpcId) return null;
        this.seen.set(key, rpcId);
        return {
          kind: "approval-waiting",
          rpcId,
          prompt: str(payload.prompt) ?? str(payload.command),
          dedupeKey: key,
        };
      }
      if (kind === "question") {
        const key = `question:${rpcId}`;
        if (this.seen.get(key) === rpcId) return null;
        this.seen.set(key, rpcId);
        return {
          kind: "question-waiting",
          rpcId,
          prompt: str(payload.question),
          dedupeKey: key,
        };
      }
      return null;
    }

    if (f.type === "session/event") {
      const sessionId = str(f.sessionId);
      const ev = str(f.event);
      if (ev === "turn/complete") {
        const turn = f.turn as { id?: unknown } | undefined;
        const turnId = turn && typeof turn === "object" ? str(turn.id) : undefined;
        if (!turnId) return null; // 无 id 不通知（避免刷屏）
        const key = `turn:${sessionId}:${turnId}`;
        if (this.seen.get(key) === turnId) return null;
        this.seen.set(key, turnId);
        return { kind: "turn-complete", sessionId, dedupeKey: key };
      }
      return null;
    }

    if (f.type === "session/projection") {
      const sessionId = str(f.sessionId);
      const goal = f.goal as { status?: unknown } | undefined;
      const status = goal && typeof goal === "object" ? str(goal.status) : undefined;
      if (!sessionId || !status) return null;
      if (status === "complete") {
        const key = `goal:complete:${sessionId}`;
        if (this.seen.get(key) === status) return null;
        this.seen.set(key, status);
        return { kind: "goal-complete", sessionId, dedupeKey: key };
      }
      if (status === "blocked") {
        const key = `goal:blocked:${sessionId}`;
        if (this.seen.get(key) === status) return null;
        this.seen.set(key, status);
        return { kind: "goal-blocked", sessionId, dedupeKey: key };
      }
      return null;
    }

    return null;
  }
}
