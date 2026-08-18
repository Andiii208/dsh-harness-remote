import { describe, expect, it } from "vitest";
import { probeDshApi } from "../src/dsh-bridge.js";

function fakeFetch(result: { ok: boolean; value?: unknown; error?: unknown }): typeof fetch {
  return (async (_input: string | URL | Request, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { rpcId?: string };
    return {
      ok: true,
      json: async () => ({
        type: "server-response",
        rpcId: body.rpcId ?? "r1",
        result: result.ok
          ? { ok: true, value: result.value ?? {} }
          : { ok: false, error: result.error ?? { code: "NOT_FOUND", message: "missing" } },
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe("probeDshApi", () => {
  it("returns true when host.describe succeeds", async () => {
    expect(await probeDshApi("http://127.0.0.1:56734", fakeFetch({ ok: true, value: { name: "dsh" } }))).toBe(true);
  });

  it("returns false when host.describe is missing", async () => {
    expect(await probeDshApi("http://127.0.0.1:56734", fakeFetch({ ok: false, error: { code: "NOT_FOUND", message: "no" } }))).toBe(false);
  });

  it("returns false when fetch fails", async () => {
    const boom = async () => {
      throw new Error("down");
    };
    expect(await probeDshApi("http://127.0.0.1:56734", boom as unknown as typeof fetch)).toBe(false);
  });
});
