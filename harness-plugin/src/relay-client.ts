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
  makeHeartbeat,
  makeHello,
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
  /** M3.2 E2E：本 console 的 ECDH 私钥 JWK（与 peerPublicKeyJwk 一起提供时启用加密数据面）。 */
  privateKeyJwk?: JsonWebKey;
  /** M3.2 E2E：对端（device）公钥 JWK。 */
  peerPublicKeyJwk?: JsonWebKey;
  /** 注入 WebCrypto（缺省 globalThis.crypto）。 */
  crypto?: Crypto;
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
 * 配置 E2E 密钥后，relay.route 数据面自动加解密（M3.2）。
 */
export class RelayClient {
  private ws: RelaySocket | null = null;
  private credentialValue: string | null = null;
  private online = false;
  private readonly listeners = new Set<(env: RelayEnvelope) => void>();
  private readonly errorListeners = new Set<(err: unknown) => void>();
  private readonly cryptoImpl: Crypto | null;
  private readonly encKeyPromise: Promise<CryptoKey> | null;
  private connectPromise: Promise<void> | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private handshakeSettled = false;
  private settleHandshake: ((err: Error | null) => void) | null = null;

  constructor(private readonly opts: RelayClientOptions) {
    this.cryptoImpl = opts.crypto
      ?? (globalThis as { crypto?: Crypto }).crypto
      ?? null;

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

  private requireCrypto(): Crypto {
    if (!this.cryptoImpl) {
      throw new Error("RelayClient: no WebCrypto available");
    }
    return this.cryptoImpl;
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
        void this.handleMessage(ev.data);
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

  private async handleMessage(data: unknown): Promise<void> {
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

    let delivered = env;
    if (env.type === "relay.route" && this.encKeyPromise) {
      const routePayload = isRecord(env.payload) ? env.payload : null;
      const ciphertext = routePayload ? str(routePayload.ciphertext) : undefined;
      const nonce = routePayload ? str(routePayload.nonce) : undefined;
      if (ciphertext && nonce) {
        try {
          const crypto = this.requireCrypto();
          const encKey = await this.encKeyPromise;
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
      // 配置了密钥但收到明文 route 则透传（保持 M3.1 兼容）。
    }

    for (const cb of this.listeners) {
      try {
        cb(delivered);
      } catch {
        /* 监听器异常不能打断 socket 收包 */
      }
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
