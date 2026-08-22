import { describe, expect, it } from "vitest";
import { parseLoopbackListeningPorts, probeDshApi } from "../src/dsh-bridge.js";

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
