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
  parseRelayEnvelope,
  RELAY_ENVELOPE_VERSION,
  type RelayEnvelope,
  type RelayEnvelopeType,
  type RelayErrorCode,
} from "@dsh-remote/protocol";
import { createCredentialService } from "./credential.js";
import { createOfflineQueue, type OfflineQueue } from "./queue.js";
import type { PushProvider } from "./push.js";
import { createRelayStore, type ClientKind, type RelayStore } from "./store.js";

export interface RelayServerOptions {
  host?: string;
  credentialSecret?: string;
  /** TTL for credentials issued by `relay.register`. Defaults to 12h. */
  credentialTtlMs?: number;
  /** Optional push provider used to wake offline peers. */
  push?: PushProvider;
  /** Offline queue TTL in ms. Defaults to 2 minutes. */
  queueTtlMs?: number;
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
  const store = createRelayStore();
  const queue = createOfflineQueue({ ttlMs: options.queueTtlMs ?? 2 * 60 * 1000 });
  const pushProvider = options.push;

  const socketAuth = new Map<WebSocket, string>();
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

    switch (env.type) {
      case "relay.hello": {
        const ack = makeEnvelope("relay.hello.ack", env.id, env.from || "");
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

        store.registerClient({
          clientId,
          kind,
          ...(payload.publicKey !== undefined ? { publicKey: payload.publicKey } : {}),
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

        const consumed = store.consumePairingCode(code);
        if (!consumed) {
          sendError(ws, env.id, "E_PAIR", "invalid, used or expired pairing code", authClientId ?? env.from);
          break;
        }

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
        if (!delivered) {
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

    ws.on("message", (data: RawData) => {
      handleMessage(ws, data);
    });
    ws.on("close", () => {
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
