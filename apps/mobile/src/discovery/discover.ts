/**
 * discover — 局域网自动发现（P2 + P3/mDNS 增强）。
 * 候选来源两路合并：
 * 1) 本机 IP 推断的 /24（默认 3080 端口）——Expo Go 可用；
 * 2) react-native-zeroconf 的 Bonjour `_http._tcp` 浏览结果（dev/prod build
 *    自动链接原生模块；Expo Go 无该模块时静默跳过）——命中任意端口/跨网段主机。
 * 两路候选统一并发 GET /api/host.describe 探活后去重返回。
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
  /** 取消信号：页面卸载/用户离开时中断扫描（评审 #11）。 */
  signal?: AbortSignal;
  /** mDNS 候选注入（测试用）；缺省尝试 react-native-zeroconf。 */
  mdnsSource?: (signal?: AbortSignal) => Promise<Array<{ host: string; port: number; name?: string }>>;
}

/** zeroconf 候选：动态 import 缺失模块 / 平台不支持时静默为空。 */
export async function browseZeroconfHttp(signal?: AbortSignal): Promise<Array<{ host: string; port: number; name?: string }>> {
  try {
    const mod = await import("react-native-zeroconf");
    const ZeroconfCtor = (mod as { default?: new () => ZeroconfLike }).default ?? (mod as unknown as new () => ZeroconfLike);
    const zc = new ZeroconfCtor();
    return await new Promise<Array<{ host: string; port: number; name?: string }>>((resolve) => {
      const done = (v: Array<{ host: string; port: number; name?: string }>) => {
        clearTimeout(timer);
        try { zc.stop(); zc.removeDeviceListeners(); } catch { /* ignore */ }
        resolve(v);
      };
      const found = new Map<string, { host: string; port: number; name?: string }>();
      const onResolved = (svc: ZeroconfService): void => {
        const host = svc.addresses?.find((a) => a.includes(".")) ?? svc.host ?? "";
        const portNum = typeof svc.port === "number" ? svc.port : DEFAULT_PORT;
        if (!host) return;
        found.set(`${host}:${portNum}`, { host, port: portNum, name: svc.name });
      };
      const timer = setTimeout(() => done([...found.values()]), 3000);
      signal?.addEventListener("abort", () => done([]));
      zc.on("resolved", onResolved);
      zc.scan("http", "tcp", "");
    });
  } catch {
    return [];
  }
}

interface ZeroconfLike {
  scan(type: string, protocol: string, domain: string): void;
  stop(): void;
  removeDeviceListeners(): void;
  on(event: "resolved", cb: (svc: ZeroconfService) => void): void;
}
interface ZeroconfService {
  name?: string;
  host?: string;
  port?: number;
  addresses?: string[];
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
  // mDNS 候选与 /24 扫描并行产出；去重交给探活后的 merge。
  const mdns = opts.mdnsSource ?? browseZeroconfHttp;
  let mdnsList: Array<{ host: string; port: number; name?: string }> = [];
  try {
    mdnsList = opts.signal?.aborted ? [] : await mdns(opts.signal);
  } catch {
    mdnsList = [];
  }
  const fromMdns = mdnsList.map((e) => ({ host: e.host, port: e.port, name: e.name }));
  const sweep = deriveCandidates(opts.localIp, port).map((c) => ({
    ...c,
    name: undefined as string | undefined,
  }));
  const seen = new Set(fromMdns.map((c) => `${c.host}:${c.port}`));
  const candidates = [...fromMdns, ...sweep.filter((c) => !seen.has(`${c.host}:${c.port}`))];
  const results: DiscoveredHost[] = [];
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < candidates.length) {
      if (opts.signal?.aborted) return;
      const c = candidates[cursor]!;
      cursor += 1;
      const info = await probeHost(c.host, c.port, {
        timeoutMs: opts.timeoutMs,
        fetchImpl: opts.fetchImpl,
        signal: opts.signal,
      });
      if (info) {
        results.push({ host: c.host, port: c.port, name: info.name, version: info.version });
      }
    }
  }
  const workers = Math.min(concurrency, candidates.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  results.sort((a, b) => (a.name ?? a.host).localeCompare(b.name ?? b.host));
  return results;
}
