import { describe, expect, it } from "vitest";
import {
  isRelayEnvelope,
  makePairCode,
  normalizeRelayError,
  parseRelayEnvelope,
  RELAY_ENVELOPE_VERSION,
  type RelayEnvelope,
} from "../src/relay.js";

function env(over: Partial<RelayEnvelope> = {}): RelayEnvelope {
  return {
    v: RELAY_ENVELOPE_VERSION,
    type: "relay.hello",
    id: "h1",
    from: "device-a",
    to: "relay",
    ts: 1_700_000_000_000,
    ...over,
  };
}

describe("parseRelayEnvelope", () => {
  it("parses a valid relay envelope with all control fields", () => {
    const e = parseRelayEnvelope(env({ payload: { protocolVersion: 1 } }));
    expect(e).toMatchObject({
      v: 1,
      type: "relay.hello",
      id: "h1",
      from: "device-a",
      to: "relay",
      ts: 1_700_000_000_000,
    });
    expect(e?.payload).toEqual({ protocolVersion: 1 });
  });

  it("rejects garbage without throwing", () => {
    for (const bad of [null, 42, "x", [], {}, { type: "relay.hello" }, { type: "brand.new", id: "x", from: "a", v: 1, ts: 0 }]) {
      expect(parseRelayEnvelope(bad)).toBeNull();
      expect(isRelayEnvelope(bad)).toBe(false);
    }
    expect(() => parseRelayEnvelope(undefined)).not.toThrow();
  });

  it("rejects wrong version or missing id/from", () => {
    expect(parseRelayEnvelope({ ...env(), v: 2 })).toBeNull();
    expect(parseRelayEnvelope(env({ id: "" }))).toBeNull();
    expect(parseRelayEnvelope(env({ from: "" }))).toBeNull();
  });

  it("parses relay.pair.code / relay.pair.code.ack envelopes", () => {
    const req = parseRelayEnvelope(
      env({ type: "relay.pair.code", payload: { ttlMs: 60_000 } }),
    );
    expect(req).toMatchObject({ type: "relay.pair.code", payload: { ttlMs: 60_000 } });

    const ack = parseRelayEnvelope(
      env({ type: "relay.pair.code.ack", from: "relay", to: "console-1", payload: { code: "123456", ttlMs: 60_000 } }),
    );
    expect(ack).toMatchObject({ type: "relay.pair.code.ack", payload: { code: "123456", ttlMs: 60_000 } });
  });
});

describe("makePairCode", () => {
  it("builds a console→relay pair-code request with stable fields", () => {
    const e = makePairCode("console-1", { ttlMs: 42_000 }, { id: "pc-1", ts: 123 });
    expect(e).toMatchObject({
      v: 1,
      type: "relay.pair.code",
      id: "pc-1",
      from: "console-1",
      to: "relay",
      ts: 123,
      payload: { ttlMs: 42_000 },
    });
  });

  it("omits the payload when no request options are provided", () => {
    const e = makePairCode("console-1");
    expect(e.payload).toBeUndefined();
  });
});

describe("normalizeRelayError", () => {
  it("keeps known codes and degrades unknown codes to E_UNKNOWN", () => {
    expect(normalizeRelayError({ code: "E_AUTH", message: "no" })).toMatchObject({
      code: "E_AUTH",
      message: "no",
    });
    expect(normalizeRelayError({ code: "E_WHATEVER", message: "x" })).toMatchObject({
      code: "E_UNKNOWN",
      message: "x",
    });
    expect(normalizeRelayError("boom")).toMatchObject({ code: "E_UNKNOWN" });
  });
});
