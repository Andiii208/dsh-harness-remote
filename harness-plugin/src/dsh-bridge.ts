/**
 * dsh-bridge.ts — 把 DSH Desktop / Harness 的 HTTP API + WebSocket 事件流
 * 桥接到中继（relay）的 console 数据面。
 *
 * 方向 1（手机 → DSH）：收到 relay.route 里的 { rpcId, method, payload } 时，
 * 用 RpcClient 调 DSH 的 POST /api/<method>，然后把 { rpcId, ok, result|error }
 * 原路送回给 device。
 *
 * 方向 2（DSH → 手机）：订阅 DSH 的 WS 流 /api/events.mux 与
 * /api/events.host，把每个下行帧包装成 relay.route 发给已配对的 device。
 *
 * DSH Desktop（56734）与旧 harness（3080）都实现同一套协议；模块只依赖
 * baseUrl，所以两种宿主都能用。
 */

import {
  RpcClient,
  RpcError,
  RELAY_ENVELOPE_VERSION,
  makeRpcId,
  type RelayEnvelope,
} from "@dsh-remote/protocol";
import { execFile as nodeExecFile } from "node:child_process";
import type { RelayClient } from "./relay-client.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * App 端 session.list 只需要摘要字段与少量投影；真实 DSH 返回的
 * session.list 每个会话带完整 projections（contextTimeline/toolList 等），
 * 实测 237 个会话约 10.4 MB，经公网隧道 + 5G 到手机必然超时/挂起。
 * 这里把响应瘦身为 App 实际消费的字段（宽容：结构不认识时原样返回）。
 */
export function slimSessionListResult(result: unknown): unknown {
  if (!isRecord(result)) return result;
  const items = Array.isArray(result.items) ? result.items : null;
  if (!items) return result;

  const slimValues = (values: unknown): unknown => {
    if (!isRecord(values)) return values;
    const picked: Record<string, unknown> = {};
    for (const key of ["title", "goal", "permissions", "imageLimits"]) {
      if (values[key] !== undefined) picked[key] = values[key];
    }
    return picked;
  };

  const slimItem = (item: unknown): unknown => {
    if (!isRecord(item)) return item;
    const next: Record<string, unknown> = {};
    for (const key of [
      "sessionId",
      "id",
      "updatedAt",
      "running",
      "blank",
      "cwd",
      "workspace",
      "agentPreset",
      "title",
      "lastMessage",
    ]) {
      if (item[key] !== undefined) next[key] = item[key];
    }
    const projections = isRecord(item.projections) ? item.projections : null;
    if (projections) {
      const values = isRecord(projections.values) ? projections.values : undefined;
      const slimmed = slimValues(values);
      next.projections = {
        ...(projections.asOfSeq !== undefined ? { asOfSeq: projections.asOfSeq } : {}),
        ...(slimmed !== undefined ? { values: slimmed } : {}),
      };
    }
    return next;
  };

  return { ...result, items: items.map(slimItem) };
}

export interface DshBridgeOptions {
  /** DSH HTTP API base，如 http://127.0.0.1:56734 或 http://127.0.0.1:3080。 */
  baseUrl: string;
  /** 已连接的 relay console 客户端。 */
  relay: RelayClient;
  /** 返回当前配对 device id；未配对时返回 undefined（下行帧丢弃）。 */
  getPeerId?: () => string | undefined;
  /** 注入 fetch（测试用）。 */
  fetchImpl?: typeof fetch;
  /** 状态/错误日志（CLI 打印用）。 */
  onStatus?: (line: string) => void;
  /** 失败帧回调（不中断桥接）。 */
  onError?: (err: unknown) => void;
}

export interface DshBridgeHandle {
  baseUrl: string;
  /** 探测 DSH API 是否可达并启动双 SSE 流；失败抛错。 */
  start(): Promise<void>;
  /** 关闭 SSE 流并退订 relay 信封。 */
  stop(): void;
}

/** 用 host.describe 快速探测 DSH API 是否可达。 */
export async function probeDshApi(baseUrl: string, fetchImpl?: typeof fetch, timeoutMs = 3000): Promise<boolean> {
  const client = new RpcClient({ baseUrl, timeoutMs, fetchImpl });
  try {
    const r = await client.unary("host.describe", {});
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * 解析 `netstat -ano -p tcp` 输出中的回环监听端口。
 * 只接受 127.0.0.1 / 0.0.0.0 / [::1] / [::] 的 LISTENING 行。
 */
export function parseLoopbackListeningPorts(netstatOutput: string): number[] {
  const ports = new Set<number>();
  for (const rawLine of String(netstatOutput ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/LISTENING/i.test(line)) continue;
    const columns = line.split(/\s+/);
    const local = columns[1] ?? "";
    const match = local.match(/^(?:127\.0\.0\.1|0\.0\.0\.0|\[::1\]|\[::\]):(\d+)$/);
    if (!match) continue;
    const port = Number(match[1]);
    if (Number.isInteger(port) && port > 0 && port <= 65535) ports.add(port);
  }
  return [...ports].sort((a, b) => a - b);
}

/**
 * 枚举当前机器上的回环 TCP 监听端口（Windows 用 netstat）。
 * 失败时返回空数组并经 onStatus 留痕（审计 2026-08-23：此前失败完全静默，
 * 导致「只试 56734/3080 死端口」的故障无从排查）。
 */
export function getLoopbackListeningPorts(timeoutMs = 5000, onStatus?: (line: string) => void): Promise<number[]> {
  return new Promise((resolve) => {
    nodeExecFile(
      "netstat",
      ["-ano", "-p", "tcp"],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          onStatus?.(`netstat 回环端口枚举失败：${err.message}`);
          resolve([]);
          return;
        }
        resolve(parseLoopbackListeningPorts(String(stdout ?? "")));
      },
    );
  });
}

export interface DetectDshApiUrlOptions {
  /**
   * 注入回环端口枚举（测试用）。缺省用 netstat 枚举。
   * 枚举实现自身可经 onStatus 报告失败原因。
   */
  listLoopbackPorts?: (onStatus?: (line: string) => void) => Promise<number[]>;
}

/** 从常见环境变量/默认端口里挑一个可达的 DSH API baseUrl。 */
export async function detectDshApiUrl(
  fetchImpl?: typeof fetch,
  onStatus?: (line: string) => void,
  options?: DetectDshApiUrlOptions,
): Promise<string | null> {
  const listPorts = options?.listLoopbackPorts ?? ((onStatus2) => getLoopbackListeningPorts(5000, onStatus2));

  // 1) env 候选最高优先级（当前 DSH Desktop 实例已实测会注入 DSH_WEB_URL），
  //    串行先试；命中即返回，避免无谓的端口枚举。
  const envUrl = process.env.DSH_API_URL ?? process.env.DSH_WEB_URL;
  if (envUrl) {
    const base = envUrl.replace(/\/+$/, "");
    if (await probeDshApi(base, fetchImpl, 3000)) {
      onStatus?.(`已连接 DSH API：${base}`);
      return base;
    }
    onStatus?.(`未检测到 DSH API：${base}（env DSH_API_URL/DSH_WEB_URL）`);
  }

  // 2) 回环端口枚举（失败/为空必须留痕，不再静默）+ 历史兼容端口。
  let ports: number[] = [];
  try {
    ports = await listPorts(onStatus);
  } catch (err) {
    onStatus?.(`netstat 回环端口枚举失败：${err instanceof Error ? err.message : String(err)}`);
  }
  if (ports.length === 0) {
    onStatus?.("netstat 回环端口枚举无结果（可能被沙箱/权限拦截，或 netstat 不可用）");
  }
  const candidates: Array<{ base: string; timeoutMs: number }> = ports.map((port) => ({
    base: `http://127.0.0.1:${port}`,
    timeoutMs: 1500,
  }));
  candidates.push(
    { base: "http://127.0.0.1:56734", timeoutMs: 1500 },
    { base: "http://127.0.0.1:3080", timeoutMs: 1500 },
  );

  const seen = new Set<string>();
  const unique = candidates.filter(({ base }) => {
    if (seen.has(base)) return false;
    seen.add(base);
    return true;
  });

  // 3) 并行探活（串行逐端口最坏 30-40s，审计实测）；命中取候选顺序最前者，
  //    保证优先级确定、不随完成先后漂移。
  const results = await Promise.all(
    unique.map(async ({ base, timeoutMs }) => ({
      base,
      ok: await probeDshApi(base, fetchImpl, timeoutMs),
    })),
  );
  const hit = results.find((r) => r.ok);
  if (hit) {
    onStatus?.(`已连接 DSH API：${hit.base}`);
    return hit.base;
  }
  for (const r of results) {
    onStatus?.(`未检测到 DSH API：${r.base}`);
  }
  return null;
}

export class DshBridge {
  private readonly rpc: RpcClient;
  private readonly relay: RelayClient;
  private readonly getPeerId: () => string | undefined;
  private readonly onStatus?: (line: string) => void;
  private readonly onError?: (err: unknown) => void;
  private readonly sockets = new Set<WebSocket>();
  private readonly reconnectTimers = new Set<ReturnType<typeof setTimeout>>();
  private unsubscribeRelay: (() => void) | null = null;
  private stopped = false;
  /** 已探测为宿主不支持（HTTP 404）的方法缓存；短路后续调用。 */
  private readonly unsupportedMethods = new Set<string>();
  private readonly baseUrlValue: string;

  constructor(opts: DshBridgeOptions) {
    this.baseUrlValue = opts.baseUrl.replace(/\/+$/, "");
    this.rpc = new RpcClient({
      baseUrl: this.baseUrlValue,
      fetchImpl: opts.fetchImpl,
    });
    this.relay = opts.relay;
    this.getPeerId = opts.getPeerId ?? (() => undefined);
    this.onStatus = opts.onStatus;
    this.onError = opts.onError;
  }

  get baseUrl(): string {
    return this.baseUrlValue;
  }

  start(): Promise<void> {
    // 订阅手机 → DSH 的 unary 请求。
    this.unsubscribeRelay = this.relay.onEnvelope((env) => {
      void this.handleRelayEnvelope(env);
    });

    this.onStatus?.(`开始订阅 DSH 事件流 ${this.baseUrl}`);
    this.streamWs("/api/events.mux");
    this.streamWs("/api/events.host");
    return Promise.resolve();
  }

  stop(): void {
    this.stopped = true;
    for (const timer of this.reconnectTimers) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();
    for (const socket of this.sockets) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    }
    this.sockets.clear();
    this.unsubscribeRelay?.();
    this.unsubscribeRelay = null;
  }

  handleRelayEnvelope = async (env: RelayEnvelope): Promise<void> => {
    if (env.type !== "relay.route") return;
    const p = env.payload;
    if (!isRecord(p)) return;
    const rpcId = str(p.rpcId);
    const method = str(p.method);
    if (!rpcId) return;

    // 回信地址：优先 route payload 的 to（设备侧会回填），否则用信封 from。
    const to = str(p.to) ?? str(env.from);
    if (!to) return;

    // 手机 respond 路径：{ rpcId, result }（审批/提问回执）。无 method。
    if (!method && "result" in p) {
      try {
        await this.rpc.respond(rpcId, p.result);
      } catch (err) {
        this.onError?.(err);
      }
      return;
    }

    if (!method) return;

    // 能力缓存：已知宿主不支持（HTTP 404）的方法直接短路，不再撞墙刷错误日志
    // （审计 2026-08-23 P0-4：plugin.list / host.settings.* 在 Desktop 2.0.1 上 404）。
    if (this.unsupportedMethods.has(method)) {
      await this.sendRoute(to, {
        rpcId,
        ok: false,
        error: {
          code: "E_UNSUPPORTED",
          message: `当前 DSH 宿主未实现 ${method}（已探测缓存，不再重试）`,
        },
      });
      return;
    }

    try {
      const r = await this.rpc.unary(method, p.payload ?? {});
      // session.list 在真实 DSH 上返回全量 projections（约 10MB），
      // 经公网隧道到手机必然超时/挂起。桥接层先行瘦身（保留 App 消费字段）。
      const result = method === "session.list" && r.ok
        ? slimSessionListResult(r.result)
        : r.result;
      await this.sendRoute(to, {
        rpcId,
        ok: r.ok,
        ...(r.ok
          ? { result }
          : { error: r.error ?? { code: "E_UNKNOWN", message: "DSH request failed" } }),
      });
    } catch (err) {
      if (err instanceof RpcError && err.code === "HTTP_404") {
        this.unsupportedMethods.add(method);
        this.onStatus?.(`DSH 宿主不支持 ${method}（HTTP 404）——已缓存，后续调用直接短路`);
      } else {
        this.onError?.(err);
      }
      await this.sendRoute(to, {
        rpcId,
        ok: false,
        error: {
          code: err instanceof RpcError && err.code === "HTTP_404" ? "E_UNSUPPORTED" : "E_UNKNOWN",
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  };

  private async sendRoute(to: string, payload: Record<string, unknown>): Promise<void> {
    if (this.stopped) return;
    try {
      await this.relay.send({
        v: RELAY_ENVELOPE_VERSION,
        type: "relay.route",
        id: makeRpcId(),
        from: this.relay.clientId,
        to,
        ts: Date.now(),
        payload: { to, ...payload },
      });
    } catch (err) {
      // 关闭过程中的 socket 竞态不应让 CLI 崩溃；调用方已通过 onError 观察。
      this.onError?.(err);
    }
  }

  private streamWs(path: string): void {
    const ctor = (globalThis as { WebSocket?: new (url: string) => WebSocket }).WebSocket;
    if (!ctor) {
      this.onStatus?.(`DSH 事件流不可用（${path}：无 WebSocket 实现）`);
      return;
    }
    const wsUrl = this.baseUrlValue.replace(/^http/, "ws") + path;
    let socket: WebSocket;
    try {
      socket = new ctor(wsUrl);
    } catch (err) {
      this.onStatus?.(`DSH 事件流不可用（${path}）：${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    this.sockets.add(socket);
    socket.onopen = () => {
      this.onStatus?.(`DSH 事件流已连接（${path}）`);
    };
    socket.onmessage = (ev) => {
      this.handleWsMessage(ev.data);
    };
    socket.onerror = () => {
      this.onStatus?.(`DSH 事件流出错（${path}）——将在 5 秒后重连`);
    };
    socket.onclose = () => {
      this.sockets.delete(socket);
      this.onStatus?.(`DSH 事件流已断开（${path}）`);
      // 自动重连，5 秒后尝试重新订阅
      if (!this.stopped) {
        const timer = setTimeout(() => {
          this.reconnectTimers.delete(timer);
          if (!this.stopped) {
            this.onStatus?.(`正在重连 DSH 事件流（${path}）…`);
            this.streamWs(path);
          }
        }, 5000);
        this.reconnectTimers.add(timer);
      }
    };
  }

  private handleWsMessage(data: unknown): void {
    if (this.stopped) return;
    const peer = this.getPeerId();
    if (!peer) return; // 未配对前不转发下行帧（与集成脚本一致）。

    let parsed: unknown = data;
    if (typeof data === "string") {
      try {
        parsed = JSON.parse(data);
      } catch {
        return; // 非 JSON 心跳/注释，忽略。
      }
    }
    if (!isRecord(parsed)) return;

    // DSH Desktop 用 server-request 信封包下行帧；mock-harness 直接发裸帧。两者都兼容。
    let frame: unknown = parsed;
    if (str(parsed.type) === "server-request" && isRecord(parsed.payload)) {
      frame = parsed.payload;
    }
    if (!isRecord(frame)) return;
    void this.sendRoute(peer, { ...frame });
  }
}
