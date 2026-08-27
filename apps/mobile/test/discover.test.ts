import { describe, expect, it, vi } from "vitest";
import { discoverHosts } from "../src/discovery/discover";

function jsonFetch(okHosts: Set<string>) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const hit = [...okHosts].find((h) => url.includes(`//${h}/`));
    if (!hit) throw new Error("unreachable");
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { name: "dsh", version: "2.0.1" } }),
    } as unknown as Response;
  }) as typeof fetch;
}

describe("discoverHosts（P3/mDNS 合并）", () => {
  it("合并 zeroconf 候选与 /24 扫描并按 host:port 去重", async () => {
    const mdnsSource = vi.fn().mockResolvedValue([
      { host: "nas.local", port: 4300, name: "NAS-DSH" },
      { host: "192.168.1.7", port: 3080 }, // 与 /24 扫描重叠 → 去重
    ]);
    const fetchImpl = jsonFetch(new Set(["nas.local:4300", "192.168.1.7:3080"]));
    const result = await discoverHosts({
      localIp: "192.168.1.50",
      timeoutMs: 50,
      fetchImpl,
      mdnsSource,
    });
    // nas.local 来自 mDNS；192.168.1.7 只出现一次（不管来源）
    expect(result.map((r) => `${r.host}:${r.port}`).sort()).toEqual([
      "192.168.1.7:3080",
      "nas.local:4300",
    ]);
    // /24 网段其余不可达主机不会出现在结果里
    expect(result.length).toBe(2);
  });

  it("mdnsSource 抛错时降级为纯 /24 扫描不崩", async () => {
    const mdnsSource = vi.fn().mockRejectedValue(new Error("no module"));
    const fetchImpl = jsonFetch(new Set());
    const result = await discoverHosts({
      localIp: "10.0.0.9",
      timeoutMs: 30,
      fetchImpl,
      mdnsSource,
    });
    expect(result).toEqual([]);
  });
});
