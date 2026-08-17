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
  MockPushProvider,
  RELAY_SERVER_PROTOCOL_VERSION,
  verify,
  type PushProvider,
  type RelayAuditEntry,
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

async function registerAndPair(
  relay: RelayServer,
  deviceId: string,
  consoleId: string,
  consoleExtra: Record<string, unknown> = {},
): Promise<{ device: TestClient; consoleClient: TestClient; consoleAck: RelayEnvelope }> {
  const device = await TestClient.connect(relay.port);
  device.send(registerEnvelope(`reg-${deviceId}`, deviceId, { deviceId }));
  await device.next("relay.register.ack");

  const consoleClient = await TestClient.connect(relay.port);
  consoleClient.send(
    registerEnvelope(`reg-${consoleId}`, consoleId, { consoleId, ...consoleExtra }),
  );
  const consoleAck = await consoleClient.next("relay.register.ack");

  const code = relay.store.createPairingCode(consoleId);
  device.send(
    makeEnvelope("relay.pair", `pair-${deviceId}-${consoleId}`, deviceId, {
      code,
      deviceId,
    }),
  );
  await device.next("relay.pair.ack");

  return { device, consoleClient, consoleAck };
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

  it("route forwards ciphertext/nonce opaquely", async () => {
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
    await device.next("relay.pair.ack");

    const opaque = { to: "console-1", ciphertext: "abc", nonce: "xyz" };
    device.send({
      v: 1,
      type: "relay.route",
      id: "r-opaque",
      from: "device-1",
      to: "console-1",
      ts: Date.now(),
      payload: opaque,
    });

    const routed = await consoleClient.next("relay.route");
    expect(routed.id).toBe("r-opaque");
    // M3.2 red line: the relay must not parse/rewrite the route payload —
    // the exact same object arrives at the target.
    expect(routed.payload).toEqual(opaque);

    device.close();
    consoleClient.close();
  });

  it("pair.ack contains peerPublicKey when console registered with publicKey", async () => {
    const relay = await startRelay();
    const publicKey = { kty: "EC", crv: "P-256", x: "x-key", y: "y-key" };

    const device = await TestClient.connect(relay.port);
    device.send(registerEnvelope("reg-d", "device-1", { deviceId: "device-1" }));
    await device.next("relay.register.ack");

    const consoleClient = await TestClient.connect(relay.port);
    consoleClient.send(
      registerEnvelope("reg-c", "console-1", { consoleId: "console-1", publicKey }),
    );
    await consoleClient.next("relay.register.ack");

    const code = relay.store.createPairingCode("console-1");
    device.send(
      makeEnvelope("relay.pair", "pair-1", "device-1", { code, deviceId: "device-1" }),
    );
    const pairAck = await device.next("relay.pair.ack");
    expect(pairAck.payload).toMatchObject({
      deviceId: "device-1",
      consoleId: "console-1",
      peerPublicKey: publicKey,
    });

    device.close();
    consoleClient.close();
  });

  it("queues route and calls push provider when target is offline", async () => {
    const push = new MockPushProvider();
    const relay = await startRelay({ push });
    const { device, consoleClient } = await registerAndPair(
      relay,
      "device-1",
      "console-1",
      { pushToken: "push-tok-1" },
    );

    consoleClient.close();
    await new Promise((r) => setTimeout(r, 30));

    device.send({
      v: 1,
      type: "relay.route",
      id: "r-offline",
      from: "device-1",
      to: "console-1",
      ts: Date.now(),
      payload: { to: "console-1", ciphertext: "abc", nonce: "xyz" },
    });

    const err = await device.next("relay.error");
    expect((err.payload as { code: string }).code).toBe("E_ROUTE");
    expect(push.calls).toEqual([{ clientId: "console-1", pushToken: "push-tok-1" }]);

    device.close();
  });

  it("delivers queued envelopes after target re-registers", async () => {
    const relay = await startRelay();
    const { device, consoleClient } = await registerAndPair(
      relay,
      "device-1",
      "console-1",
      { pushToken: "push-tok-1" },
    );

    consoleClient.close();
    await new Promise((r) => setTimeout(r, 30));

    device.send({
      v: 1,
      type: "relay.route",
      id: "r-queued",
      from: "device-1",
      to: "console-1",
      ts: Date.now(),
      payload: { to: "console-1", ciphertext: "abc", nonce: "xyz" },
    });
    const err = await device.next("relay.error");
    expect((err.payload as { code: string }).code).toBe("E_ROUTE");

    const consoleAgain = await TestClient.connect(relay.port);
    consoleAgain.send(
      registerEnvelope("reg-c-again", "console-1", { consoleId: "console-1" }),
    );
    await consoleAgain.next("relay.register.ack");

    const routed = await consoleAgain.next("relay.route");
    expect(routed.id).toBe("r-queued");
    expect(routed.payload).toEqual({ to: "console-1", ciphertext: "abc", nonce: "xyz" });

    device.close();
    consoleAgain.close();
  });

  it("push provider failure does not break queueing or route error", async () => {
    const boom: PushProvider = {
      async wake(): Promise<"failed"> {
        throw new Error("push boom");
      },
    };
    const relay = await startRelay({ push: boom });
    const { device, consoleClient } = await registerAndPair(
      relay,
      "device-1",
      "console-1",
      { pushToken: "push-tok-1" },
    );

    consoleClient.close();
    await new Promise((r) => setTimeout(r, 30));

    device.send({
      v: 1,
      type: "relay.route",
      id: "r-boom",
      from: "device-1",
      to: "console-1",
      ts: Date.now(),
      payload: { to: "console-1", ciphertext: "abc", nonce: "xyz" },
    });

    const err = await device.next("relay.error");
    expect((err.payload as { code: string }).code).toBe("E_ROUTE");

    const consoleAgain = await TestClient.connect(relay.port);
    consoleAgain.send(
      registerEnvelope("reg-c-again", "console-1", { consoleId: "console-1" }),
    );
    await consoleAgain.next("relay.register.ack");

    const routed = await consoleAgain.next("relay.route");
    expect(routed.id).toBe("r-boom");
    expect(routed.payload).toEqual({ to: "console-1", ciphertext: "abc", nonce: "xyz" });

    device.close();
    consoleAgain.close();
  });

  it("rate limits authenticated clients and returns E_RATE", async () => {
    const relay = await startRelay({
      rateLimit: { perMinute: 60_000, burst: 0 },
    });

    const device = await TestClient.connect(relay.port);
    device.send(registerEnvelope("reg-rl", "device-rl", { deviceId: "device-rl" }));
    await device.next("relay.register.ack");

    // burst=0: the first post-register envelope must be rejected with E_RATE.
    device.send(makeEnvelope("relay.heartbeat", "hb-1", "device-rl"));
    const err = await device.next("relay.error");
    expect((err.payload as { code: string }).code).toBe("E_RATE");

    device.close();
  });

  it("hello.ack carries version fields and flags incompatible protocolVersion", async () => {
    const relay = await startRelay();
    const c = await TestClient.connect(relay.port);

    c.send(
      makeEnvelope("relay.hello", "hello-1", "device-v", {
        protocolVersion: RELAY_SERVER_PROTOCOL_VERSION + 1,
      }),
    );
    const ack = await c.next("relay.hello.ack");
    expect(ack.payload).toMatchObject({
      relayVersion: "0.1.0",
      protocolVersion: RELAY_SERVER_PROTOCOL_VERSION,
      compatible: false,
    });

    c.close();
  });

  it("audit callback receives metadata entries without payload", async () => {
    const entries: RelayAuditEntry[] = [];
    const relay = await startRelay({
      audit: (entry) => {
        entries.push(entry);
      },
    });

    const device = await TestClient.connect(relay.port);
    device.send(registerEnvelope("reg-audit", "device-audit", { deviceId: "device-audit" }));
    await device.next("relay.register.ack");

    const register = entries.find((e) => e.event === "register");
    expect(register).toBeDefined();
    expect(register).toMatchObject({
      event: "register",
      from: "device-audit",
      to: "relay",
      ok: true,
    });
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual(["event", "from", "ok", "to", "ts"]);
    }

    device.close();
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
