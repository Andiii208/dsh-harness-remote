import { describe, expect, it } from "vitest";
import { splitCode } from "../src/ui/chat/splitCode";

describe("splitCode", () => {
  it("keeps plain text as a single text segment", () => {
    expect(splitCode("hello world")).toEqual([{ code: false, text: "hello world" }]);
  });

  it("splits a fenced block and strips the language tag", () => {
    expect(splitCode("看代码：\n```ts\nconst x = 1;\n```")).toEqual([
      { code: false, text: "看代码：\n" },
      { code: true, text: "const x = 1;" },
    ]);
  });

  it("does not eat text before a block (regression)", () => {
    const segs = splitCode("Output\n```\ncode\n```");
    expect(segs[0]).toEqual({ code: false, text: "Output\n" });
    expect(segs[1]).toEqual({ code: true, text: "code" });
  });

  it("skips empty code blocks", () => {
    expect(splitCode("a\n```\n```\nb")).toEqual([
      { code: false, text: "a\n" },
      { code: false, text: "b" },
    ]);
  });

  it("treats odd fences as text", () => {
    expect(splitCode("a\n```\nb")).toEqual([{ code: false, text: "a\n```\nb" }]);
  });
});
