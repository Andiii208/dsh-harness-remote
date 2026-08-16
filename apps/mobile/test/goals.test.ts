import { describe, expect, it } from "vitest";
import { GoalsClient, type GoalsApi } from "../src/data/goals";

function stubApi(handler: (ns: string, method: string, payload: unknown) => unknown): GoalsApi {
  return {
    async call(ns, method, payload) {
      return { ok: true, result: handler(ns, method, payload) };
    },
  };
}

describe("GoalsClient", () => {
  it("lists goals with lenient parsing", async () => {
    const api = stubApi(() => ({
      goals: [
        { id: "g1", objective: "部署", status: "active", todos: [{ content: "a", status: "completed" }] },
        { id: "g2", status: "paused" },
        { junk: true }, // 宽容跳过
      ],
    }));
    const client = new GoalsClient(api);
    const goals = await client.list();
    expect(goals).toHaveLength(2);
    expect(goals[0]).toMatchObject({ id: "g1", objective: "部署", status: "active", todos: [{ content: "a", status: "completed" }] });
    expect(goals[1]).toMatchObject({ id: "g2", status: "paused" });
  });

  it("returns [] when list fails or result is garbage", async () => {
    const fail = new GoalsClient({
      async call() {
        return { ok: false, error: { code: "NOT_FOUND", message: "no" } };
      },
    });
    expect(await fail.list()).toEqual([]);

    const garbage = new GoalsClient({
      async call() {
        return { ok: true, result: "nope" };
      },
    });
    expect(await garbage.list()).toEqual([]);
  });

  it("pause/resume call goals/<method> with id and report ok", async () => {
    const calls: Array<{ ns: string; method: string; payload: unknown }> = [];
    const client = new GoalsClient({
      async call(ns, method, payload) {
        calls.push({ ns, method, payload });
        return { ok: true, result: { id: (payload as { id: string }).id, status: "paused" } };
      },
    });
    expect(await client.pause("g1")).toBe(true);
    expect(calls[0]).toMatchObject({ ns: "goals", method: "pause", payload: { id: "g1" } });
    expect(await client.resume("g1")).toBe(true);
    expect(calls[1]).toMatchObject({ ns: "goals", method: "resume" });
  });

  it("pause returns false on error (no throw)", async () => {
    const client = new GoalsClient({
      async call() {
        return { ok: false, error: { code: "INTERNAL", message: "x" } };
      },
    });
    expect(await client.pause("g1")).toBe(false);
  });
});
