/**
 * GoalsClient — goals/* typert 网关调用（契约见 mock-harness fixtures/goals.json）。
 * 纯 TS：通过注入的 call 函数调用，宽容解析结果。
 */

export interface GoalTodo {
  content: string;
  status: string;
}

export interface Goal {
  id: string;
  objective?: string;
  status?: string;
  todos?: GoalTodo[];
}

export interface GoalsApi {
  call(namespace: string, method: string, payload: unknown): Promise<{
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

function readGoals(result: unknown): Goal[] {
  const goals = asRecord(result).goals;
  if (!Array.isArray(goals)) return [];
  const out: Goal[] = [];
  for (const g of goals) {
    const rec = asRecord(g);
    const id = typeof rec.id === "string" ? rec.id : undefined;
    if (!id) continue;
    const todos = Array.isArray(rec.todos)
      ? rec.todos
          .map((t) => {
            const tr = asRecord(t);
            return typeof tr.content === "string" && typeof tr.status === "string"
              ? { content: tr.content, status: tr.status }
              : null;
          })
          .filter((t): t is GoalTodo => t !== null)
      : undefined;
    out.push({
      id,
      ...(typeof rec.objective === "string" ? { objective: rec.objective } : {}),
      ...(typeof rec.status === "string" ? { status: rec.status } : {}),
      ...(todos !== undefined ? { todos } : {}),
    });
  }
  return out;
}

export class GoalsClient {
  constructor(private readonly api: GoalsApi) {}

  async list(): Promise<Goal[]> {
    const res = await this.api.call("goals", "list", {});
    if (!res.ok) return [];
    return readGoals(res.result);
  }

  async pause(id: string): Promise<boolean> {
    const res = await this.api.call("goals", "pause", { id });
    return res.ok;
  }

  async resume(id: string): Promise<boolean> {
    const res = await this.api.call("goals", "resume", { id });
    return res.ok;
  }
}
