import { describe, expect, it } from "vitest";
import { decodeEnvelope, decodeFrame } from "../src/codec.js";

describe("decodeEnvelope", () => {
  it("decodes client-request with rpcId echo", () => {
    const e = decodeEnvelope({ rpcId: "abc", method: "commands/execute", payload: { input: "hi" }, extra: 1 });
    expect(e).toMatchObject({ rpcId: "abc", method: "commands/execute", payload: { input: "hi" } });
    expect("method" in e).toBe(true);
  });

  it("decodes server-response ok:true", () => {
    const e = decodeEnvelope({ rpcId: "abc", ok: true, result: { name: "dsh" } });
    expect(e).toMatchObject({ rpcId: "abc", ok: true, result: { name: "dsh" } });
  });

  it("decodes server-response ok:false with typed error", () => {
    const e = decodeEnvelope({ rpcId: "abc", ok: false, error: { code: "NOT_FOUND", message: "x" } });
    expect(e).toMatchObject({ ok: false, error: { code: "NOT_FOUND", message: "x" } });
  });

  it("degrades unknown error code to UnknownError, preserving original", () => {
    const e = decodeEnvelope({ rpcId: "abc", ok: false, error: { code: "WEIRD_CODE", message: "?" } });
    expect(e).toMatchObject({ ok: false, error: { code: "UnknownError", message: "?" } });
    if ("error" in e && e.error) {
      expect(e.error.details).toMatchObject({ originalCode: "WEIRD_CODE" });
    }
  });

  it("keeps known error codes as-is", () => {
    const e = decodeEnvelope({ rpcId: "abc", ok: false, error: { code: "NOT_FOUND", message: "x" } });
    expect(e).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("normalizes a non-object error", () => {
    const e = decodeEnvelope({ rpcId: "abc", ok: false, error: "boom" });
    expect(e).toMatchObject({ ok: false, error: { code: "UnknownError", message: "unknown error" } });
  });

  it("decodes server-request (approval/question)", () => {
    const e = decodeEnvelope({ rpcId: "abc", kind: "approval", payload: { prompt: "ok?" } });
    expect(e).toMatchObject({ kind: "approval", payload: { prompt: "ok?" } });
  });

  it("decodes client-response", () => {
    const e = decodeEnvelope({ rpcId: "abc", result: { approved: true } });
    expect(e).toMatchObject({ rpcId: "abc", result: { approved: true } });
  });

  it("degrades unknown shapes to UnknownEnvelope and never throws", () => {
    const cases: unknown[] = [null, 42, "str", [], true, { foo: 1 }, undefined, { ok: "not-bool" }];
    for (const c of cases) {
      const e = decodeEnvelope(c);
      expect("kind" in e).toBe(true);
      expect(e).toMatchObject({ kind: "unknown" });
    }
  });

  it("ignores unknown keys on typed envelopes", () => {
    const e = decodeEnvelope({ rpcId: "r", method: "m", payload: {}, unknownKey: { nested: true } });
    expect("unknownKey" in e).toBe(false);
  });

  it("is idempotent: re-decoding a degraded UnknownEnvelope stays unknown", () => {
    const first = decodeEnvelope({ kind: "unknown", raw: { foo: 1 } });
    expect(first).toMatchObject({ kind: "unknown" });
    const second = decodeEnvelope(first);
    expect(second).toMatchObject({ kind: "unknown" });
    expect(second).toEqual(first);
  });

  it("is idempotent for typed envelopes", () => {
    const sr = decodeEnvelope({ rpcId: "r", kind: "approval", payload: {} });
    expect(decodeEnvelope(sr)).toEqual(sr);
    const ok = decodeEnvelope({ rpcId: "r", ok: true, result: 1 });
    expect(decodeEnvelope(ok)).toEqual(ok);
  });
});

describe("decodeFrame", () => {
  it("decodes known frame types", () => {
    const f = decodeFrame({ type: "session/event", sessionId: "s1", event: "turn/start" });
    expect(f.type).toBe("session/event");
  });

  it("degrades unknown frame types to UnknownFrame", () => {
    const f = decodeFrame({ type: "brand/new/thing", data: 1 });
    expect(f.type).toBe("unknown");
    expect("raw" in f).toBe(true);
  });

  it("never throws on garbage", () => {
    for (const c of [null, 42, "x", [], { noType: true }]) {
      const f = decodeFrame(c);
      expect(f.type).toBe("unknown");
    }
  });
});
