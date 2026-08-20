import { describe, expect, it } from "vitest";
import { SessionStore } from "../src/data/SessionStore";

describe("long transcript", () => {
  it("builds 500+ messages and keeps the transcript count exact", () => {
    const store = new SessionStore();
    const events: Array<Record<string, unknown>> = [];
    for (let i = 1; i <= 600; i++) {
      events.push({
        event: {
          type: "user/message",
          seq: i,
          data: { content: [{ type: "text", text: `msg-${i}` }] },
        },
      });
    }
    store.applyHistory(events, "s1");
    expect(store.getTranscript("s1")).toHaveLength(600);
    expect(store.getTranscript("s1")[0]?.content).toBe("msg-1");
    expect(store.getTranscript("s1")[599]?.content).toBe("msg-600");
  });

  it("does not duplicate the first page when replaying the same 500+ page", () => {
    const store = new SessionStore();
    const events: Array<Record<string, unknown>> = [];
    for (let i = 1; i <= 550; i++) {
      events.push({
        event: { type: "user/message", seq: i, data: { content: [{ type: "text", text: `m${i}` }] } },
      });
    }
    store.applyHistory(events, "s1");
    store.applyHistory(events.slice(0, 40), "s1");
    expect(store.getTranscript("s1")).toHaveLength(550);
  });
});
