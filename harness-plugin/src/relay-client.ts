/**
 * relay-client.ts — harness-plugin 出站中继客户端接线桩（M3.2）。
 *
 * ⚠️ 真实 DSH 数据面由插件宿主适配：本类只负责注册/心跳/收发信封。
 * M3.2 起支持加密数据面：配置 privateKeyJwk + peerPublicKeyJwk 后，
 * `send(relay.route)` 会把内层 payload 用 sealRelayPayload 密封为
 * `{ to, ciphertext, nonce }`；收到加密 route 则先 openRelayPayload
 * 解密再把内层 payload 交给 onEnvelope 回调。未配置密钥时保持 M3.1
 * 明文路径不变。
 */

import {
  deriveRelaySessionKeys,
  generateRelayKeyPair,
  makeHeartbeat,
  makeHello,
  makePairCode,
  makeRegister,
  normalizeRelayError,
  openRelayPayload,
  parseRelayEnvelope,
  RELAY_ENVELOPE_VERSION,
  sealRelayPayload,
} from "@dsh-remote/protocol";
import type {
  RelayEnvelope,
  RelayRegistration,
  WsCtor,
  WsLike,
} from "@dsh-remote/protocol";

const OPEN = 1;
const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
const DEFAULT_RECONNECT_BASE_MS = 1_000;
const DEFAULT_RECONNECT_MAX_MS = 60_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

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
  /**
   * 断线自动重连（审计 2026-08-27 A3）：指数退避 1s→2s→4s…封顶 60s；
   * register.ack 成功后计数归零并重启心跳。close() 视为主动放弃不重连。
   * 默认关闭；console 宿主（remote-access）开启。
   */
  autoReconnect?: boolean;
  /** 首次重连等待基数（毫秒），默认 1000。 */
  reconnectBaseMs?: number;
  /** 重连等待上限（毫秒），默认 60000。 */
  reconnectMaxMs?: number;
  /** 心跳间隔（毫秒），默认 30000；仅 autoReconnect 开启时调度。 */
  heartbeatIntervalMs?: number;
  /** 连接状态变化回调：register.ack 成功 true、socket 意外断开 false。 */
  onConnectionChange?: (online: boolean) => void;
  /** 内部日志（重连计划等），宿主可接状态日志。 */
  onLog?: (line: string) => void;
  /** M3.2 E2E：本 console 的 ECDH 私钥 JWK（与 peerPublicKeyJwk 一起提供时启用加密数据面）。 */
  privateKeyJwk?: JsonWebKey;
  /** M3.2 E2E：对端（device）公钥 JWK。 */
  peerPublicKeyJwk?: JsonWebKey;
  /** 注入 WebCrypto（缺省 globalThis.crypto）。 */
  crypto?: Crypto;
  /** M3.3：APNs/FCM 推送 token，注册时上报给 relay 用于离线唤醒。 */
  pushToken?: string;
  /** M3.5：收到 relay.pair.ack 配对通知后回调（deviceId 与对端公钥）。 */
  onPaired?: (info: { deviceId: string; peerPublicKey: unknown }) => void;
}

/** 从 EC 私钥 JWK 提取可注册的公钥视图（只含 kty/crv/x/y，绝不外泄 d）。 */
function publicJwkFromPrivate(privateKeyJwk: JsonWebKey): JsonWebKey | undefined {
  const { kty, crv, x, y } = privateKeyJwk;
  if (kty && crv && x && y) return { kty, crv, x, y };
  return undefined;
}

/** console 注册负载（M3.1）：server 用 consoleId 推断 kind，platform 仅记录。 */
interface ConsoleRegisterPayload {
  consoleId: string;
  kind: "console";
  platform: "node";
  protocolVersion: number;
  publicKey: JsonWebKey | null;
  pushToken?: string;
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
 * 配置 E2E 密钥后，relay.route 数据面自动加解密（M3.2）。
 */
export class RelayClient {
  private ws: RelaySocket | null = null;
  private credentialValue: string | null = null;
  private online = false;
  private readonly listeners = new Set<(env: RelayEnvelope) => void>();
  private readonly errorListeners = new Set<(err: unknown) => void>();
  private readonly cryptoImpl: Crypto | null;
  private encKeyPromise: Promise<CryptoKey> | null;
  private privateKeyValue: JsonWebKey | null;
  private publicKeyValue: JsonWebKey | null;
  private connectPromise: Promise<void> | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private handshakeSettled = false;
  private settleHandshake: ((err: Error | null) => void) | null = null;
  private readonly pairCodeWaiters = new Map<string, { resolve: (code: string) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  /** 自动重连/心跳相关状态（A3）。 */
  private userClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;

  constructor(private readonly opts: RelayClientOptions) {
    this.cryptoImpl = opts.crypto
      ?? (globalThis as { crypto?: Crypto }).crypto
      ?? null;
    this.privateKeyValue = opts.privateKeyJwk ?? null;
    this.publicKeyValue = opts.privateKeyJwk
      ? (publicJwkFromPrivate(opts.privateKeyJwk) ?? null)
      : null;

    if (opts.privateKeyJwk && opts.peerPublicKeyJwk) {
      if (!this.cryptoImpl) {
        throw new Error(
          "RelayClient: privateKeyJwk/peerPublicKeyJwk provided but no WebCrypto available",
        );
      }
      // 双方 key 都提供时派生 AES-256-GCM 会话密钥；派生是异步的，
      // send/收包路径会 await 该 Promise。
      this.encKeyPromise = deriveRelaySessionKeys(
        this.cryptoImpl,
        opts.privateKeyJwk,
        opts.peerPublicKeyJwk,
      ).then((keys) => keys.encKey);
    } else {
      this.encKeyPromise = null;
    }
  }

  /** 最近一次 register.ack 签发的短时 credential（未注册时为 null）。 */
  get credential(): string | null {
    return this.credentialValue;
  }

  /** console 注册 clientId（数据面信封 from 字段使用）。 */
  get clientId(): string {
    return this.opts.clientId;
  }

  isOnline(): boolean {
    return this.online;
  }

  /** 打开 WS/WSS，发 relay.hello + relay.register，收到 register.ack 后 resolve。 */
  connect(): Promise<void> {
    this.userClosed = false;
    if (this.online) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.doConnect().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  /**
   * 意外断线后的重连调度（A3）：指数退避，上限封顶；
   * register.ack 成功把计数归零。close() 视为主动放弃不进入本路径。
   */
  private scheduleReconnect(): void {
    if (!this.opts.autoReconnect || this.userClosed) return;
    const baseMs = this.opts.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
    const maxMs = this.opts.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
    const delay = Math.min(baseMs * 2 ** this.reconnectAttempt, maxMs);
    this.reconnectAttempt += 1;
    this.opts.onLog?.(`relay 连接断开，${delay}ms 后自动重连（第 ${this.reconnectAttempt} 次）…`);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect().catch(() => {});
    }, delay);
  }

  /** 心跳保活：仅 autoReconnect 开启时调度；socket 已死由 onclose 接管。 */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    const intervalMs = this.opts.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    if (!this.opts.autoReconnect || intervalMs <= 0) return;
    this.heartbeatTimer = setInterval(() => {
      try {
        this.heartbeat();
      } catch {
        /* socket 已死：onclose 会触发退避重连 */
      }
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /** 发送 relay.heartbeat（from=clientId, to="relay"）。 */
  heartbeat(): void {
    this.sendEnvelope(makeHeartbeat(this.opts.clientId));
  }

  /**
   * R5a/R4：向 relay 请求一个一次性 6 位配对码。
   * 已连接后调用；返回 relay.pair.code.ack 中的 code。
   */
  requestPairCode(ttlMs?: number): Promise<string> {
    if (!this.online || !this.ws) {
      return Promise.reject(new Error("RelayClient: not connected"));
    }
    const id = `pair-code-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pairCodeWaiters.delete(id);
        reject(new Error("RelayClient: relay.pair.code.ack not received before timeout"));
      }, this.opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS);
      this.pairCodeWaiters.set(id, { resolve, reject, timer });
      try {
        this.sendEnvelope(
          makePairCode(this.opts.clientId, ttlMs !== undefined ? { ttlMs } : undefined, { id }),
        );
      } catch (err) {
        clearTimeout(timer);
        this.pairCodeWaiters.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * 发送 RelayEnvelope。relay.route 且配置了 E2E 密钥时，把 payload 密封成
   * `{ to, ciphertext, nonce }` 后发送；其余类型（或未配置密钥）原样发送。
   */
  async send(envelope: RelayEnvelope): Promise<void> {
    if (envelope.type !== "relay.route" || !this.encKeyPromise) {
      this.sendEnvelope(envelope);
      return;
    }

    const payload = isRecord(envelope.payload) ? envelope.payload : {};
    const to = str(payload.to);
    if (to === undefined) {
      // route payload 缺 to 时无法构造密文路由，按明文原样发送保持兼容。
      this.sendEnvelope(envelope);
      return;
    }

    const crypto = this.requireCrypto();
    const encKey = await this.encKeyPromise;
    const sealed = await sealRelayPayload(crypto, encKey, envelope.payload);
    this.sendEnvelope({
      ...envelope,
      payload: { to, ...sealed },
    });
  }

  /** 订阅收到的 RelayEnvelope（加密 route 会先解密为内层 payload）；返回取消订阅函数。 */
  onEnvelope(cb: (env: RelayEnvelope) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** 订阅解密/处理错误（如收到无法解密的 route）；返回取消订阅函数。 */
  onError(cb: (err: unknown) => void): () => void {
    this.errorListeners.add(cb);
    return () => {
      this.errorListeners.delete(cb);
    };
  }

  close(): void {
    this.userClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
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
    for (const waiter of this.pairCodeWaiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("RelayClient: closed"));
    }
    this.pairCodeWaiters.clear();
  }

  private requireCrypto(): Crypto {
    if (!this.cryptoImpl) {
      throw new Error("RelayClient: no WebCrypto available");
    }
    return this.cryptoImpl;
  }

  /** 丢弃当前 socket（不置 userClosed）：握手超时/握手期异常用，保留重连能力。 */
  private abandonSocket(): void {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
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
          // 连接确立：重置退避计数、启动心跳、对外宣告在线。
          this.online = true;
          this.reconnectAttempt = 0;
          this.startHeartbeat();
          this.opts.onConnectionChange?.(true);
          resolve();
        }
      };

      this.handshakeTimer = setTimeout(() => {
        // 握手超时 ≠ 用户放弃：只丢弃当前 socket，保留自动重连计划。
        this.settleHandshake?.(
          new Error(
            `RelayClient: relay.register.ack not received before ${timeoutMs}ms timeout`,
          ),
        );
        this.abandonSocket();
        this.online = false;
        this.scheduleReconnect();
      }, timeoutMs);

      ws.onmessage = (ev) => {
        void this.handleMessage(ev.data);
      };
      ws.onclose = () => {
        this.online = false;
        this.ws = null;
        this.stopHeartbeat();
        this.opts.onConnectionChange?.(false);
        this.settleHandshake?.(
          new Error("RelayClient: ws closed before relay.register.ack"),
        );
        this.scheduleReconnect();
      };
      ws.onerror = () => {
        /* surfaced via onclose / timeout */
      };
      ws.onopen = () => {
        void (async () => {
          try {
            this.sendEnvelope(makeHello(this.opts.clientId));
            // M3.5：未注入私钥时，注册前自动生成 ECDH P-256 keypair，让
            // relay 能拿到 console 公钥转交给配对 device。生成失败或无
            // WebCrypto 时降级为 publicKey null（保持不崩）。
            if (this.publicKeyValue === null && this.cryptoImpl && this.opts.privateKeyJwk === undefined) {
              await this.ensurePublicKey();
            }
            this.sendEnvelope(
              makeRegister(this.opts.clientId, this.registerPayload()),
            );
          } catch (err) {
            this.settleHandshake?.(err instanceof Error ? err : new Error(String(err)));
            this.abandonSocket();
            this.online = false;
            this.scheduleReconnect();
          }
        })();
      };

      // 注入的 fake ws 可能在构造器内同步 open。
      if (ws.readyState === OPEN) ws.onopen?.();
    });
  }

  /** 未注入私钥时生成 ECDH keypair；失败或无 crypto 时静默降级为 null。 */
  private async ensurePublicKey(): Promise<void> {
    if (!this.cryptoImpl) return;
    try {
      const pair = await generateRelayKeyPair(this.cryptoImpl);
      this.privateKeyValue = pair.privateKeyJwk;
      this.publicKeyValue = pair.publicKeyJwk;
    } catch {
      this.privateKeyValue = null;
      this.publicKeyValue = null;
    }
  }

  private registerPayload(): RelayRegistration {
    const payload: ConsoleRegisterPayload = {
      consoleId: this.opts.clientId,
      kind: this.opts.kind,
      platform: "node",
      protocolVersion: RELAY_ENVELOPE_VERSION,
      publicKey: this.publicKeyValue ?? null,
      ...(this.opts.pushToken !== undefined
        ? { pushToken: this.opts.pushToken }
        : {}),
    };
    // 运行期 server 兼容 consoleId/kind/"node" platform；RelayRegistration 的
    // 静态类型以 device 视角为主，这里按 M3.1 console 接线桩负载透传。
    return payload as unknown as RelayRegistration;
  }

  /** 宽容解析入站信封；非法/未知帧返回 null 直接忽略。 */
  private parseEnvelope(data: unknown): RelayEnvelope | null {
    try {
      const raw = typeof data === "string" ? (JSON.parse(data) as unknown) : data;
      return parseRelayEnvelope(raw);
    } catch {
      return null;
    }
  }

  private async handleMessage(data: unknown): Promise<void> {
    const env = this.parseEnvelope(data);
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
    } else if (env.type === "relay.pair.code.ack") {
      // R5a/R4：收到 relay 签发的一次性配对码，settle 对应请求。
      const payload = isRecord(env.payload) ? env.payload : {};
      const code = str(payload.code);
      const waiter = this.pairCodeWaiters.get(env.id);
      if (waiter) {
        this.pairCodeWaiters.delete(env.id);
        clearTimeout(waiter.timer);
        if (code && /^\d{6}$/.test(code)) waiter.resolve(code);
        else waiter.reject(new Error("RelayClient: relay.pair.code.ack missing code"));
      }
    } else if (env.type === "relay.pair.ack" && env.from === "relay") {
      // M3.5：配对通知只安装会话密钥并触发 onPaired，不 settle 控制面握手。
      void this.handlePairAck(env.payload);
    }

    let delivered = env;
    if (env.type === "relay.route") {
      const routePayload = isRecord(env.payload) ? env.payload : null;
      const ciphertext = routePayload ? str(routePayload.ciphertext) : undefined;
      const nonce = routePayload ? str(routePayload.nonce) : undefined;

      // C3：带密文的 route 但本端没有会话密钥（pair.ack 丢失/密钥丢失）
      // ——丢弃并告警，绝不把解不开的原始负载塞给宿主。
      if (ciphertext && nonce && !this.encKeyPromise) {
        this.emitError(new Error("RelayClient: 收到加密 route 但本端未配置会话密钥，已丢弃"));
        return;
      }
      if (ciphertext && nonce && this.encKeyPromise) {
        try {
          const crypto = this.requireCrypto();
          const encKey = await this.encKeyPromise;
          if (!encKey) throw new Error("session key unavailable");
          const inner = await openRelayPayload(crypto, encKey, {
            ciphertext,
            nonce,
          });
          delivered = { ...env, payload: inner };
        } catch (err) {
          // 解密失败：丢弃该帧并通知宿主（测试覆盖）。
          this.emitError(err);
          return;
        }
      }
      // 真·明文 route（无 ciphertext 字段）：保持 M3.1 兼容透传。
    }

    for (const cb of this.listeners) {
      try {
        cb(delivered);
      } catch {
        /* 监听器异常不能打断 socket 收包 */
      }
    }
  }

  private async handlePairAck(payload: unknown): Promise<void> {
    const info = isRecord(payload) ? payload : {};
    const deviceId = str(info.deviceId);
    const peerPublicKey = info.peerPublicKey;

    if (deviceId !== undefined && this.privateKeyValue && isRecord(peerPublicKey) && this.cryptoImpl) {
      try {
        const keys = await deriveRelaySessionKeys(
          this.cryptoImpl,
          this.privateKeyValue,
          peerPublicKey as unknown as JsonWebKey,
        );
        this.encKeyPromise = Promise.resolve(keys.encKey);
      } catch (err) {
        // 对端公钥无效/派生失败：保持明文兼容，但必须留痕（C3 静默降级消除）。
        this.opts.onLog?.(
          `E2E 会话密钥派生失败，已回退明文兼容：${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (deviceId !== undefined) {
      this.opts.onPaired?.({ deviceId, peerPublicKey });
    }
  }

  private emitError(err: unknown): void {
    for (const cb of this.errorListeners) {
      try {
        cb(err);
      } catch {
        /* 错误监听器异常忽略 */
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
