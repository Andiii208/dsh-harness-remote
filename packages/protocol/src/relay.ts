/**
 * Relay (M3) control-plane envelope types, pure parsers, pure request
 * constructors, and the M3.1 RelayTransport (plaintext debug transport).
 *
 * The relay moves the same DSH wire protocol over an E2E-encrypted outbound
 * connection. These definitions are intentionally additive: they do not
 * change any existing envelope/frame behavior. `parseRelayEnvelope` follows
 * the same lenient rules as `decodeEnvelope` — never throw on arbitrary input.
 */

import { decodeFrame, type DownlinkFrame } from "./codec.js";
import { makeRpcId } from "./envelopes.js";
import {
  deriveRelaySessionKeys,
  generateRelayKeyPair,
  openRelayPayload,
  sealRelayPayload,
} from "./relay-crypto.js";
import type { RpcResult } from "./rpc.js";
import type { Auth, Connection, Endpoint, Transport } from "./transport.js";
import { FrameQueue, type WsCtor, type WsLike } from "./ws.js";

export const RELAY_ENVELOPE_VERSION = 1;

export type RelayEnvelopeType =
  | "relay.hello"
  | "relay.hello.ack"
  | "relay.register"
  | "relay.register.ack"
  | "relay.pair"
  | "relay.pair.ack"
  | "relay.pair.code"
  | "relay.pair.code.ack"
  | "relay.route"
  | "relay.route.ack"
  | "relay.heartbeat"
  | "relay.heartbeat.ack"
  | "relay.error";

export type RelayErrorCode =
  | "E_BAD_ENVELOPE"
  | "E_AUTH"
  | "E_PAIR"
  | "E_ROUTE"
  | "E_EXPIRED"
  | "E_RATE"
  | "E_UNKNOWN";

export interface RelayError {
  code: RelayErrorCode;
  message: string;
  details?: unknown;
}

/** M3.1 device registration payload. */
export interface RelayRegistration {
  deviceId: string;
  /** ECDH public key (JWK) the device generated for the relay session. */
  publicKey: unknown;
  /** APNs / FCM push token for wake-ups. */
  pushToken?: string;
  platform?: "ios" | "android" | "web";
  protocolVersion?: number;
}

/** M3.1 pairing payload: the mobile app asks the relay to pair with a console code. */
export interface RelayPairing {
  code: string;
  deviceId: string;
}

/** M3.5 payload: an authenticated console asks the relay for a one-time 6-digit code. */
export interface RelayPairCodeRequest {
  /** Optional lifetime for the code (defaults to 10 minutes). */
  ttlMs?: number;
}

/** M3.5 ack payload: the one-time 6-digit pairing code issued to the console. */
export interface RelayPairCodeAck {
  code: string;
  /** Requested/actual lifetime in ms. */
  ttlMs: number;
}

/** M3.2 routing payload: relay delivers this opaque encrypted payload to the peer. */
export interface RelayRoute {
  /** Opaque encrypted envelope (ciphertext + nonce + ephemeral key). */
  ciphertext: string;
  nonce: string;
  /** Target device id / console id. */
  to: string;
}

/** M3.3 heartbeat payload (optional latency/backpressure hints). */
export interface RelayHeartbeat {
  rttMs?: number;
  backpressure?: "none" | "pause" | "drop";
}

export interface RelayEnvelope {
  v: typeof RELAY_ENVELOPE_VERSION;
  type: RelayEnvelopeType;
  /** Correlation id for request/response pairs. */
  id: string;
  /** Sender id (deviceId / consoleId / relay). */
  from: string;
  /** Receiver id; empty for relay-addressed control messages. */
  to: string;
  /** Unix ms timestamp. */
  ts: number;
  payload?: unknown;
}

/** RelayTransport constructor options (tests inject wsImpl / timeouts / ids). */
export interface RelayTransportOptions {
  wsImpl?: WsCtor;
  connectTimeoutMs?: number;
  /** Optional default relay base URL (ws://host:port or wss://host[:port]). */
  relayUrl?: string;
  deviceId?: string;
  /** M3.3: APNs/FCM push token reported to the relay during register. */
  pushToken?: string;
  /** M3.1 dev target: peer id used as the relay.route `to` for data-plane traffic. */
  peerId?: string;
  /** M3.2: local ECDH private JWK (kept by the client, never sent to relay). */
  privateKeyJwk?: JsonWebKey;
  /** M3.2: peer ECDH public JWK (from relay.pair.ack). */
  peerPublicKeyJwk?: JsonWebKey;
  /** M3.2: WebCrypto injection point; defaults to globalThis.crypto. */
  crypto?: Crypto;
  /** M3.5: 6-digit pairing code. When set, connect() sends relay.pair after
   * the hello/register handshake and waits for relay.pair.ack before resolving. */
  pairCode?: string;
  /** M3.5: called after relay.pair.ack (pairing succeeded). */
  onPairAck?: (ack: { consoleId: string; peerPublicKey: unknown }) => void;
  /** 0.4：接收 console 推送的主机事件（隧道地址变更等）。 */
  onHostEvent?: (event: Record<string, unknown>) => void;
  /** Data-plane unary timeout in ms (default 30s). Prevents an App RPC from
   * hanging forever when a large response stalls on a mobile tunnel. */
  unaryTimeoutMs?: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

/** Public JWK view of an EC private JWK (P-256 JWKs carry x/y as well). */
function publicJwkFromPrivate(privateKeyJwk: JsonWebKey): JsonWebKey | undefined {
  const { kty, crv, x, y } = privateKeyJwk;
  if (kty && crv && x && y) return { kty, crv, x, y };
  return undefined;
}

/** Build a control-plane hello envelope. */
export function makeHello(
  from: string,
  opts: { id?: string; ts?: number } = {},
): RelayEnvelope {
  return {
    v: RELAY_ENVELOPE_VERSION,
    type: "relay.hello",
    id: opts.id ?? makeRpcId(),
    from,
    to: "relay",
    ts: opts.ts ?? Date.now(),
    payload: { protocolVersion: RELAY_ENVELOPE_VERSION },
  };
}

/** Build a control-plane register envelope. */
export function makeRegister(
  from: string,
  reg: RelayRegistration,
  opts: { id?: string; ts?: number } = {},
): RelayEnvelope {
  return {
    v: RELAY_ENVELOPE_VERSION,
    type: "relay.register",
    id: opts.id ?? makeRpcId(),
    from,
    to: "relay",
    ts: opts.ts ?? Date.now(),
    payload: reg,
  };
}

/** Build a control-plane pair envelope. */
export function makePair(
  from: string,
  code: string,
  deviceId: string,
  opts: { id?: string; ts?: number } = {},
): RelayEnvelope {
  return {
    v: RELAY_ENVELOPE_VERSION,
    type: "relay.pair",
    id: opts.id ?? makeRpcId(),
    from,
    to: "relay",
    ts: opts.ts ?? Date.now(),
    payload: { code, deviceId },
  };
}

/** Build a control-plane pair-code request envelope (console → relay). */
export function makePairCode(
  from: string,
  payload?: RelayPairCodeRequest,
  opts: { id?: string; ts?: number } = {},
): RelayEnvelope {
  const env: RelayEnvelope = {
    v: RELAY_ENVELOPE_VERSION,
    type: "relay.pair.code",
    id: opts.id ?? makeRpcId(),
    from,
    to: "relay",
    ts: opts.ts ?? Date.now(),
  };
  if (payload !== undefined) env.payload = payload;
  return env;
}

/** Build a control-plane heartbeat envelope. */
export function makeHeartbeat(
  from: string,
  payload?: RelayHeartbeat,
  opts: { id?: string; ts?: number } = {},
): RelayEnvelope {
  const env: RelayEnvelope = {
    v: RELAY_ENVELOPE_VERSION,
    type: "relay.heartbeat",
    id: opts.id ?? makeRpcId(),
    from,
    to: "relay",
    ts: opts.ts ?? Date.now(),
  };
  if (payload !== undefined) env.payload = payload;
  return env;
}

const KNOWN_TYPES: readonly string[] = [
  "relay.hello",
  "relay.hello.ack",
  "relay.register",
  "relay.register.ack",
  "relay.pair",
  "relay.pair.ack",
  "relay.pair.code",
  "relay.pair.code.ack",
  "relay.route",
  "relay.route.ack",
  "relay.heartbeat",
  "relay.heartbeat.ack",
  "relay.error",
];

/** Lenient parser: returns null for anything that is not a relay envelope. */
export function parseRelayEnvelope(input: unknown): RelayEnvelope | null {
  if (!isRecord(input)) return null;
  const type = str(input.type);
  if (!type || !KNOWN_TYPES.includes(type)) return null;
  const id = str(input.id);
  if (!id) return null;
  const from = str(input.from);
  if (!from) return null;
  const v = num(input.v);
  const ts = num(input.ts);
  if (v !== RELAY_ENVELOPE_VERSION) return null;
  if (ts === undefined || ts < 0) return null;
  return {
    v: RELAY_ENVELOPE_VERSION,
    type: type as RelayEnvelopeType,
    id,
    from,
    to: str(input.to) ?? "",
    ts,
    ...(input.payload !== undefined ? { payload: input.payload } : {}),
  };
}

export function isRelayEnvelope(input: unknown): input is RelayEnvelope {
  return parseRelayEnvelope(input) !== null;
}

const KNOWN_ERROR_CODES: readonly string[] = [
  "E_BAD_ENVELOPE",
  "E_AUTH",
  "E_PAIR",
  "E_ROUTE",
  "E_EXPIRED",
  "E_RATE",
  "E_UNKNOWN",
];

/** Lenient relay error normalization: unknown codes degrade to E_UNKNOWN. */
export function normalizeRelayError(input: unknown): RelayError {
  if (isRecord(input)) {
    const rawCode = str(input.code);
    const code = rawCode && KNOWN_ERROR_CODES.includes(rawCode)
      ? (rawCode as RelayErrorCode)
      : "E_UNKNOWN";
    return {
      code,
      message: str(input.message) ?? "relay error",
      ...(input.details !== undefined ? { details: input.details } : {}),
    };
  }
  return { code: "E_UNKNOWN", message: "relay error", details: input };
}

const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;
const OPEN = 1;

/** WebSocket surface RelayTransport needs: the ws.ts WsLike surface + send(). */
interface RelaySocket extends WsLike {
  send(data: string): void;
}

function parseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function buildRelayWsUrl(
  endpoint: Endpoint,
  relayUrl: string | undefined,
  token: string | undefined,
): string {
  const raw = relayUrl ?? endpoint.host;
  let url: string;
  if (raw.startsWith("ws://") || raw.startsWith("wss://")) {
    // wss:// default port 443, ws:// default port 80 — use the URL verbatim.
    url = raw;
  } else {
    url = `ws://${raw}:${endpoint.port}`;
  }
  if (token) {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}credential=${encodeURIComponent(token)}`;
  }
  return url;
}

function extractPeerIdFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("peerId") ?? undefined;
  } catch {
    return undefined;
  }
}

function isSealedRoutePayload(
  v: unknown,
): v is { to: string; ciphertext: string; nonce: string } {
  return isRecord(v)
    && str(v.to) !== undefined
    && str(v.ciphertext) !== undefined
    && str(v.nonce) !== undefined;
}

class RelayConnection implements Connection {
  readonly events: AsyncIterable<DownlinkFrame>;
  /** Set while connect() is waiting for the control-plane handshake. */
  onControl: ((env: RelayEnvelope) => void) | null = null;
  onRelayError: ((err: RelayError) => void) | null = null;
  onClosed: (() => void) | null = null;
  /**
   * 0.4：console 主动推送的主机级事件（如隧道地址变更）。
   * payload 形如 { __dshRemoteEvent: string, ... }，无对应 pending RPC 时触发。
   */
  onHostEvent: ((event: Record<string, unknown>) => void) | null = null;

  private readonly queue = new FrameQueue();
  private closed = false;
  private readonly unaryTimeoutMs: number;

  constructor(
    private readonly ws: RelaySocket,
    private readonly from: string,
    private readonly crypto: Crypto | undefined,
    private encKey: CryptoKey | undefined,
    private peerId?: string,
    opts: { unaryTimeoutMs?: number } = {},
  ) {
    this.unaryTimeoutMs = opts.unaryTimeoutMs ?? 30_000;
    this.events = this.queue;
    ws.onmessage = (ev) => {
      this.handleMessage(ev.data);
    };
    ws.onclose = () => {
      this.closed = true;
      this.queue.end();
      this.onClosed?.();
    };
    ws.onerror = () => {
      /* surfaced via onclose / readyState */
    };
  }

  private readonly pending = new Map<string, {
    resolve: (res: RpcResult) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  async unary(method: string, payload: unknown): Promise<RpcResult> {
    const id = makeRpcId();
    const result = new Promise<RpcResult>((resolve, reject) => {
      // 数据面 RPC 此前无超时：若响应被丢弃/网络挂起，调用方将永远
      // pending（App 会话列表停在 EMPTY 且无错误提示）。30s 后明确失败。
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`RelayTransport: unary ${method} timed out after ${this.unaryTimeoutMs}ms`));
      }, this.unaryTimeoutMs);
      this.pending.set(id, { resolve, timer });
    });

    try {
      if (this.encKey) {
        // M3.2: seal the whole { rpcId, method, payload } request; the relay
        // only ever sees { to, ciphertext, nonce }.
        await this.sendSealedRoute({ rpcId: id, method, payload });
      } else {
        // M3.1 plaintext debug path: the relay.route payload carries the same
        // { rpcId, method, payload } shape as a DSH unary request.
        this.sendEnvelope({
          v: RELAY_ENVELOPE_VERSION,
          type: "relay.route",
          id,
          from: this.from,
          to: this.peerId ?? "",
          ts: Date.now(),
          payload: {
            rpcId: id,
            method,
            payload,
            ...(this.peerId ? { to: this.peerId } : {}),
          },
        });
      }
    } catch (err) {
      const entry = this.pending.get(id);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(id);
      }
      throw err;
    }
    return result;
  }

  async interrupt(sessionId: string): Promise<void> {
    const r = await this.unary("session.cancel", { sessionId });
    if (!r.ok) {
      throw new Error(r.error?.message ?? "session.cancel failed");
    }
  }

  async respond(rpcId: string, result: unknown): Promise<void> {
    if (this.encKey) {
      // M3.2: seal { rpcId, result } before it goes anywhere near the relay.
      await this.sendSealedRoute({ rpcId, result });
      return;
    }
    // M3.1 plaintext debug path.
    this.sendEnvelope({
      v: RELAY_ENVELOPE_VERSION,
      type: "relay.route",
      id: makeRpcId(),
      from: this.from,
      to: this.peerId ?? "",
      ts: Date.now(),
      payload: {
        rpcId,
        result,
        ...(this.peerId ? { to: this.peerId } : {}),
      },
    });
  }

  private async sendSealedRoute(inner: unknown): Promise<void> {
    if (!this.encKey || !this.crypto) {
      throw new Error("RelayTransport: encryption key is not available");
    }
    const sealed = await sealRelayPayload(this.crypto, this.encKey, inner);
    this.sendEnvelope({
      v: RELAY_ENVELOPE_VERSION,
      type: "relay.route",
      id: makeRpcId(),
      from: this.from,
      to: this.peerId ?? "",
      ts: Date.now(),
      payload: {
        to: this.peerId ?? "",
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
      },
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.queue.end();
    try {
      this.ws.close();
    } catch {
      /* never throw from close() */
    }
  }

  /** M3.5: set the paired peer and (optionally) enable the E2E session key. */
  setPeer(peerId: string, encKey?: CryptoKey): void {
    this.peerId = peerId;
    if (encKey) this.encKey = encKey;
  }

  sendEnvelope(env: RelayEnvelope): void {
    if (this.closed || this.ws.readyState !== OPEN) {
      throw new Error("RelayTransport: socket is not open");
    }
    this.ws.send(JSON.stringify(env));
  }

  private handleMessage(data: unknown): void {
    if (typeof data === "string") {
      this.handleInput(parseJson(data));
      return;
    }
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      void data.text().then((t) => this.handleInput(parseJson(t)));
      return;
    }
    this.handleInput(data);
  }

  private handleInput(input: unknown): void {
    const env = parseRelayEnvelope(input);
    if (!env) return;

    if (env.type === "relay.error") {
      this.onRelayError?.(normalizeRelayError(env.payload));
      return;
    }

    if (env.type === "relay.route") {
      if (isSealedRoutePayload(env.payload)) {
        // M3.2 encrypted route. Without a session key we must not parse
        // ciphertext as if it were M3.1 plaintext.
        if (!this.encKey) return;
        void this.handleSealedRoute(env.payload);
        return;
      }

      if (this.encKey) {
        // M3.2 mode: only sealed route payloads are processed; a plaintext
        // route arriving while we have a session key is ignored.
        return;
      }

      this.dispatchRoutePayload(env.payload);
      return;
    }

    this.onControl?.(env);
  }

  private async handleSealedRoute(
    sealed: { to: string; ciphertext: string; nonce: string },
  ): Promise<void> {
    if (!this.encKey || !this.crypto) return;
    try {
      const inner = await openRelayPayload(this.crypto, this.encKey, {
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
      });
      this.dispatchRoutePayload(inner);
    } catch {
      // Decryption failed: discard. Never let a bad ciphertext become a frame.
    }
  }

  private dispatchRoutePayload(payload: unknown): void {
    // Two payload shapes share the relay.route channel:
    //  - unary response { rpcId, ok, result | error } → settle pending RPC
    //  - anything else → treat as a DSH downlink frame (lenient decode).
    if (isRecord(payload)) {
      const rpcId = str(payload.rpcId);
      if (rpcId && typeof payload.ok === "boolean") {
        const entry = this.pending.get(rpcId);
        if (!entry && isRecord(payload.result) && typeof payload.result.__dshRemoteEvent === "string") {
          // 0.4：console 推送的主机事件（无 pending 对应）——交给宿主回调。
          this.onHostEvent?.(payload.result);
          return;
        }
        if (entry) {
          this.pending.delete(rpcId);
          clearTimeout(entry.timer);
          if (payload.ok) {
            entry.resolve({ rpcId, ok: true, result: payload.result });
          } else {
            entry.resolve({
              rpcId,
              ok: false,
              error: normalizeRelayError(payload.error ?? { code: "E_UNKNOWN", message: "unknown error" }),
            });
          }
          return;
        }
      }
    }
    if (payload !== undefined) this.queue.push(decodeFrame(payload));
  }
}

/**
 * M3.1 RelayTransport: single WebSocket to a self-hosted relay, hello/register
 * handshake on connect, and relay.route-based plaintext data forwarding.
 * It implements the same Transport interface as LanTransport, so the app-side
 * switch is zero-change.
 */
export class RelayTransport implements Transport {
  constructor(private readonly opts: RelayTransportOptions = {}) {}

  async connect(endpoint: Endpoint, auth: Auth): Promise<Connection> {
    const ctor = this.opts.wsImpl
      ?? (globalThis as { WebSocket?: WsCtor }).WebSocket;
    if (!ctor) throw new Error("RelayTransport: no WebSocket implementation available");

    const url = buildRelayWsUrl(endpoint, this.opts.relayUrl, auth.token);
    const ws = new ctor(url) as unknown as RelaySocket;
    if (typeof ws.send !== "function") {
      throw new Error("RelayTransport: WebSocket implementation must provide send()");
    }

    const from = this.opts.deviceId ?? "relay-client";
    const peerId = this.opts.peerId ?? extractPeerIdFromUrl(url);
    const crypto = this.opts.crypto
      ?? (globalThis as { crypto?: Crypto }).crypto;

    // M3.5: a device without an injected private key auto-generates an ECDH
    // P-256 keypair before register, so the relay always has a publicKey to
    // hand to the console during pairing.
    let privateKeyJwk = this.opts.privateKeyJwk;
    let publicKeyJwk = privateKeyJwk ? publicJwkFromPrivate(privateKeyJwk) : undefined;
    if (!privateKeyJwk && crypto) {
      try {
        const generated = await generateRelayKeyPair(crypto);
        privateKeyJwk = generated.privateKeyJwk;
        publicKeyJwk = generated.publicKeyJwk;
      } catch (err) {
        ws.close();
        throw err;
      }
    }

    let encKey: CryptoKey | undefined;
    if (privateKeyJwk && this.opts.peerPublicKeyJwk) {
      if (!crypto) {
        ws.close();
        throw new Error("RelayTransport: no WebCrypto implementation available");
      }
      try {
        ({ encKey } = await deriveRelaySessionKeys(
          crypto,
          privateKeyJwk,
          this.opts.peerPublicKeyJwk,
        ));
      } catch (err) {
        ws.close();
        throw err;
      }
    }

    const conn = new RelayConnection(ws, from, crypto, encKey, peerId, {
      unaryTimeoutMs: this.opts.unaryTimeoutMs,
    });
    conn.onHostEvent = (event) => this.opts.onHostEvent?.(event);
    const timeoutMs = this.opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;

    return new Promise<Connection>((resolve, reject) => {
      let settled = false;
      let helloAck = false;
      let registerAck = false;
      // Without a pairCode the control plane is ready after hello+register.
      // With a pairCode we additionally wait for relay.pair.ack so the caller
      // (mobile) never starts the data plane before the E2E key is installed.
      let pairAck = !this.opts.pairCode;
      let pairSent = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        conn.close();
        reject(
          new Error(`RelayTransport: control plane not ready before ${timeoutMs}ms timeout`),
        );
      }, timeoutMs);

      const fail = (err: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        conn.close();
        reject(err);
      };

      const sendPair = (): void => {
        if (settled || pairSent || !this.opts.pairCode) return;
        pairSent = true;
        try {
          conn.sendEnvelope(makePair(from, this.opts.pairCode, from));
        } catch (err) {
          fail(err instanceof Error ? err : new Error(String(err)));
        }
      };

      const maybeReady = (): void => {
        if (settled) return;
        if (!helloAck || !registerAck || !pairAck) return;
        settled = true;
        clearTimeout(timer);
        conn.onRelayError = null;
        resolve(conn);
      };

      conn.onControl = (env) => {
        if (env.type === "relay.hello.ack") {
          helloAck = true;
          if (helloAck && registerAck) sendPair();
          maybeReady();
        } else if (env.type === "relay.register.ack") {
          registerAck = true;
          if (helloAck && registerAck) sendPair();
          maybeReady();
        } else if (env.type === "relay.pair.ack") {
          void (async () => {
            if (settled) return;
            try {
              const payload = isRecord(env.payload) ? env.payload : {};
              const consoleId = str(payload.consoleId);
              if (!consoleId) {
                fail(new Error("RelayTransport: relay.pair.ack missing consoleId"));
                return;
              }
              const peerPublicKey = payload.peerPublicKey;
              if (privateKeyJwk && isRecord(peerPublicKey)) {
                if (!crypto) {
                  fail(new Error("RelayTransport: no WebCrypto implementation available"));
                  return;
                }
                const keys = await deriveRelaySessionKeys(
                  crypto,
                  privateKeyJwk,
                  peerPublicKey as unknown as JsonWebKey,
                );
                conn.setPeer(consoleId, keys.encKey);
              } else {
                conn.setPeer(consoleId);
              }
              this.opts.onPairAck?.({ consoleId, peerPublicKey });
              pairAck = true;
              maybeReady();
            } catch (err) {
              fail(err instanceof Error ? err : new Error(String(err)));
            }
          })();
        }
      };
      conn.onRelayError = (err) => {
        fail(new Error(`RelayTransport: relay error ${err.code}: ${err.message}`));
      };
      conn.onClosed = () => {
        fail(new Error("RelayTransport: ws closed before control plane ready"));
      };

      ws.onopen = () => {
        try {
          conn.sendEnvelope(makeHello(from));
          conn.sendEnvelope(
            makeRegister(from, {
              deviceId: from,
              publicKey: publicKeyJwk ?? null,
              protocolVersion: RELAY_ENVELOPE_VERSION,
              ...(this.opts.pushToken ? { pushToken: this.opts.pushToken } : {}),
            }),
          );
        } catch (err) {
          fail(err instanceof Error ? err : new Error(String(err)));
        }
      };

      // Injected fakes may open synchronously inside the constructor.
      if (ws.readyState === OPEN) {
        ws.onopen?.();
      }
    });
  }
}
