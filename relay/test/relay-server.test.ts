/**
 * relay server tests — M3.1 control-plane MVP.
 *
 * Coverage: health, register+credential, E_AUTH / E_PAIR / E_BAD_ENVELOPE,
 * expired credential on reconnect, and successful paired route forwarding.
 */

import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";
import {
  createCredentialService,
  createRelayServer,
  verify,
  type RelayServer,
} from "../src/index.js";
import type { RelayEnvelope } from "@dsh-remote/protocol";

const relays: RelayServer[] = [];

afterEach(async () => {
  await Promise.all(relays.splice(0).map((r) => r.stop()));
});

async function startRelay(
  opts: Parameters<typeof createRelayServer>[0] = {},
): Promise<RelayServer> {
  const relay = createRelayServer({ credentialTtlMs: 60_000, ...opts });
  await relay.start(0);
  relays.push(relay);
  return relay;
}

function rawToText(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  return Buffer.from(data as ArrayBuffer).toString("utf8");
}

class TestClient {
  private queue: RelayEnvelope[] = [];
  private waiters: Array<{
    type: string;
    resolve: (env: RelayEnvelope) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(readonly ws: WebSocket) {
    ws.on("message", (data: RawData) => {
      const env = JSON.parse(rawToText(data)) as RelayEnvelope;
      this.queue.push(env);
      const idx = this.waiters.findIndex((w) => w.type === env.type);
      if (idx >= 0) {
        const waiter = this.waiters[idx];
        if (waiter) {
          this.waiters.splice(idx, 1);
          clearTimeout(waiter.timer);
          waiter.resolve(env);
        }
      }
    });
  }

  static connect(port: number, credential?: string): Promise<TestClient> {
    const query = credential ? `?credential=${encodeURIComponent(credential)}` : "";
    const ws = new WebSocket(`ws://127.0.0.1:${port}${query}`);
    return new Promise((resolve, reject) => {
      ws.once("open", () => resolve(new TestClient(ws)));
      ws.once("error", reject);
    });
  }

  send(env: unknown): void {
    this.ws.send(JSON.stringify(env));
  }

  next(type: string, timeoutMs = 3000): Promise<RelayEnvelope> {
    const idx = this.queue.findIndex((e) => e.type === type);
    if (idx >= 0) {
      const env = this.queue[idx];
      this.queue.splice(idx, 1);
      if (env) return Promise.resolve(env);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timeout waiting for ${type}`)),
        timeoutMs,
      );
      this.waiters.push({ type, resolve, timer });
    });
  }

  close(): void {
    this.ws.close();
  }
}

function makeEnvelope(
  type: string,
  id: string,
  from: string,
  payload?: unknown,
): Record<string, unknown> {
  return {
    v: 1,
    type,
    id,
    from,
    to: type === "relay.hello" || type === "relay.register" || type === "relay.pair"
      ? "relay"
      : "",
    ts: Date.now(),
    ...(payload !== undefined ? { payload } : {}),
  };
}

function registerEnvelope(
  id: string,
  from: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return makeEnvelope("relay.register", id, from, payload);
}

describe("relay server", () => {
  it("health check returns ok + timestamp", async () => {
    const relay = await startRelay();
    const res = await fetch(`http://127.0.0.1:${relay.port}/healthz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; ts: number };
    expect(body.ok).toBe(true);
    expect(typeof body.ts).toBe("number");
  });

  it("register issues a verifiable short-lived credential", async () => {
    const relay = await startRelay();
    const device = await TestClient.connect(relay.port);
    device.send(registerEnvelope("reg-1", "device-1", { deviceId: "device-1", platform: "ios" }));

    const ack = await device.next("relay.register.ack");
    const payload = ack.payload as { clientId: string; credential: string; ttlMs: number };
    expect(payload.clientId).toBe("device-1");
    expect(typeof payload.credential).toBe("string");
    expect(payload.ttlMs).toBeGreaterThan(0);
    expect(verify(payload.credential)).toEqual({ clientId: "device-1" });

    device.close();
  });

  it("rejects route from an unauthenticated socket with E_AUTH", async () => {
    const relay = await startRelay();
    const c = await TestClient.connect(relay.port);
    c.send({
      v: 1,
      type: "relay.route",
      id: "r-unauth",
      from: "device-x",
      to: "console-x",
      ts: Date.now(),
      payload: { to: "console-x" },
    });

    const err = await c.next("relay.error");
    expect((err.payload as { code: string }).code).toBe("E_AUTH");

    c.close();
  });

  it("rejects route between unpaired clients with E_PAIR", async () => {
    const relay = await startRelay();
    const device = await TestClient.connect(relay.port);
    device.send(registerEnvelope("reg-1", "device-1", { deviceId: "device-1" }));
    await device.next("relay.register.ack");

    device.send({
      v: 1,
      type: "relay.route",
      id: "r-unpaired",
      from: "device-1",
      to: "console-1",
      ts: Date.now(),
      payload: { to: "console-1" },
    });

    const err = await device.next("relay.error");
    expect((err.payload as { code: string }).code).toBe("E_PAIR");

    device.close();
  });

  it("rejects an expired credential on reconnect", async () => {
    const secret = "expired-test-secret";
    const svc = createCredentialService(secret);
    const expired = svc.issue("device-exp", 20);

    const relay = await startRelay({ credentialSecret: secret });
    await new Promise((r) => setTimeout(r, 60));

    const c = await TestClient.connect(relay.port, expired);
    c.send({
      v: 1,
      type: "relay.route",
      id: "r-expired",
      from: "device-exp",
      to: "console-x",
      ts: Date.now(),
      payload: { to: "console-x" },
    });

    const err = await c.next("relay.error");
    expect((err.payload as { code: string }).code).toBe("E_AUTH");

    c.close();
  });

  it("forwards route between paired, online clients", async () => {
    const relay = await startRelay();

    const device = await TestClient.connect(relay.port);
    device.send(registerEnvelope("reg-d", "device-1", { deviceId: "device-1" }));
    await device.next("relay.register.ack");

    const consoleClient = await TestClient.connect(relay.port);
    consoleClient.send(registerEnvelope("reg-c", "console-1", { consoleId: "console-1" }));
    await consoleClient.next("relay.register.ack");

    const code = relay.store.createPairingCode("console-1");
    device.send(
      makeEnvelope("relay.pair", "pair-1", "device-1", { code, deviceId: "device-1" }),
    );
    const pairAck = await device.next("relay.pair.ack");
    expect(pairAck.payload).toMatchObject({ deviceId: "device-1", consoleId: "console-1" });

    const payload = { method: "host.describe", payload: { a: 1 } };
    device.send({
      v: 1,
      type: "relay.route",
      id: "r-forward",
      from: "device-1",
      to: "console-1",
      ts: Date.now(),
      payload: { to: "console-1", payload },
    });

    const routed = await consoleClient.next("relay.route");
    expect(routed.id).toBe("r-forward");
    expect(routed.payload).toMatchObject({ to: "console-1", payload });

    device.close();
    consoleClient.close();
  });

  it("rejects invalid envelopes with E_BAD_ENVELOPE", async () => {
    const relay = await startRelay();
    const c = await TestClient.connect(relay.port);
    c.ws.send("not json");

    const err = await c.next("relay.error");
    expect((err.payload as { code: string }).code).toBe("E_BAD_ENVELOPE");

    c.close();
  });
});
