import { describe, expect, it } from "vitest";
import { RpcClient, RpcError } from "../src/rpc.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Build a fetch mock that echoes the request rpcId (real DSH behavior). */
function echoFetch(
  build: (req: { rpcId: string; method?: string }) => unknown,
): typeof fetch {
  return (async (_url, init) => {
    const req = JSON.parse(String(init?.body)) as { rpcId: string; method?: string };
    return jsonResponse(build(req));
  }) as typeof fetch;
}

describe("RpcClient.unary", () => {
  it("returns ok result with rpcId echo", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const client = new RpcClient({
      baseUrl: "http://h:3080",
      fetchImpl: (async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        const req = JSON.parse(String(init?.body)) as { rpcId: string };
        return jsonResponse({ rpcId: req.rpcId, ok: true, result: { name: "dsh" } });
      }) as typeof fetch,
    });
    const res = await client.unary("host.describe", {});
    expect(res.ok).toBe(true);
    expect(res.result).toEqual({ name: "dsh" });
    expect(calls[0]?.url).toBe("http://h:3080/api/host.describe");
  });

  it("throws RpcError with typed code on ok:false", async () => {
    const client = new RpcClient({
      baseUrl: "http://h:3080",
      fetchImpl: echoFetch((req) => ({
        rpcId: req.rpcId,
        ok: false,
        error: { code: "SESSION_NOT_FOUND", message: "nope" },
      })),
    });
    await expect(client.unary("session.get", {})).rejects.toMatchObject({
      name: "RpcError",
      code: "SESSION_NOT_FOUND",
    });
  });

  it("throws RpcError HTTP_<status> on non-JSON body", async () => {
    const client = new RpcClient({
      baseUrl: "http://h:3080",
      fetchImpl: async () => new Response("Internal Server Error", { status: 500 }),
    });
    await expect(client.unary("x", {})).rejects.toMatchObject({ code: "HTTP_500" });
  });

  it("throws RpcError BAD_RESPONSE on garbage envelope", async () => {
    const client = new RpcClient({
      baseUrl: "http://h:3080",
      fetchImpl: async () => jsonResponse({ weird: true }),
    });
    await expect(client.unary("x", {})).rejects.toMatchObject({ code: "BAD_RESPONSE" });
  });

  it("throws RpcError on rpcId echo mismatch", async () => {
    const client = new RpcClient({
      baseUrl: "http://h:3080",
      fetchImpl: async () => jsonResponse({ rpcId: "different-id", ok: true, result: {} }),
    });
    await expect(client.unary("x", {})).rejects.toMatchObject({
      code: "RPC_ID_MISMATCH",
      details: { expected: expect.any(String), got: "different-id" },
    });
  });

  it("throws RpcError TIMEOUT on abort", async () => {
    const client = new RpcClient({
      baseUrl: "http://h:3080",
      timeoutMs: 30,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          (init?.signal as AbortSignal).addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    });
    await expect(client.unary("slow", {})).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("throws RpcError NETWORK on fetch failure", async () => {
    const client = new RpcClient({
      baseUrl: "http://h:3080",
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    await expect(client.unary("x", {})).rejects.toMatchObject({ code: "NETWORK" });
  });
});

describe("RpcClient.respond & call", () => {
  it("posts client-response to /api/respond", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const client = new RpcClient({
      baseUrl: "http://h:3080",
      fetchImpl: (async (url, init) => {
        calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        const req = JSON.parse(String(init?.body)) as { rpcId: string };
        return jsonResponse({ rpcId: req.rpcId, ok: true, result: null });
      }) as typeof fetch,
    });
    await client.respond("req-1", { approved: true });
    expect(calls[0]?.url).toBe("http://h:3080/api/respond");
    expect(calls[0]?.body).toMatchObject({ rpcId: "req-1", result: { approved: true } });
  });

  it("posts to typert gateway path", async () => {
    const urls: string[] = [];
    const client = new RpcClient({
      baseUrl: "http://h:3080",
      fetchImpl: (async (url, init) => {
        urls.push(String(url));
        const req = JSON.parse(String(init?.body)) as { rpcId: string };
        return jsonResponse({ rpcId: req.rpcId, ok: true, result: {} });
      }) as typeof fetch,
    });
    await client.call("commands", "execute", { input: "ls" });
    expect(urls).toEqual(["http://h:3080/api/commands/execute"]);
  });
});

describe("RpcClient pairing token", () => {
  it("sends Authorization Bearer when a token is configured", async () => {
    const headers: Record<string, string> = {};
    const client = new RpcClient({
      baseUrl: "http://h:3080",
      token: "pair-tok-1",
      fetchImpl: (async (_url, init) => {
        const h = (init?.headers ?? {}) as Record<string, string>;
        for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = String(v);
        const req = JSON.parse(String(init?.body)) as { rpcId: string };
        return jsonResponse({ rpcId: req.rpcId, ok: true, result: {} });
      }) as typeof fetch,
    });
    await client.unary("host.describe", {});
    expect(headers["authorization"]).toBe("Bearer pair-tok-1");
  });

  it("omits the header without a token", async () => {
    const headers: Record<string, string> = {};
    const client = new RpcClient({
      baseUrl: "http://h:3080",
      fetchImpl: (async (_url, init) => {
        const h = (init?.headers ?? {}) as Record<string, string>;
        for (const [k, v] of Object.entries(h)) headers[k.toLowerCase()] = String(v);
        const req = JSON.parse(String(init?.body)) as { rpcId: string };
        return jsonResponse({ rpcId: req.rpcId, ok: true, result: {} });
      }) as typeof fetch,
    });
    await client.unary("host.describe", {});
    expect(headers["authorization"]).toBeUndefined();
  });
});

describe("RpcError", () => {
  it("is an Error with code", () => {
    const e = new RpcError("X", "msg", { detail: 1 });
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("X");
    expect(e.details).toEqual({ detail: 1 });
  });
});
