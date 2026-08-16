/**
 * Transport abstraction (design §3.2): pluggable connection layer.
 * LanTransport is the MVP implementation (direct host:3080, HTTP + WS);
 * a RelayTransport slot is reserved for M3 — same interface, app-side
 * switches with zero changes.
 */

import type { DownlinkFrame } from "./codec.js";
import { RpcClient, type RpcResult } from "./rpc.js";
import { WsDownlink, type WsCtor } from "./ws.js";

export interface Endpoint {
  host: string;
  port: number;
}

/** MVP: empty auth; `token` reserved for M2 pairing. */
export interface Auth {
  token?: string;
}

export type ConnectionState = "connecting" | "online" | "offline" | "backoff";

export interface Connection {
  unary(method: string, payload: unknown): Promise<RpcResult>;
  respond(rpcId: string, result: unknown): Promise<void>;
  /** Merged downlink frames from events.mux + events.host (incl. UnknownFrame). */
  events: AsyncIterable<DownlinkFrame>;
  close(): void;
}

export interface Transport {
  connect(endpoint: Endpoint, auth: Auth): Promise<Connection>;
}

/** State-change and error notifications from the connection layer. */
export interface TransportEvents {
  onStateChange?: (state: ConnectionState) => void;
  onError?: (err: unknown) => void;
}

export interface LanTransportOptions {
  /** Handshake timeout for host.describe (ms). */
  handshakeTimeoutMs?: number;
  /** Injectable fetch (tests). */
  fetchImpl?: typeof fetch;
  /** Injectable WebSocket ctor (tests). */
  wsImpl?: WsCtor;
  /** Called with the host.describe result after each successful handshake. */
  onDescribe?: (describe: unknown) => void;
}

const DEFAULT_HANDSHAKE_TIMEOUT = 15_000;

export class LanTransport implements Transport {
  constructor(private readonly opts: LanTransportOptions = {}) {}

  /**
   * Handshake (design §1.3): open both downlink streams, then
   * host.describe must succeed. Throws on any failure.
   */
  async connect(endpoint: Endpoint, auth: Auth): Promise<Connection> {
    const baseUrl = `http://${endpoint.host}:${endpoint.port}`;
    const rpc = new RpcClient({
      baseUrl,
      timeoutMs: this.opts.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT,
      fetchImpl: this.opts.fetchImpl,
    });

    const ws = new WsDownlink(
      `${baseUrl}/api/events.mux`,
      `${baseUrl}/api/events.host`,
      this.opts.wsImpl,
    );

    // Stream-open handshake: fail fast (close both streams) on rejection/timeout.
    try {
      await withTimeout(
        ws.ready,
        this.opts.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT,
        "streams did not open before handshake timeout",
      );
    } catch (err) {
      ws.close();
      throw err;
    }

    let describe;
    try {
      describe = await rpc.unary("host.describe", {});
    } catch (err) {
      ws.close(); // release streams before propagating
      throw err;
    }
    if (!describe.ok) {
      ws.close();
      throw new Error(
        `handshake failed: host.describe returned ${describe.error?.code ?? "error"}`,
      );
    }
    this.opts.onDescribe?.(describe.result);

    return {
      unary: (method, payload) => rpc.unary(method, payload),
      respond: (rpcId, result) => rpc.respond(rpcId, result),
      events: ws.events,
      close: () => ws.close(),
    };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
