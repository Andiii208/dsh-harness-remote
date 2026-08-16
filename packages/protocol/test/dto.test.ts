import { describe, expect, it } from "vitest";
import { readHostDescribe } from "../src/dto/host.js";
import { readApprovalPayload, readQuestionPayload } from "../src/dto/server-request.js";
import { isKnownErrorCode, KNOWN_ERROR_CODES } from "../src/dto/errors.js";
import type { SessionProjection } from "../src/dto/session.js";

describe("readHostDescribe", () => {
  it("reads known fields leniently", () => {
    const d = readHostDescribe({ name: "dsh", version: "0.1.0-rc.5", capabilities: { a: 1 }, extra: "x" });
    expect(d.name).toBe("dsh");
    expect(d.version).toBe("0.1.0-rc.5");
    expect(d.capabilities).toEqual({ a: 1 });
  });

  it("degrades garbage without throwing", () => {
    for (const v of [null, 42, "x", []]) {
      const d = readHostDescribe(v);
      expect(d.name).toBeUndefined();
      expect(d.raw).toEqual({});
    }
  });
});

describe("readApprovalPayload / readQuestionPayload", () => {
  it("reads approval fields", () => {
    const p = readApprovalPayload({ prompt: "run?", command: "rm -rf /", permission: "fs.write" });
    expect(p).toMatchObject({ prompt: "run?", command: "rm -rf /", permission: "fs.write" });
  });

  it("reads question fields with options", () => {
    const p = readQuestionPayload({ question: "which?", options: ["a", "b"] });
    expect(p.question).toBe("which?");
    expect(p.options).toEqual(["a", "b"]);
  });

  it("degrades garbage", () => {
    expect(readApprovalPayload(null).prompt).toBeUndefined();
    expect(readQuestionPayload(7).question).toBeUndefined();
  });
});

describe("error codes", () => {
  it("recognizes known codes", () => {
    expect(isKnownErrorCode("NOT_FOUND")).toBe(true);
    expect(isKnownErrorCode("WEIRD")).toBe(false);
    expect(KNOWN_ERROR_CODES.length).toBeGreaterThan(5);
  });
});

describe("session projection type", () => {
  it("carries raw passthrough", () => {
    const p: SessionProjection = {
      type: "session/projection",
      sessionId: "s1",
      tokenUsage: { total: 120 },
      goal: { status: "active" },
      todos: [{ content: "x", status: "in_progress" }],
      raw: { anything: true },
    };
    expect(p.goal?.status).toBe("active");
    expect(p.raw.anything).toBe(true);
  });
});
