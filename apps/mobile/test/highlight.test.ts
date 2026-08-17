import { describe, expect, it } from "vitest";
import { highlight } from "../src/ui/chat/highlight";

describe("highlight", () => {
  it("colors keywords, strings, comments and numbers in four categories", () => {
    const tokens = highlight('const x = 42; // answer\nconst s = "hi";');
    expect(tokens).toContainEqual({ text: "const", type: "keyword" });
    expect(tokens).toContainEqual({ text: "42", type: "number" });
    expect(tokens).toContainEqual({ text: "// answer", type: "comment" });
    expect(tokens).toContainEqual({ text: '"hi"', type: "string" });
  });

  it("falls back to plain for unknown tokens and preserves full text", () => {
    const tokens = highlight("foo bar 123");
    expect(tokens.map((t) => t.text).join("")).toBe("foo bar 123");
    expect(tokens.some((t) => t.type === "plain")).toBe(true);
    expect(tokens).toContainEqual({ text: "123", type: "number" });
  });

  it("handles python-style comments and empty input", () => {
    const tokens = highlight("x = 1 # comment");
    expect(tokens).toContainEqual({ text: "# comment", type: "comment" });
    expect(highlight("")).toEqual([]);
  });
});
