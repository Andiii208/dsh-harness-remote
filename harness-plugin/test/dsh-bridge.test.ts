import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DshBridge,
  detectDshApiUrl,
  parseLoopbackListeningPorts,
  probeDshApi,
} from "../src/dsh-bridge.js";
import type { RelayEnvelope } from "@dsh-remote/protocol";

afterEach(() => {
  vi.unstubAllEnvs();
});

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

/** Fetch mock that succeeds only for the given bases (prefix match on http://base). */
function pickyFetch(okBases: string[], opts?: { delayMs?: number }): typeof fetch {
  return (async (input: string | URL | Request, init?: { body?: string }) => {
    const url = String(input);
    const hit = okBases.find((b) => url.startsWith(`http://${b}/`) || url === `http://${b}`);
    if (opts?.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (!hit) throw new Error(`ECONNREFUSED ${url}`);
    const body = JSON.parse(String(init?.body ?? "{}")) as { rpcId?: string };
    return {
      ok: true,
      json: async () => ({
        type: "server-response",
        rpcId: body.rpcId ?? "r1",
        result: { ok: true, value: {} },
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

describe("parseLoopbackListeningPorts", () => {
  it("extracts sorted unique loopback LISTENING ports from netstat output", () => {
    const netstat = [
      "活动连接",
      "",
      "  Proto  本地地址          外部地址        状态           PID",
      "  TCP    0.0.0.0:4090         0.0.0.0:0              LISTENING       1234",
      "  TCP    127.0.0.1:60576       0.0.0.0:0              LISTENING       5678",
      "  TCP    127.0.0.1:60576       0.0.0.0:0              LISTENING       5678",
      "  TCP    192.168.1.13:3080     0.0.0.0:0              LISTENING       9999",
      "  TCP    [::1]:56734            [::]:0                 LISTENING       4444",
      "  TCP    10.0.0.8:9999         0.0.0.0:0              LISTENING       5555",
    ].join("\r\n");
    expect(parseLoopbackListeningPorts(netstat)).toEqual([4090, 56734, 60576]);
  });

  it("ignores malformed lines and non-listening rows", () => {
    expect(parseLoopbackListeningPorts("TCP 127.0.0.1:70000 0.0.0.0:0 LISTENING 1\nUDP 127.0.0.1:123 0.0.0.0:0")).toEqual([]);
  });
});

describe("detectDshApiUrl", () => {
  it("returns the env candidate first when it probes ok", async () => {
    vi.stubEnv("DSH_WEB_URL", "http://127.0.0.1:43120/");
    const lines: string[] = [];
    const probed: string[] = [];
    const result = await detectDshApiUrl(
      pickyFetch(["127.0.0.1:43120"]),
      (l) => lines.push(l),
      { listLoopbackPorts: async () => { probed.push("listed"); return [60576]; } },
    );
    expect(result).toBe("http://127.0.0.1:43120");
    expect(lines.some((l) => l.includes("已连接") && l.includes("43120"))).toBe(true);
    // env 命中时不应再做 netstat 枚举。
    expect(probed).toEqual([]);
  });

  it("falls through to enumerated ports when the env candidate fails", async () => {
    vi.stubEnv("DSH_WEB_URL", "http://127.0.0.1:1");
    const result = await detectDshApiUrl(
      pickyFetch(["127.0.0.1:60576"]),
      undefined,
      { listLoopbackPorts: async () => [60576] },
    );
    expect(result).toBe("http://127.0.0.1:60576");
  });

  it("reports enumeration failure instead of failing silently", async () => {
    const lines: string[] = [];
    const result = await detectDshApiUrl(
      pickyFetch([]),
      (l) => lines.push(l),
      { listLoopbackPorts: async () => { throw new Error("EPERM: spawn blocked"); } },
    );
    expect(result).toBeNull();
    expect(lines.some((l) => l.includes("枚举失败") && l.includes("EPERM"))).toBe(true);
    // 枚举失败后仍应兜底探测历史端口。
    expect(lines.some((l) => l.includes("56734"))).toBe(true);
    expect(lines.some((l) => l.includes("3080"))).toBe(true);
  });

  it("reports empty enumeration visibly", async () => {
    const lines: string[] = [];
    await detectDshApiUrl(pickyFetch([]), (l) => lines.push(l), {
      listLoopbackPorts: async () => [],
    });
    expect(lines.some((l) => l.includes("枚举无结果"))).toBe(true);
  });

  it("probes enumerated candidates in parallel and prefers candidate order over resolution order", async () => {
    // 隔离宿主真实 env（本机可能设置 DSH_WEB_URL）。
    vi.stubEnv("DSH_API_URL", "");
    vi.stubEnv("DSH_WEB_URL", "");
    const lines: string[] = [];
    const started: string[] = [];
    const listLoopbackPorts = async () => [60576, 43120];
    // 两个候选都会成功：60576 命中快，43120 命中慢——按候选顺序应选 60576。
    const fetchImpl = (async (input: string | URL | Request, init?: { body?: string }) => {
      const url = String(input);
      started.push(url);
      const body = JSON.parse(String(init?.body ?? "{}")) as { rpcId?: string };
      if (url.includes("60576")) await new Promise((r) => setTimeout(r, 60));
      return {
        ok: true,
        json: async () => ({ type: "server-response", rpcId: body.rpcId ?? "r1", result: { ok: true, value: {} } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const result = await detectDshApiUrl(fetchImpl, (l) => lines.push(l), { listLoopbackPorts });
    expect(result).toBe("http://127.0.0.1:60576");
    // 并行：两个候选的请求应在等待前都已发出。
    expect(started.some((u) => u.includes("60576"))).toBe(true);
    expect(started.some((u) => u.includes("43120"))).toBe(true);
  });
});

describe("DshBridge capability cache", () => {
  interface FakeRelay {
    onEnvelope: (fn: (env: RelayEnvelope) => void) => () => void;
    send: (env: unknown) => Promise<void>;
    clientId: string;
  }

  function makeBridge(fetchCalls: { url: string }[], status: number) {
    const sent: Array<{ payload: Record<string, unknown> }> = [];
    const statusLines: string[] = [];
    let handler: ((env: RelayEnvelope) => void) | null = null;
    const relay = {
      onEnvelope: (fn: (env: RelayEnvelope) => void) => {
        handler = fn;
        return () => {};
      },
      send: async (env: unknown) => {
        sent.push(env as { payload: Record<string, unknown> });
      },
      clientId: "console-test",
    };
    const onError: Array<unknown> = [];
    const bridge = new DshBridge({
      baseUrl: "http://127.0.0.1:1",
      relay: relay as never,
      fetchImpl: (async (input: string | URL | Request) => {
        fetchCalls.push({ url: String(input) });
        // 404/500：带 JSON 头但 body 非 JSON —— RpcClient 映射为 HTTP_<status>。
        return {
          ok: false,
          status,
          json: async () => {
            throw new Error("no body");
          },
        } as unknown as Response;
      }) as unknown as typeof fetch,
      onStatus: (l) => statusLines.push(l),
      onError: (e) => onError.push(e),
    });
    const dispatch = (method: string, rpcId: string) =>
      (
        bridge as unknown as {
          handleRelayEnvelope: (env: RelayEnvelope) => Promise<void>;
        }
      ).handleRelayEnvelope({
        type: "relay.route",
        id: "env-1",
        from: "device-1",
        to: "console-test",
        ts: Date.now(),
        payload: { rpcId, method, payload: {}, to: "console-test" },
      } as RelayEnvelope);
    return { sent, onError, statusLines, dispatch };
  }

  it("caches HTTP 404 methods and short-circuits later calls without hitting DSH", async () => {
    const fetchCalls: { url: string }[] = [];
    const { sent, onError, statusLines, dispatch } = makeBridge(fetchCalls, 404);
    await dispatch("plugin.list", "r1");
    await dispatch("plugin.list", "r2");
    expect(fetchCalls).toHaveLength(1);
    expect(sent).toHaveLength(2);
    expect(sent[0]?.payload.ok).toBe(false);
    expect(sent[1]?.payload.ok).toBe(false);
    expect(sent[1]?.payload.error).toMatchObject({ code: "E_UNSUPPORTED" });
    // 404 是预期行为：不刷 onError，改走 onStatus 留痕。
    expect(onError).toHaveLength(0);
    expect(statusLines.some((l) => l.includes("plugin.list") && l.includes("缓存"))).toBe(true);
  });

  it("does not cache non-404 failures", async () => {
    const fetchCalls: { url: string }[] = [];
    const { sent, onError, dispatch } = makeBridge(fetchCalls, 500);
    await dispatch("session.list", "r1");
    await dispatch("session.list", "r2");
    expect(fetchCalls).toHaveLength(2);
    expect(sent).toHaveLength(2);
    expect(sent[1]?.payload.error).toMatchObject({ code: "E_UNKNOWN" });
    expect(String((sent[1]?.payload.error as { message?: string }).message)).toContain("500");
    expect(onError).toHaveLength(2);
  });
});
