import { describe, expect, it } from "vitest";
import { SessionStore } from "../src/data/SessionStore";

describe("SessionStore.applyHistory pagination", () => {
  it("deduplicates overlapping history pages by seq and merges new events", () => {
    const store = new SessionStore();
    const page1 = [
      { event: { type: "user/message", seq: 1, data: { content: [{ type: "text", text: "one" }] } } },
      { event: { type: "assistant/message", seq: 2, data: { message: { content: [{ type: "text", text: "two" }] } } } },
    ];
    const page2 = [
      { event: { type: "assistant/message", seq: 2, data: { message: { content: [{ type: "text", text: "two-dup" }] } } } },
      { event: { type: "user/message", seq: 3, data: { content: [{ type: "text", text: "three" }] } } },
    ];
    store.applyHistory(page1, "s1");
    store.applyHistory(page2, "s1");
    const transcript = store.getTranscript("s1");
    expect(transcript.map((m) => m.content)).toEqual(["one", "two", "three"]);
  });

  it("keeps consuming legacy events without seq", () => {
    const store = new SessionStore();
    store.applyHistory([{ event: { type: "user/message", data: { content: [{ type: "text", text: "no-seq" }] } } }], "s1");
    store.applyHistory([{ event: { type: "user/message", data: { content: [{ type: "text", text: "no-seq-2" }] } } }], "s1");
    expect(store.getTranscript("s1").map((m) => m.content)).toEqual(["no-seq", "no-seq-2"]);
  });
});
