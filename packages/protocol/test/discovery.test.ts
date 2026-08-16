import { describe, expect, it } from "vitest";
import { buildPairPayload, parsePairPayload, probeHost } from "../src/discovery.js";

function fakeFetch(ok: boolean, body: unknown) {
  return async () => ({ ok, json: async () => body }) as unknown as typeof fetch;
}

describe("probeHost", () => {
  it("returns HostInfo on a valid describe envelope", async () => {
    const info = await probeHost("192.168.1.5", 3080, {
      fetchImpl: fakeFetch(true, { ok: true, result: { name: "dsh", version: "0.1.0-rc.5" } }),
    });
    expect(info).toMatchObject({ name: "dsh", version: "0.1.0-rc.5" });
  });

  it("returns null on HTTP failure", async () => {
    expect(await probeHost("h", 1, { fetchImpl: fakeFetch(false, {}) })).toBeNull();
  });

  it("returns null on malformed envelope", async () => {
    expect(await probeHost("h", 1, { fetchImpl: fakeFetch(true, { nope: true }) })).toBeNull();
    expect(await probeHost("h", 1, { fetchImpl: fakeFetch(true, "text") })).toBeNull();
  });

  it("returns null when fetch rejects (timeout/unreachable)", async () => {
    const boom = async () => {
      throw new Error("aborted");
    };
    expect(await probeHost("h", 1, { fetchImpl: boom as unknown as typeof fetch })).toBeNull();
  });
});

describe("pair payload", () => {
  it("round-trips host/port/token", () => {
    const url = buildPairPayload({ host: "192.168.1.5", port: 3080, token: "tok-abc" });
    expect(parsePairPayload(url)).toEqual({ host: "192.168.1.5", port: 3080, token: "tok-abc" });
  });

  it("omits empty token", () => {
    expect(parsePairPayload(buildPairPayload({ host: "h", port: 3080 }))).toEqual({ host: "h", port: 3080 });
  });

  it("rejects invalid urls", () => {
    expect(parsePairPayload("https://pair?host=h&port=1")).toBeNull();
    expect(parsePairPayload("dshremote://other?host=h&port=1")).toBeNull();
    expect(parsePairPayload("dshremote://pair?port=1")).toBeNull();
    expect(parsePairPayload("dshremote://pair?host=h&port=0")).toBeNull();
    expect(parsePairPayload("not a url")).toBeNull();
  });
});
