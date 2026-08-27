import { describe, expect, it } from "vitest";
import { GoalsClient, type GoalRef } from "../src/data/goals";

const ref: GoalRef = { id: "g1", revision: 3 };

describe("GoalsClient", () => {
  it("create calls goal.create and returns ref", async () => {
    const calls: Array<{ method: string; payload: unknown }> = [];
    const client = new GoalsClient({
      async unary(method, payload) {
        calls.push({ method, payload });
        return { ok: true, result: { ref: { id: "g1", revision: 1 } } };
      },
    });
    const created = await client.create("s1", "部署", 5);
    expect(created).toEqual({ id: "g1", revision: 1 });
    expect(calls[0]).toMatchObject({ method: "goal.create", payload: { sessionId: "s1", objective: "部署", maxGoalRounds: 5 } });
  });

  it("create returns null on failure", async () => {
    const client = new GoalsClient({
      async unary() {
        return { ok: false, error: { code: "INTERNAL", message: "x" } };
      },
    });
    expect(await client.create("s1", "部署")).toBeNull();
  });

  it("pause/resume/complete/clear call native goal.* with sessionId+ref", async () => {
    const calls: Array<{ method: string; payload: unknown }> = [];
    const client = new GoalsClient({
      async unary(method, payload) {
        calls.push({ method, payload });
        return { ok: true, result: { ref } };
      },
    });
    expect(await client.pause("s1", ref)).toBe(true);
    expect(await client.resume("s1", ref)).toBe(true);
    expect(await client.complete("s1", ref)).toBe(true);
    expect(await client.clear("s1", ref)).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["goal.pause", "goal.resume", "goal.complete", "goal.clear"]);
    expect(calls[0]?.payload).toMatchObject({ sessionId: "s1", ref });
  });

  it("edit calls goal.edit with patch", async () => {
    const calls: Array<{ method: string; payload: unknown }> = [];
    const client = new GoalsClient({
      async unary(method, payload) {
        calls.push({ method, payload });
        return { ok: true, result: { ref: { id: "g1", revision: 4 } } };
      },
    });
    expect(await client.edit("s1", ref, { objective: "新目标" })).toBe(true);
    expect(calls[0]).toMatchObject({ method: "goal.edit", payload: { sessionId: "s1", ref, objective: "新目标" } });
  });

  it("returns false on error without throwing", async () => {
    const client = new GoalsClient({
      async unary() {
        return { ok: false, error: { code: "INTERNAL", message: "x" } };
      },
    });
    expect(await client.pause("s1", ref)).toBe(false);
  });
});
