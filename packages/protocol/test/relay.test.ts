import { describe, expect, it } from "vitest";
import {
  isRelayEnvelope,
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
