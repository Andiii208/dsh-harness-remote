import { describe, expect, it } from "vitest";
import { availableCommands, queueEditPayload } from "../src/ui/chat/composerCommands";

describe("availableCommands", () => {
  it("shows permission only when online", () => {
    expect(availableCommands(true).map((c) => c.id)).toEqual(["permission", "queue", "steer"]);
    expect(availableCommands(false).map((c) => c.id)).toEqual(["queue", "steer"]);
  });
});

describe("queueEditPayload", () => {
  it("builds session.updateQueue edit payload from text", () => {
    expect(queueEditPayload("改好的消息")).toEqual({
      kind: "edit",
      content: [{ type: "text", text: "改好的消息" }],
    });
  });
});
