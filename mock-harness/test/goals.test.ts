import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { afterEach } from "vitest";
import { createMockHarness, type MockHarness } from "../src/index.js";
import { loadFixtureDir } from "../src/fixture-loader.js";

const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));
const harnesses: MockHarness[] = [];
afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((h) => h.stop()));
});

async function goalHarness(): Promise<MockHarness> {
  const all = await loadFixtureDir(fixturesDir);
  const selected = all.filter((f) => JSON.stringify(f).includes("goals/list"));
  if (selected.length === 0) throw new Error("no goal fixture");
  const h = await createMockHarness(selected, { port: 0 });
  await h.start();
  harnesses.push(h);
  return h;
}

describe("goals fixture contract", () => {
  it("passes capture validation", async () => {
    const sets = await loadFixtureDir(fixturesDir);
    const goal = sets.find((f) => JSON.stringify(f).includes("goals/list"));
    expect(goal).toBeDefined();
    expect(goal?.unaryResponses.map((u) => u.method)).toEqual(["goals/list", "goals/pause", "goals/resume"]);
  });

  it("replays goal.list with rpcId echo", async () => {
    const h = await goalHarness();
    const res = await fetch(`${h.url}/api/goals/list`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rpcId: "abc", method: "goal.list", payload: {} }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ rpcId: "abc", ok: true });
    const goals = ((body.result as { goals?: unknown })?.goals ?? []) as Array<Record<string, unknown>>;
    expect(goals[0]).toMatchObject({ id: "g1", status: "active" });
  });

  it("replays goal.pause with requestPayload matching", async () => {
    const h = await goalHarness();
    const res = await fetch(`${h.url}/api/goals/pause`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rpcId: "r1", method: "goal.pause", payload: { id: "g1" } }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: true, result: { id: "g1", status: "paused" } });
  });
});
