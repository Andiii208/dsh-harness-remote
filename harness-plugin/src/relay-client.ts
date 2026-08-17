/**
 * relay-client.ts — harness-plugin 出站中继客户端接线桩（M3.1）。
 *
 * ⚠️ 真实 DSH 数据面由插件宿主适配：本类只负责注册/心跳/收发信封。
 * M3.1 为明文联调：send()/onEnvelope() 原样收发 RelayEnvelope，
 * 不解析 DSH frame、不做加密（M3.2 由协议层替换为 sealRelayPayload）。
 */

import {
  makeHeartbeat,
  makeHello,
  makeRegister,
  normalizeRelayError,
  parseRelayEnvelope,
  RELAY_ENVELOPE_VERSION,
} from "@dsh-remote/protocol";
import type {
  RelayEnvelope,
  RelayRegistration,
  WsCtor,
  WsLike,
} from "@dsh-remote/protocol";

const OPEN = 1;
const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;

/** WebSocket 表面：协议包的 WsLike + 发送能力（fake ws 也实现同一表面）。 */
interface RelaySocket extends WsLike {
  send(data: string): void;
}

export interface RelayClientOptions {
  /** relay WebSocket URL，如 ws://127.0.0.1:4090 或 wss://relay.example。 */
  url: string;
  /** 本插件的 console clientId。 */
  clientId: string;
  kind: "console";
  /** 测试可注入 fake WebSocket；缺省用全局 WebSocket。 */
  wsImpl?: WsCtor;
  /** 控制面握手超时（毫秒），默认 15s。 */
  connectTimeoutMs?: number;
}

/** console 注册负载（M3.1）：server 用 consoleId 推断 kind，platform 仅记录。 */
interface ConsoleRegisterPayload {
  consoleId: string;
  kind: "console";
  platform: "node";
  protocolVersion: number;
  publicKey: null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * RelayClient — 最小出站中继客户端接线桩。
 *
 * connect() 打开到 relay 的 WS/WSS 连接并完成 hello + register 控制面握手；
 * 拿到 relay.register.ack 后保存短时 credential 并标记在线。
 * 之后只提供 heartbeat / send / onEnvelope / close 信封级收发能力。
 */
export class RelayClient {
  private ws: RelaySocket | null = null;
  private credentialValue: string | null = null;
  private online = false;
  private readonly listeners = new Set<(env: RelayEnvelope) => void>();
  private connectPromise: Promise<void> | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private handshakeSettled = false;
  private settleHandshake: ((err: Error | null) => void) | null = null;

  constructor(private readonly opts: RelayClientOptions) {}

  /** 最近一次 register.ack 签发的短时 credential（未注册时为 null）。 */
  get credential(): string | null {
    return this.credentialValue;
  }

  isOnline(): boolean {
    return this.online;
  }

  /** 打开 WS/WSS，发 relay.hello + relay.register，收到 register.ack 后 resolve。 */
  connect(): Promise<void> {
    if (this.online) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.doConnect().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  /** 发送 relay.heartbeat（from=clientId, to="relay"）。 */
  heartbeat(): void {
    this.sendEnvelope(makeHeartbeat(this.opts.clientId));
  }

  /** 发送任意 RelayEnvelope（信封级透传）。 */
  send(envelope: RelayEnvelope): void {
    this.sendEnvelope(envelope);
  }

  /** 订阅收到的 RelayEnvelope；返回取消订阅函数。 */
  onEnvelope(cb: (env: RelayEnvelope) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  close(): void {
    this.online = false;
    this.credentialValue = null;
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onmessage = null;
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* close() 不抛错 */
      }
    }
    this.settleHandshake?.(new Error("RelayClient: closed"));
  }

  private doConnect(): Promise<void> {
    const ctor = this.opts.wsImpl
      ?? (globalThis as { WebSocket?: WsCtor }).WebSocket;
    if (!ctor) {
      return Promise.reject(new Error("RelayClient: no WebSocket implementation available"));
    }

    const ws = new ctor(this.opts.url) as unknown as RelaySocket;
    if (typeof ws.send !== "function") {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      return Promise.reject(
        new Error("RelayClient: WebSocket implementation must provide send()"),
      );
    }
    this.ws = ws;

    const timeoutMs = this.opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;

    return new Promise<void>((resolve, reject) => {
      this.handshakeSettled = false;
      this.settleHandshake = (err: Error | null): void => {
        if (this.handshakeSettled) return;
        this.handshakeSettled = true;
        this.settleHandshake = null;
        if (this.handshakeTimer) {
          clearTimeout(this.handshakeTimer);
          this.handshakeTimer = null;
        }
        if (err) {
          this.online = false;
          reject(err);
        } else {
          this.online = true;
          resolve();
        }
      };

      this.handshakeTimer = setTimeout(() => {
        this.settleHandshake?.(
          new Error(
            `RelayClient: relay.register.ack not received before ${timeoutMs}ms timeout`,
          ),
        );
        this.close();
      }, timeoutMs);

      ws.onmessage = (ev) => {
        this.handleMessage(ev.data);
      };
      ws.onclose = () => {
        this.online = false;
        this.ws = null;
        this.settleHandshake?.(
          new Error("RelayClient: ws closed before relay.register.ack"),
        );
      };
      ws.onerror = () => {
        /* surfaced via onclose / timeout */
      };
      ws.onopen = () => {
        try {
          this.sendEnvelope(makeHello(this.opts.clientId));
          this.sendEnvelope(
            makeRegister(this.opts.clientId, this.registerPayload()),
          );
        } catch (err) {
          this.settleHandshake?.(err instanceof Error ? err : new Error(String(err)));
          this.close();
        }
      };

      // 注入的 fake ws 可能在构造器内同步 open。
      if (ws.readyState === OPEN) ws.onopen?.();
    });
  }

  private registerPayload(): RelayRegistration {
    const payload: ConsoleRegisterPayload = {
      consoleId: this.opts.clientId,
      kind: this.opts.kind,
      platform: "node",
      protocolVersion: RELAY_ENVELOPE_VERSION,
      publicKey: null,
    };
    // 运行期 server 兼容 consoleId/kind/"node" platform；RelayRegistration 的
    // 静态类型以 device 视角为主，这里按 M3.1 console 接线桩负载透传。
    return payload as unknown as RelayRegistration;
  }

  private handleMessage(data: unknown): void {
    let env: RelayEnvelope | null = null;
    if (typeof data === "string") {
      try {
        env = parseRelayEnvelope(JSON.parse(data) as unknown);
      } catch {
        env = null;
      }
    } else {
      env = parseRelayEnvelope(data);
    }
    if (!env) return;

    if (env.type === "relay.register.ack") {
      const payload = isRecord(env.payload) ? env.payload : {};
      const credential = str(payload.credential);
      if (credential) this.credentialValue = credential;
      this.settleHandshake?.(null);
    } else if (env.type === "relay.error") {
      const err = normalizeRelayError(env.payload);
      this.settleHandshake?.(
        new Error(`RelayClient: relay error ${err.code}: ${err.message}`),
      );
    }

    for (const cb of this.listeners) {
      try {
        cb(env);
      } catch {
        /* 监听器异常不能打断 socket 收包 */
      }
    }
  }

  private sendEnvelope(env: RelayEnvelope): void {
    if (!this.ws || this.ws.readyState !== OPEN) {
      throw new Error("RelayClient: socket is not open");
    }
    this.ws.send(JSON.stringify(env));
  }
}
