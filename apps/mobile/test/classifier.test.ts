import { describe, expect, it } from "vitest";
import { NotificationClassifier } from "../src/notify/classifier";

function frame(type: string, extra: Record<string, unknown> = {}): unknown {
  return { type, ...extra };
}

describe("NotificationClassifier", () => {
  it("classifies approval server-requests (deduped by rpcId)", () => {
    const c = new NotificationClassifier();
    const ev = c.classify(frame("server/request", {
      rpcId: "r1",
      kind: "approval",
      payload: { prompt: "run?", command: "git push" },
    }) as never);
    expect(ev).toMatchObject({ kind: "approval-waiting", rpcId: "r1", prompt: "run?" });
    expect(c.classify(frame("server/request", { rpcId: "r1", kind: "approval" }) as never)).toBeNull();
  });

  it("classifies question server-requests", () => {
    const c = new NotificationClassifier();
    const ev = c.classify(frame("server/request", {
      rpcId: "q1",
      kind: "question",
      payload: { question: "部署？" },
    }) as never);
    expect(ev).toMatchObject({ kind: "question-waiting", prompt: "部署？" });
  });

  it("classifies turn completion (deduped by turn id)", () => {
    const c = new NotificationClassifier();
    const ev = c.classify(frame("session/event", { sessionId: "s1", event: "turn/complete", turn: { id: "t1" } }) as never);
    expect(ev).toMatchObject({ kind: "turn-complete", sessionId: "s1" });
    expect(c.classify(frame("session/event", { sessionId: "s1", event: "turn/complete", turn: { id: "t1" } }) as never)).toBeNull();
  });

  it("ignores turn completion without a turn id (anti-spam)", () => {
    const c = new NotificationClassifier();
    expect(c.classify(frame("session/event", { sessionId: "s1", event: "turn/complete" }) as never)).toBeNull();
  });

  it("classifies goal complete/blocked transitions once", () => {
    const c = new NotificationClassifier();
    const ev = c.classify(frame("session/projection", { sessionId: "s1", goal: { status: "complete" } }) as never);
    expect(ev).toMatchObject({ kind: "goal-complete" });
    expect(c.classify(frame("session/projection", { sessionId: "s1", goal: { status: "complete" } }) as never)).toBeNull();

    const blocked = new NotificationClassifier();
    expect(blocked.classify(frame("session/projection", { sessionId: "s1", goal: { status: "blocked" } }) as never)).toMatchObject({
      kind: "goal-blocked",
    });
  });

  it("returns null for unknown frames", () => {
    const c = new NotificationClassifier();
    expect(c.classify(frame("brand/new") as never)).toBeNull();
    expect(c.classify(frame("unknown") as never)).toBeNull();
    expect(c.classify(null as never)).toBeNull();
  });
});
