/**
 * Relay control-plane server (M3.1 MVP).
 *
 * HTTP: GET /healthz only.
 * WS:   control plane on the same HTTP server. Clients authenticate by
 *       passing a short-lived `?credential=` issued by `relay.register`.
 *
 * Logging red line: only envelope metadata (type/from/to/ts) is printed —
 * never payloads and never DSH content.
 */

import { createServer, type Server } from "node:http";
import {
  WebSocket,
  WebSocketServer,
  type RawData,
} from "ws";
import {
  makeRpcId,
  parseRelayEnvelope,
  RELAY_ENVELOPE_VERSION,
  type RelayEnvelope,
  type RelayEnvelopeType,
  type RelayErrorCode,
} from "@dsh-remote/protocol";
import { createCredentialService, randomPairingCode } from "./credential.js";
import { createOfflineQueue, type OfflineQueue } from "./queue.js";
import type { PushProvider } from "./push.js";
import { createRateLimiter } from "./rate-limit.js";
import { createRelayStore, type ClientKind, type RelayStore } from "./store.js";

export const RELAY_SERVER_PROTOCOL_VERSION = 1;
export const RELAY_SERVER_VERSION = "0.1.0";

export interface RelayRateLimitOptions {
  perMinute?: number;
  burst?: number;
}

export interface RelayAuditEntry {
  event: string;
  from: string;
  to: string;
  ts: number;
  ok: boolean;
}

export interface RelayServerOptions {
  host?: string;
  credentialSecret?: string;
  /** TTL for credentials issued by `relay.register`. Defaults to 12h. */
  credentialTtlMs?: number;
  /** Optional push provider used to wake offline peers. */
  push?: PushProvider;
  /** Offline queue TTL in ms. Defaults to 24 hours (audit A11). */
  queueTtlMs?: number;
  /** Simple token-bucket rate limit. Defaults: perMinute=120, burst=240. */
  rateLimit?: RelayRateLimitOptions;
  /** Max unused (active) pairing codes one console may hold. Default 5. */
  maxPairingCodesPerConsole?: number;
  /** Failed pair attempts before a temporary lock. Default 10. */
  maxPairAttempts?: number;
  /** Lock duration after repeated pair failures (ms). Default 60s. */
  pairLockMs?: number;
  /** Audit sink. Defaults to a one-line JSON console.log (metadata only). */
  audit?: (entry: RelayAuditEntry) => void;
  /** Optional persistent store (e.g. createSqliteRelayStore). Defaults to in-memory. */
  store?: RelayStore;
}

export interface RelayServer {
  server: Server;
  store: RelayStore;
  queue: OfflineQueue;
  host: string;
  readonly port: number;
  start(port?: number): Promise<void>;
  stop(): Promise<void>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function rawToString(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.from(data as ArrayBuffer).toString("utf8");
}

function makeEnvelope(
  type: RelayEnvelopeType,
  id: string,
  to: string,
  payload?: unknown,
): RelayEnvelope {
  return {
    v: RELAY_ENVELOPE_VERSION,
    type,
    id,
    from: "relay",
    to,
    ts: Date.now(),
    ...(payload !== undefined ? { payload } : {}),
  };
}

function logLine(direction: "rx" | "tx", env: RelayEnvelope): void {
  // Metadata only: type / from / to / timestamp. No payload, no DSH content.
  console.log(
    `[relay] ${direction} type=${env.type} from=${env.from} to=${env.to} ts=${env.ts}`,
  );
}

function sendTo(ws: WebSocket, env: RelayEnvelope): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(env));
}

export function createRelayServer(options: RelayServerOptions = {}): RelayServer {
  const host = options.host ?? "127.0.0.1";
  const credentialTtlMs = options.credentialTtlMs ?? 12 * 60 * 60 * 1000;
  const credentials = createCredentialService(options.credentialSecret);
  // 审计 C2：默认与自带 store 统一走 CSPRNG 配对码。
  const store = options.store
    ?? createRelayStore({ generatePairingCode: randomPairingCode });
  const queue = createOfflineQueue({
    ...(options.queueTtlMs !== undefined ? { ttlMs: options.queueTtlMs } : {}),
  });
  const pushProvider = options.push;
  const rateLimiter = createRateLimiter({
    perMinute: options.rateLimit?.perMinute ?? 120,
    burst: options.rateLimit?.burst ?? 240,
  });
  const maxPairingCodesPerConsole = options.maxPairingCodesPerConsole ?? 5;
  const maxPairAttempts = options.maxPairAttempts ?? 10;
  const pairLockMs = options.pairLockMs ?? 60 * 1000;
  const audit =
    options.audit ??
    ((entry: RelayAuditEntry) => {
      console.log(`[relay] audit ${JSON.stringify(entry)}`);
    });

  const socketAuth = new Map<WebSocket, string>();
  const socketPeers = new Map<WebSocket, string>();
  const pairFailures = new Map<string, { count: number; lockedUntil: number }>();
  const onlineSockets = new Map<string, Set<WebSocket>>();

  function authenticate(ws: WebSocket, clientId: string): void {
    socketAuth.set(ws, clientId);
    let set = onlineSockets.get(clientId);
    if (!set) {
      set = new Set();
      onlineSockets.set(clientId, set);
    }
    set.add(ws);
    store.setOnline(clientId, true);
  }

  function unauthSocket(ws: WebSocket): void {
    const clientId = socketAuth.get(ws);
    if (!clientId) return;
    socketAuth.delete(ws);
    const set = onlineSockets.get(clientId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      onlineSockets.delete(clientId);
      store.setOnline(clientId, false);
    }
  }

  function auditEvent(event: string, from: string, to: string, ok: boolean): void {
    audit({ event, from, to, ts: Date.now(), ok });
  }

  function pairFailureKey(ws: WebSocket): string {
    return socketAuth.get(ws) ?? socketPeers.get(ws) ?? "unknown";
  }

  function isPairLocked(key: string): boolean {
    const rec = pairFailures.get(key);
    return !!rec && rec.lockedUntil > Date.now();
  }

  function recordPairFailure(key: string): boolean {
    const now = Date.now();
    const rec = pairFailures.get(key) ?? { count: 0, lockedUntil: 0 };
    if (rec.lockedUntil > now) return true;
    rec.count += 1;
    if (rec.count >= maxPairAttempts) {
      rec.lockedUntil = now + pairLockMs;
      rec.count = 0;
      auditEvent("pair_lock", key, "relay", false);
    }
    pairFailures.set(key, rec);
    return rec.lockedUntil > now;
  }

  function resetPairFailures(key: string): void {
    pairFailures.delete(key);
  }

  function sendError(
    ws: WebSocket,
    id: string,
    code: RelayErrorCode,
    message: string,
    to: string,
  ): void {
    const env = makeEnvelope("relay.error", id || "0", to, { code, message });
    logLine("tx", env);
    sendTo(ws, env);
    auditEvent("error", "relay", to || "", false);
  }

  function handleMessage(ws: WebSocket, data: RawData): void {
    let text: string;
    try {
      text = rawToString(data);
    } catch {
      sendError(ws, "0", "E_BAD_ENVELOPE", "unreadable message", "");
      return;
    }

    let env: RelayEnvelope | null = null;
    try {
      env = parseRelayEnvelope(JSON.parse(text) as unknown);
    } catch {
      env = null;
    }
    if (!env) {
      sendError(ws, "0", "E_BAD_ENVELOPE", "invalid relay envelope", "");
      return;
    }

    logLine("rx", env);
    const authClientId = socketAuth.get(ws);

    // M3.4 rate limiting: applied to authenticated clients only.
    // hello/register are exempt so registration and version negotiation are
    // never throttled.
    if (
      authClientId &&
      env.type !== "relay.hello" &&
      env.type !== "relay.register"
    ) {
      const decision = rateLimiter.check(authClientId);
      if (!decision.allowed) {
        sendError(ws, env.id, "E_RATE", "rate limit exceeded", authClientId);
        return;
      }
    }

    switch (env.type) {
      case "relay.hello": {
        const payload = isRecord(env.payload) ? env.payload : {};
        const protocolVersion =
          typeof payload.protocolVersion === "number" ? payload.protocolVersion : undefined;
        const incompatible =
          protocolVersion !== undefined && protocolVersion !== RELAY_SERVER_PROTOCOL_VERSION;
        const ack = makeEnvelope("relay.hello.ack", env.id, env.from || "", {
          relayVersion: RELAY_SERVER_VERSION,
          protocolVersion: RELAY_SERVER_PROTOCOL_VERSION,
          ...(incompatible ? { compatible: false } : {}),
        });
        logLine("tx", ack);
        sendTo(ws, ack);
        break;
      }

      case "relay.register": {
        const payload = isRecord(env.payload) ? env.payload : {};
        const deviceId = str(payload.deviceId);
        const consoleId = str(payload.consoleId);
        const clientId = deviceId ?? consoleId;
        if (!clientId) {
          sendError(
            ws,
            env.id,
            "E_BAD_ENVELOPE",
            "register payload requires deviceId or consoleId",
            authClientId ?? env.from,
          );
          break;
        }

        const rawKind = str(payload.kind);
        let kind: ClientKind;
        if (rawKind === "device" || rawKind === "console") {
          kind = rawKind;
        } else {
          kind = consoleId ? "console" : "device";
        }

        // 审计 C1：identity 防顶替——同一 clientId 已绑定过公钥时，
        // 携带不同公钥的重复注册直接拒绝；未携带公钥则沿用旧绑定，
        // 防止整条记录（公钥/pushToken）被后来者覆盖。
        const existingClient = store.getClient(clientId);
        const incomingPublicKey = payload.publicKey;
        const publicKeyMismatch =
          existingClient?.publicKey !== undefined &&
          incomingPublicKey !== undefined &&
          JSON.stringify(existingClient.publicKey) !== JSON.stringify(incomingPublicKey);
        if (publicKeyMismatch) {
          sendError(
            ws,
            env.id,
            "E_AUTH",
            "clientId already bound to a different publicKey",
            authClientId ?? env.from,
          );
          auditEvent("register", clientId, "relay", false);
          break;
        }
        const retainedPublicKey =
          incomingPublicKey !== undefined
            ? incomingPublicKey
            : existingClient?.publicKey;
        store.registerClient({
          clientId,
          kind,
          ...(retainedPublicKey !== undefined ? { publicKey: retainedPublicKey } : {}),
          ...(str(payload.pushToken) !== undefined ? { pushToken: str(payload.pushToken) } : {}),
          ...(str(payload.platform) !== undefined ? { platform: str(payload.platform) } : {}),
        });
        authenticate(ws, clientId);

        const issued = credentials.issue(clientId, credentialTtlMs);
        const ack = makeEnvelope("relay.register.ack", env.id, clientId, {
          clientId,
          kind,
          credential: issued,
          ttlMs: credentialTtlMs,
        });
        logLine("tx", ack);
        sendTo(ws, ack);

        // M3.3: after authentication deliver any envelopes that were queued
        // for this client while it was offline (FIFO per peer).
        for (const queued of queue.drain(clientId)) {
          logLine("tx", queued);
          sendTo(ws, queued);
        }

        auditEvent("register", clientId, "relay", true);
        break;
      }

      case "relay.pair": {
        const payload = isRecord(env.payload) ? env.payload : {};
        const code = str(payload.code);
        const deviceId = str(payload.deviceId);
        if (!code || !deviceId) {
          sendError(
            ws,
            env.id,
            "E_BAD_ENVELOPE",
            "pair payload requires code and deviceId",
            authClientId ?? env.from,
          );
          break;
        }

        // P2b: unauthenticated pair attempts are rate-limited and lock after
        // repeated failures (anti brute-force on the 6-digit code space).
        const failKey = pairFailureKey(ws);
        if (isPairLocked(failKey)) {
          sendError(ws, env.id, "E_RATE", "pair attempts temporarily locked", authClientId ?? env.from);
          auditEvent("pair_fail", failKey, "relay", false);
          break;
        }

        const consumed = store.consumePairingCode(code);
        if (!consumed) {
          const locked = recordPairFailure(failKey);
          auditEvent("pair_fail", authClientId ?? failKey, "relay", false);
          sendError(
            ws,
            env.id,
            locked ? "E_RATE" : "E_PAIR",
            locked ? "pair attempts temporarily locked" : "invalid, used or expired pairing code",
            authClientId ?? env.from,
          );
          break;
        }
        resetPairFailures(failKey);

        store.bindPair(deviceId, consumed.consoleId);

        // M3.2: return the console's public key (when it was registered with
        // one) so the device can finish ECDH without asking again.
        const peer = store.getClient(consumed.consoleId);
        const ackPayload: Record<string, unknown> = {
          code: consumed.code,
          deviceId,
          consoleId: consumed.consoleId,
          ...(peer?.publicKey !== undefined ? { peerPublicKey: peer.publicKey } : {}),
        };
        const ack = makeEnvelope("relay.pair.ack", env.id, authClientId ?? env.from, ackPayload);
        logLine("tx", ack);
        sendTo(ws, ack);
        auditEvent("pair", deviceId, consumed.consoleId, true);

        // M3.5: notify the paired console that a device completed pairing.
        // Reuse relay.pair.ack as the notification type; use a fresh envelope
        // id so it is distinguishable from the initiator's ack.
        const deviceRecord = store.getClient(deviceId);
        const notifyPayload: Record<string, unknown> = { deviceId };
        if (deviceRecord?.publicKey !== undefined) {
          notifyPayload.peerPublicKey = deviceRecord.publicKey;
        }
        const notification = makeEnvelope(
          "relay.pair.ack",
          makeRpcId(),
          consumed.consoleId,
          notifyPayload,
        );
        logLine("tx", notification);

        const consoleTargets = onlineSockets.get(consumed.consoleId);
        let notified = false;
        if (consoleTargets) {
          for (const target of consoleTargets) {
            if (target.readyState === WebSocket.OPEN) {
              sendTo(target, notification);
              notified = true;
            }
          }
        }
        if (!notified) {
          queue.enqueue(consumed.consoleId, notification);
        }
        auditEvent("pair_notify", "relay", consumed.consoleId, true);
        break;
      }

      case "relay.pair.code": {
        if (!authClientId) {
          sendError(ws, env.id, "E_AUTH", "authentication required", "");
          break;
        }

        // R5a：只有 console 能取码；device 客户端请求取码按未授权处理。
        const client = store.getClient(authClientId);
        if (!client || client.kind !== "console") {
          sendError(ws, env.id, "E_AUTH", "pair code requires a console registration", authClientId);
          break;
        }

        const payload = isRecord(env.payload) ? env.payload : {};
        const rawTtl = typeof payload.ttlMs === "number" ? payload.ttlMs : undefined;
        const ttlMs =
          rawTtl !== undefined && Number.isFinite(rawTtl) && rawTtl > 0
            ? Math.floor(rawTtl)
            : 10 * 60 * 1000;

        // P2b: bound how many unused pairing codes a single console may hold.
        if (store.countActivePairingCodes(authClientId) >= maxPairingCodesPerConsole) {
          sendError(ws, env.id, "E_RATE", "too many unused pairing codes", authClientId);
          auditEvent("pair_code_limit", authClientId, "relay", false);
          break;
        }

        const code = store.createPairingCode(authClientId, ttlMs);
        const ack = makeEnvelope("relay.pair.code.ack", env.id, authClientId, {
          code,
          ttlMs,
        });
        logLine("tx", ack);
        sendTo(ws, ack);
        auditEvent("pair_code", authClientId, "relay", true);
        break;
      }

      case "relay.route": {
        if (!authClientId) {
          sendError(ws, env.id, "E_AUTH", "authentication required", "");
          break;
        }

        // M3.2 red line: the relay reads only `payload.to` for routing.
        // `ciphertext`, `nonce` and any inner fields are never read, logged
        // or parsed — the original envelope is forwarded verbatim below.
        const to = isRecord(env.payload) ? str(env.payload.to) : undefined;
        if (!to) {
          sendError(ws, env.id, "E_BAD_ENVELOPE", "route payload requires to", authClientId);
          break;
        }

        if (!store.isPaired(authClientId, to)) {
          sendError(ws, env.id, "E_PAIR", "not paired", authClientId);
          break;
        }

        const targets = onlineSockets.get(to);
        let delivered = false;
        if (targets) {
          for (const target of targets) {
            if (target.readyState === WebSocket.OPEN) {
              sendTo(target, env);
              delivered = true;
            }
          }
        }
        if (delivered) {
          auditEvent("route", authClientId, to, true);
        } else {
          // M3.3: queue the original envelope for the offline peer and fire
          // the push provider (if any) without blocking or throwing.
          queue.enqueue(to, env);
          const target = store.getClient(to);
          if (pushProvider && target?.pushToken) {
            try {
              void pushProvider.wake(to, target.pushToken).catch(() => {
                // Push failures are intentionally swallowed — routing/queue
                // behavior must not change when the pusher misbehaves.
              });
            } catch {
              // Synchronous throw from a misbehaving provider: degrade silently.
            }
          }
          auditEvent("route", authClientId, to, false);
          sendError(ws, env.id, "E_ROUTE", "target offline", authClientId);
        }
        break;
      }

      case "relay.heartbeat": {
        const payload = isRecord(env.payload) ? env.payload : {};
        const rttMs = typeof payload.rttMs === "number" ? payload.rttMs : undefined;
        const ack = makeEnvelope(
          "relay.heartbeat.ack",
          env.id,
          authClientId ?? env.from,
          rttMs !== undefined ? { rttMs } : undefined,
        );
        logLine("tx", ack);
        sendTo(ws, ack);
        break;
      }

      default: {
        sendError(
          ws,
          env.id,
          "E_UNKNOWN",
          `unhandled relay type ${env.type}`,
          authClientId ?? env.from,
        );
        break;
      }
    }
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/healthz") {
      const body = JSON.stringify({ ok: true, ts: Date.now() });
      res.writeHead(200, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  const wss = new WebSocketServer({ server });
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const credential = url.searchParams.get("credential");
    if (credential) {
      const verified = credentials.verify(credential);
      if (verified) authenticate(ws, verified.clientId);
    }
    socketPeers.set(ws, req.socket.remoteAddress ?? "unknown");

    ws.on("message", (data: RawData) => {
      handleMessage(ws, data);
    });
    ws.on("close", () => {
      socketPeers.delete(ws);
      unauthSocket(ws);
    });
  });

  let started = false;
  let actualPort = 0;

  const relay: RelayServer = {
    server,
    store,
    queue,
    host,
    get port() {
      return actualPort;
    },
    async start(port = 0) {
      if (started) return;
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve());
      });
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("relay: failed to bind");
      }
      actualPort = address.port;
      started = true;
    },
    async stop() {
      if (!started) return;
      for (const ws of wss.clients) ws.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        setTimeout(resolve, 1000).unref();
      });
      started = false;
    },
  };

  return relay;
}
