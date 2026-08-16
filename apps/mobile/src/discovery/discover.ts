/**
 * discover — 局域网自动发现（P2，Expo Go 可用）。
 * 基于本机 IP 推断 /24 候选，并发 GET /api/host.describe 探活（probeHost 纯函数）。
 * mDNS 增强（dev build）接入点：把 discoverHosts 的候选来源换成
 * react-native-zeroconf 结果即可，返回结构不变。
 */

import { probeHost } from "@dsh-remote/protocol";

export interface DiscoveredHost {
  host: string;
  port: number;
  name?: string;
  version?: string;
}

export interface DiscoverOptions {
  localIp: string;
  port?: number;
  concurrency?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_PORT = 3080;
const DEFAULT_CONCURRENCY = 12;

/** 从本机 IP 推断 /24 候选（跳过本机地址与网络/广播地址）。 */
export function deriveCandidates(localIp: string, port = DEFAULT_PORT, maxHosts = 254): Array<{ host: string; port: number }> {
  const parts = localIp.split(".");
  if (parts.length !== 4 || parts.slice(0, 3).some((p) => !/^\d+$/.test(p))) return [];
  const prefix = parts.slice(0, 3).join(".");
  const out: Array<{ host: string; port: number }> = [];
  for (let i = 1; i <= maxHosts; i++) {
    const host = `${prefix}.${i}`;
    if (host === localIp) continue;
    out.push({ host, port });
  }
  return out;
}

/** 并发探活候选主机，返回发现的 DSH 实例（按名称排序，稳定）。 */
export async function discoverHosts(opts: DiscoverOptions): Promise<DiscoveredHost[]> {
  const port = opts.port ?? DEFAULT_PORT;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const candidates = deriveCandidates(opts.localIp, port);
  const results: DiscoveredHost[] = [];
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < candidates.length) {
      const c = candidates[cursor]!;
      cursor += 1;
      const info = await probeHost(c.host, c.port, {
        timeoutMs: opts.timeoutMs,
        fetchImpl: opts.fetchImpl,
      });
      if (info) {
        results.push({ host: c.host, port: c.port, name: info.name, version: info.version });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length || 1) }, () => worker()));
  results.sort((a, b) => (a.name ?? a.host).localeCompare(b.name ?? b.host));
  return results;
}
