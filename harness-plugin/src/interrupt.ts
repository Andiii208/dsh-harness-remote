/**
 * Phase 1 接线桩：DSH 宿主侧暂无 `session.interrupt` 协议实现。
 *
 * 用途：宿主若实现 `/api/session.interrupt`，可在接入点调用
 * `validateInterruptPayload` 完成入参校验，并按 DSH unary 约定
 * 返回 `{ rpcId, ok: true, result: { interrupted: true } }`。
 *
 * 注意：本文件只是接线桩——校验入参并给出可复用的响应构造，
 * 不包含真实的中断执行逻辑（需要宿主提供 token 取消/进程信号）。
 */

export type InterruptPayloadCheck =
  | { ok: true; sessionId: string }
  | { ok: false; code: string; message: string };

export function validateInterruptPayload(payload: unknown): InterruptPayloadCheck {
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, code: "BAD_REQUEST", message: "payload must be an object" };
  }
  const sessionId = (payload as { sessionId?: unknown }).sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return { ok: false, code: "BAD_REQUEST", message: "sessionId is required" };
  }
  return { ok: true, sessionId };
}

export function buildInterruptResult(): { interrupted: true } {
  return { interrupted: true };
}
