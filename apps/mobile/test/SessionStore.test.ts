import { describe, expect, it } from "vitest";
import { SessionStore } from "../src/data/SessionStore.js";

function frame(type: string, extra: Record<string, unknown> = {}): unknown {
  return { type, ...extra };
}

describe("SessionStore", () => {
  it("tracks session registry add/remove", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/registry", { action: "added", sessionId: "s1", title: "deploy", workspace: "D:\\app" }) as never);
    expect(s.getSessions()).toHaveLength(1);
    expect(s.getSessions()[0]).toMatchObject({ id: "s1", title: "deploy" });

    s.applyFrame(frame("session/registry", { action: "removed", sessionId: "s1" }) as never);
    expect(s.getSessions()).toHaveLength(0);
  });

  it("assembles streaming deltas into a message", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "turn/start", turn: { id: "t1" } }) as never);
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/delta", message: { id: "m1", role: "assistant", delta: "你好" } }) as never);
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/delta", message: { id: "m1", role: "assistant", delta: "，世界" } }) as never);
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/complete", message: { id: "m1", role: "assistant", content: "你好，世界", done: true } }) as never);

    const t = s.getTranscript("s1");
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ id: "m1", role: "assistant", content: "你好，世界" });
    expect(s.getSessions()[0]?.lastMessage).toBe("你好，世界");
  });

  it("marks interrupted streaming messages", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/delta", message: { id: "m1", delta: "写到一半" } }) as never);
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "interrupted" }) as never);
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "turn/complete", turn: { id: "t1" } }) as never);
    expect(s.getTranscript("s1")[0]).toMatchObject({ content: "写到一半", interrupted: true });
  });

  it("derives projection fields into the summary", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/projection", {
      sessionId: "s1",
      title: "deploy",
      goal: { status: "active" },
      tokenUsage: { total: 12000 },
      contextPressure: { percent: 42 },
    }) as never);
    const sum = s.getSessions()[0];
    expect(sum).toMatchObject({ title: "deploy", goalStatus: "active", tokenUsageTotal: 12000, contextPercent: 42 });
  });

  it("keeps pending server-requests and resolves them", () => {
    const s = new SessionStore();
    s.applyFrame(frame("server/request", { rpcId: "r1", kind: "approval", payload: { prompt: "ok?" } }) as never);
    expect(s.getPendingRequests()).toHaveLength(1);
    expect(s.getPendingRequest("r1")?.kind).toBe("approval");
    s.resolvePending("r1");
    expect(s.getPendingRequests()).toHaveLength(0);
  });

  it("ignores unknown frames without crashing", () => {
    const s = new SessionStore();
    for (const bad of [null, 42, "x", {}, { type: "brand/new" }, { type: "unknown" }]) {
      expect(() => s.applyFrame(bad as never)).not.toThrow();
    }
  });

  it("sorts sessions by recency", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/registry", { action: "added", sessionId: "old" }) as never);
    s.applyFrame(frame("session/registry", { action: "added", sessionId: "new" }) as never);
    expect(s.getSessions().map((x) => x.id)).toEqual(["new", "old"]);
  });
});
