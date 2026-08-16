import { describe, expect, it } from "vitest";
import { SessionStore } from "../src/data/SessionStore";

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

  it("inserts a gap marker when a turn starts over an unfinished message", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/delta", message: { id: "m1", delta: "未完成" } }) as never);
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "turn/start", turn: { id: "t2" } }) as never);
    const t = s.getTranscript("s1");
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ gap: true, role: "assistant" });
    expect(t[0]?.content).toContain("间隙");
  });

  it("inserts a gap marker on an explicit gap event", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "gap" }) as never);
    expect(s.getTranscript("s1")[0]).toMatchObject({ gap: true });
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

  it("exposes live streaming message before completion", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/delta", message: { id: "m1", role: "assistant", delta: "正在" } }) as never);
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/delta", message: { id: "m1", role: "assistant", delta: "思考" } }) as never);
    expect(s.getLiveMessage("s1")).toMatchObject({ id: "m1", role: "assistant", content: "正在思考" });
    s.applyFrame(frame("session/event", { sessionId: "s1", event: "message/complete", message: { id: "m1", role: "assistant", content: "正在思考", done: true } }) as never);
    expect(s.getLiveMessage("s1")).toBeUndefined();
  });

  it("records lastActiveAt timestamps for recency display", () => {
    const s = new SessionStore();
    const before = Date.now();
    s.applyFrame(frame("session/registry", { action: "added", sessionId: "s1", title: "t" }) as never);
    const sum = s.getSessions()[0];
    expect(sum?.lastActiveAt).toBeGreaterThanOrEqual(before);
    expect(sum?.lastActiveAt).toBeLessThanOrEqual(Date.now());
  });

  it("applySessionList replaces the list while keeping derived fields", () => {
    const s = new SessionStore();
    s.applyFrame(frame("session/projection", { sessionId: "s1", goal: { status: "active" }, tokenUsage: { total: 100 } }) as never);
    s.applySessionList([
      { id: "s1", title: "deploy", workspace: "D:\app" },
      { id: "s2", title: "debug", workspace: "D:\app" },
    ] as never);
    const list = s.getSessions();
    expect(list.map((x) => x.id)).toEqual(["s2", "s1"]); // 按 updatedAt 倒序
    expect(list.find((x) => x.id === "s1")).toMatchObject({ title: "deploy", goalStatus: "active", tokenUsageTotal: 100 });
  });

  it("applySessionList drops sessions missing from the list", () => {
    const s = new SessionStore();
    s.applySessionList([{ id: "s1", title: "t" }] as never);
    s.applySessionList([{ id: "s2", title: "t2" }] as never);
    expect(s.getSessions().map((x) => x.id)).toEqual(["s2"]);
  });
});
