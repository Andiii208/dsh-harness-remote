import { describe, expect, it } from "vitest";
import { classifyConnectionError } from "../src/transport/connectionErrors";

describe("classifyConnectionError", () => {
  it("classifies common error shapes", () => {
    expect(classifyConnectionError(new Error("ECONNREFUSED: connection refused")).kind).toBe("refused");
    expect(classifyConnectionError(new Error("handshake timed out after 15000ms")).kind).toBe("timeout");
    expect(classifyConnectionError({ code: "E_PAIR", message: "pair code expired" }).kind).toBe("pair");
    expect(classifyConnectionError(new Error("ENOTFOUND relay.example.com")).kind).toBe("dns");
    expect(classifyConnectionError(new Error("self-signed certificate")).kind).toBe("tls");
    expect(classifyConnectionError(new Error("protocol version incompatible")).kind).toBe("protocol");
    expect(classifyConnectionError(new Error("tunnel 502 bad gateway")).kind).toBe("tunnel");
    expect(classifyConnectionError(new Error("something else")).kind).toBe("unknown");
  });

  it("returns a Chinese hint for every kind", () => {
    for (const err of [new Error("ECONNREFUSED"), "timeout", "E_PAIR", "wss cert"]) {
      const info = classifyConnectionError(err);
      expect(info.title.length).toBeGreaterThan(0);
      expect(info.hint.length).toBeGreaterThan(0);
    }
  });
});
