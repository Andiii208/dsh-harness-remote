/**
 * GoalsClient — 原生 DSH goal.* RPC 封装（goal.create/edit/pause/resume/complete/clear）。
 * 纯 TS：通过注入的 unary 调用，宽容解析结果。旧 mock 的 goals/* typert 契约已废弃。
 */

export interface GoalRef {
  id: string;
  revision: number;
}

export interface Goal {
  id: string;
  revision: number;
  objective?: string;
  /** 原生 GoalView 用 phase（active/paused/blocked/complete）。 */
  phase?: string;
  status?: string;
  todos?: Array<{ content: string; status: string }>;
}

export interface GoalsApi {
  /** 直接调用 DSH unary RPC（方法名如 goal.create）。 */
  unary(method: string, payload: unknown): Promise<{
    ok: boolean;
    result?: unknown;
    error?: { code?: string; message?: string };
  }>;
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function readRef(result: unknown): GoalRef | null {
  const rec = asRecord(result);
  const id = typeof rec.id === "string" ? rec.id : undefined;
  const revision = typeof rec.revision === "number" ? rec.revision : undefined;
  if (!id || revision === undefined) return null;
  return { id, revision };
}

export class GoalsClient {
  constructor(private readonly api: GoalsApi) {}

  private async call(method: string, payload: unknown): Promise<{ ok: boolean; result?: unknown }> {
    const res = await this.api.unary(method, payload);
    if (!res.ok) return { ok: false, result: res.error };
    return { ok: true, result: res.result };
  }

  /** goal.create → { ref }。 */
  async create(sessionId: string, objective: string, maxGoalRounds?: number): Promise<GoalRef | null> {
    const res = await this.call("goal.create", {
      sessionId,
      objective,
      ...(maxGoalRounds !== undefined ? { maxGoalRounds } : {}),
    });
    if (!res.ok) return null;
    const ref = readRef((res.result as Record<string, unknown> | undefined)?.ref);
    if (ref) return ref;
    return readRef(res.result);
  }

  /** goal.edit → 成功返回 true。 */
  async edit(sessionId: string, ref: GoalRef, patch: { objective?: string; maxGoalRounds?: number }): Promise<boolean> {
    const res = await this.call("goal.edit", { sessionId, ref, ...patch });
    return res.ok;
  }

  async pause(sessionId: string, ref: GoalRef): Promise<boolean> {
    const res = await this.call("goal.pause", { sessionId, ref });
    return res.ok;
  }

  async resume(sessionId: string, ref: GoalRef): Promise<boolean> {
    const res = await this.call("goal.resume", { sessionId, ref });
    return res.ok;
  }

  async complete(sessionId: string, ref: GoalRef): Promise<boolean> {
    const res = await this.call("goal.complete", { sessionId, ref });
    return res.ok;
  }

  async clear(sessionId: string, ref: GoalRef): Promise<boolean> {
    const res = await this.call("goal.clear", { sessionId, ref });
    return res.ok;
  }
}
