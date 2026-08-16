import { describe, expect, it } from "vitest";
import {
  fixtureFileName,
  serializeFixture,
  validateFixtureSet,
  type FixtureSet,
} from "../src/fixture-format.js";

const valid: FixtureSet = {
  meta: { baselineVersion: "0.1.0-rc.5", recordedAt: "2026-08-16T00:00:00.000Z" },
  unaryResponses: [
    { method: "host.describe", response: { ok: true, result: { name: "dsh" } } },
    {
      method: "session.get",
      response: { ok: false, error: { code: "NOT_FOUND", message: "nope" } },
    },
  ],
  wsFrames: [
    { stream: "mux", frame: { type: "session/event", sessionId: "s1" } },
    { stream: "host", frame: { type: "session/registry", action: "added" } },
  ],
  scenarios: [{ id: "drop", disconnectAfter: 1 }],
};

describe("validateFixtureSet", () => {
  it("accepts a valid fixture", () => {
    expect(validateFixtureSet(valid)).toMatchObject({ ok: true });
  });

  it("rejects non-object input", () => {
    for (const v of [null, 42, "x", []]) {
      expect(validateFixtureSet(v).ok).toBe(false);
    }
  });

  it("reports missing meta fields", () => {
    const r = validateFixtureSet({ meta: {}, unaryResponses: [], wsFrames: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain("baselineVersion");
  });

  it("rejects bad unary responses", () => {
    const r = validateFixtureSet({
      meta: valid.meta,
      unaryResponses: [{ method: "x", response: { ok: "yes" } }],
      wsFrames: [],
    });
    expect(r.ok).toBe(false);
  });

  it("rejects bad ws frame streams", () => {
    const r = validateFixtureSet({
      meta: valid.meta,
      unaryResponses: [],
      wsFrames: [{ stream: "side", frame: {} }],
    });
    expect(r.ok).toBe(false);
  });

  it("ignores unknown fields (lenient)", () => {
    const r = validateFixtureSet({ ...valid, extraTopLevel: 1, meta: { ...valid.meta, note: "x" } });
    expect(r.ok).toBe(true);
  });

  it("never throws on arbitrary garbage", () => {
    expect(() => validateFixtureSet({ meta: "no", unaryResponses: "no", wsFrames: 5 })).not.toThrow();
  });
});

describe("serialize/name", () => {
  it("serializes with stable key order and trailing newline", () => {
    const s = serializeFixture(valid);
    expect(s.endsWith("\n")).toBe(true);
    expect(() => JSON.parse(s)).not.toThrow();
    expect(validateFixtureSet(JSON.parse(s)).ok).toBe(true);
  });

  it("names files with ISO-ish timestamps", () => {
    const n = fixtureFileName(new Date("2026-08-16T10:00:00Z"));
    expect(n).toMatch(/^capture-2026-08-16T10-00-00-000Z\.fixture\.json$/);
  });
});
