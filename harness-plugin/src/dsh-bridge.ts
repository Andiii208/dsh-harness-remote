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
  RELAY_ENVELOPE_VERSION,
  makeRpcId,
  type RelayEnvelope,
} from "@dsh-remote/protocol";
import type { RelayClient } from "./relay-client.js";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
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
export async function probeDshApi(baseUrl: string, fetchImpl?: typeof fetch): Promise<boolean> {
  const client = new RpcClient({ baseUrl, timeoutMs: 3000, fetchImpl });
  try {
    const r = await client.unary("host.describe", {});
    return r.ok;
  } catch {
    return false;
  }
}

/** 从常见环境变量/默认端口里挑一个可达的 DSH API baseUrl。 */
export async function detectDshApiUrl(
  fetchImpl?: typeof fetch,
  onStatus?: (line: string) => void,
): Promise<string | null> {
  const candidates: string[] = [];
  const envUrl = process.env.DSH_API_URL ?? process.env.DSH_WEB_URL;
  if (envUrl) candidates.push(envUrl.replace(/\/+$/, ""));
  candidates.push("http://127.0.0.1:56734", "http://127.0.0.1:3080");
  const seen = new Set<string>();
  for (const base of candidates) {
    if (seen.has(base)) continue;
    seen.add(base);
    if (await probeDshApi(base, fetchImpl)) {
      onStatus?.(`已连接 DSH API：${base}`);
      return base;
    }
    onStatus?.(`未检测到 DSH API：${base}`);
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

  private async handleRelayEnvelope(env: RelayEnvelope): Promise<void> {
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

    try {
      const r = await this.rpc.unary(method, p.payload ?? {});
      await this.sendRoute(to, {
        rpcId,
        ok: r.ok,
        ...(r.ok
          ? { result: r.result }
          : { error: r.error ?? { code: "E_UNKNOWN", message: "DSH request failed" } }),
      });
    } catch (err) {
      this.onError?.(err);
      await this.sendRoute(to, {
        rpcId,
        ok: false,
        error: {
          code: "E_UNKNOWN",
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

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
