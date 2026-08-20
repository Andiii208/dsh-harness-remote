import { describe, expect, it } from "vitest";
import { shouldStickToBottom } from "../src/ui/chat/stickyBottom";

describe("shouldStickToBottom", () => {
  it("returns true when distance is below the default threshold", () => {
    expect(shouldStickToBottom(0)).toBe(true);
    expect(shouldStickToBottom(59)).toBe(true);
  });

  it("returns false when distance reaches or exceeds the default threshold", () => {
    expect(shouldStickToBottom(60)).toBe(false);
    expect(shouldStickToBottom(120)).toBe(false);
  });

  it("honours a custom threshold and rejects non-finite distances", () => {
    expect(shouldStickToBottom(99, 100)).toBe(true);
    expect(shouldStickToBottom(100, 100)).toBe(false);
    expect(shouldStickToBottom(Number.NaN)).toBe(false);
  });
});
