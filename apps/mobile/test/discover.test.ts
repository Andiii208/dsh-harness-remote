import { describe, expect, it } from "vitest";
import { deriveCandidates, discoverHosts } from "../src/discovery/discover";

describe("deriveCandidates", () => {
  it("derives a /24 range excluding the device ip", () => {
    const list = deriveCandidates("192.168.1.23", 3080, 4);
    expect(list).toEqual([
      { host: "192.168.1.1", port: 3080 },
      { host: "192.168.1.2", port: 3080 },
      { host: "192.168.1.3", port: 3080 },
      { host: "192.168.1.4", port: 3080 },
    ]);
  });

  it("returns empty for invalid ips", () => {
    expect(deriveCandidates("localhost", 3080)).toEqual([]);
    expect(deriveCandidates("1.2.3", 3080)).toEqual([]);
  });
});

describe("discoverHosts", () => {
  function okFetch(hosts: Set<string>) {
    return (async (input: string | URL | Request) => {
      const u = String(input);
      const host = u.split("/")[2]?.split(":")[0] ?? "";
      if (!hosts.has(host)) throw new Error("unreachable");
      return {
        ok: true,
        json: async () => ({ ok: true, result: { name: `harness-${host}`, version: "0.1.0" } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  it("finds live hosts and ignores dead ones", async () => {
    const live = new Set(["10.0.0.5", "10.0.0.9"]);
    const found = await discoverHosts({
      localIp: "10.0.0.20",
      port: 3080,
      concurrency: 4,
      timeoutMs: 300,
      fetchImpl: okFetch(live),
    });
    expect(found).toHaveLength(2);
    expect(found.map((f) => f.host).sort()).toEqual(["10.0.0.5", "10.0.0.9"]);
    expect(found[0]?.name).toBe("harness-10.0.0.5");
  });

  it("returns empty when nothing responds", async () => {
    const found = await discoverHosts({
      localIp: "10.0.0.20",
      port: 3080,
      concurrency: 2,
      timeoutMs: 100,
      fetchImpl: okFetch(new Set()),
    });
    expect(found).toEqual([]);
  });
});
