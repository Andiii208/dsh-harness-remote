/**
 * discovery — LAN 发现与二维码配对载荷（P2）。
 * 纯函数、零依赖：probeHost 可注入 fetch（单测）；build/parsePairPayload
 * 定义 dshremote://pair 深链契约。mDNS 增强走 DiscoverySource 接口（见文档）。
 */

export interface HostInfo {
  name?: string;
  version?: string;
  [k: string]: unknown;
}

export interface PairPayload {
  host: string;
  port: number;
  token?: string;
}

/** R1/R4 远程连接扫码载荷：dshremote://remote?addr=...&code=... */
export interface RemotePairPayload {
  addr: string;
  code?: string;
}

export interface ProbeOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** 外部取消信号：与内部超时合并，取消时立即中断在途请求。 */
  signal?: AbortSignal;
}

const DEFAULT_PROBE_TIMEOUT = 1200;

/**
 * 探活一个候选主机：GET /api/host.describe，返回实例信息或 null。
 * 失败（超时/非 2xx/信封无效）一律返回 null——探测不抛错。
 */
export async function probeHost(host: string, port: number, opts: ProbeOptions = {}): Promise<HostInfo | null> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_PROBE_TIMEOUT;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onExternalAbort, { once: true });
  try {
    const res = await fetchImpl(`http://${host}:${port}/api/host.describe`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!body || typeof body !== "object") return null;
    const b = body as Record<string, unknown>;
    if (b.ok !== true || !b.result || typeof b.result !== "object") return null;
    return b.result as HostInfo;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onExternalAbort);
  }
}

/** 构造配对深链：dshremote://pair?host=...&port=...&token=... */
export function buildPairPayload(p: PairPayload): string {
  const q = new URLSearchParams();
  q.set("host", p.host);
  q.set("port", String(p.port));
  if (p.token) q.set("token", p.token);
  return `dshremote://pair?${q.toString()}`;
}

/** 解析配对深链；格式不合法返回 null。 */
export function parsePairPayload(url: string): PairPayload | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "dshremote:" || u.hostname !== "pair") return null;
    const host = u.searchParams.get("host");
    const portRaw = u.searchParams.get("port");
    const port = Number.parseInt(portRaw ?? "", 10);
    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) return null;
    const token = u.searchParams.get("token") ?? undefined;
    return { host, port, token: token && token.length > 0 ? token : undefined };
  } catch {
    return null;
  }
}

/** 构造远程连接二维码/深链：dshremote://remote?addr=...&code=... */
export function buildRemotePairPayload(p: RemotePairPayload): string {
  const q = new URLSearchParams();
  q.set("addr", p.addr);
  if (p.code) q.set("code", p.code);
  return `dshremote://remote?${q.toString()}`;
}

/** 解析远程连接二维码/深链；格式不合法返回 null。 */
export function parseRemotePairPayload(url: string): RemotePairPayload | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "dshremote:" || u.hostname !== "remote") return null;
    const addr = u.searchParams.get("addr");
    if (!addr || addr.trim().length === 0) return null;
    const code = u.searchParams.get("code") ?? undefined;
    return {
      addr: addr.trim(),
      ...(code && /^\d{6}$/.test(code) ? { code } : {}),
    };
  } catch {
    return null;
  }
}
