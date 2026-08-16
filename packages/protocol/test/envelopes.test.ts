import { describe, expect, it } from "vitest";
import {
  isClientRequest,
  isClientResponse,
  isServerRequest,
  isServerResponse,
  makeRpcId,
  type ClientRequest,
  type ServerResponse,
  type ServerRequest,
} from "../src/envelopes.js";

describe("makeRpcId", () => {
  it("produces unique, non-empty ids", () => {
    const a = makeRpcId();
    const b = makeRpcId();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(8);
  });

  it("supports an injected random source", () => {
    const id = makeRpcId(() => 0.5);
    expect(id).toMatch(/^[a-z0-9]+-[a-z0-9]{8}$/);
  });
});

describe("discriminators", () => {
  it("classifies client-request", () => {
    const e: ClientRequest = { rpcId: "r1", method: "host.describe", payload: {} };
    expect(isClientRequest(e)).toBe(true);
    expect(isServerResponse(e)).toBe(false);
  });

  it("classifies server-response (ok and err)", () => {
    const ok: ServerResponse = { rpcId: "r1", ok: true, result: { name: "dsh" } };
    const err: ServerResponse = { rpcId: "r1", ok: false, error: { code: "NOT_FOUND", message: "nope" } };
    expect(isServerResponse(ok)).toBe(true);
    expect(isServerResponse(err)).toBe(true);
    expect(isClientRequest(ok)).toBe(false);
  });

  it("classifies server-request vs client-response", () => {
    const sr: ServerRequest = { rpcId: "r1", kind: "approval", payload: { prompt: "ok?" } };
    expect(isServerRequest(sr)).toBe(true);
    expect(isClientResponse(sr)).toBe(false);
    const cr: ClientResponseLike = { rpcId: "r1", result: { approved: true } };
    expect(isClientResponse(cr)).toBe(true);
    expect(isServerRequest(cr)).toBe(false);
  });
});

type ClientResponseLike = { rpcId: string; result: unknown };
