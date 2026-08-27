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
      const idx = this.waiters.findIndex((w) => w.type === env.type);
      if (idx >= 0) {
        const waiter = this.waiters[idx];
        if (waiter) {
          this.waiters.splice(idx, 1);
          clearTimeout(waiter.timer);
          waiter.resolve(env);
          return; // 已交给 waiter，不再入队，避免同一信封被消费两次
        }
      }
      this.queue.push(env);
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
    to: type === "relay.hello" || type === "relay.register" || type === "relay.pair" || type === "relay.pair.code"
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
  it("terminates connections that exceed maxPayloadBytes without breaking the server (C4)", async () => {
    const relay = await startRelay({ maxPayloadBytes: 64 * 1024 });
    // ws 库对超限帧的终止方式存在平台差异：1009（优雅拒绝）或客户端侧
    // WS_ERR_UNSUPPORTED_MESSAGE_LENGTH / 1006。统一断言「连接被终止」，
    // 并对服务器做后续健康探活，验证限额生效且不误伤其他连接。
    const outcome = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${relay.port}`);
      const timer = setTimeout(
        () => reject(new Error("connection survived 3s after oversized frame")),
        3000,
      );
      ws.on("close", (code) => {
        clearTimeout(timer);
        resolve(`close:${code}`);
      });
      ws.on("open", () => {
        ws.send("x".repeat(80 * 1024));
      });
      ws.on("error", (err) => {
        clearTimeout(timer);
        resolve(`error:${(err as { code?: string }).code ?? "unknown"}`);
      });
    });
    expect(outcome).toMatch(/^(close:1006|close:1009|error:)/);

    // 服务器不受影响：健康检查与正常小帧控制面流程照常。
    const res = await fetch(`http://127.0.0.1:${relay.port}/healthz`);
    expect(res.status).toBe(200);
    const normal = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${relay.port}`);
      const timer = setTimeout(() => reject(new Error("normal client timeout")), 3000);
      ws.on("open", () => {
        clearTimeout(timer);
        resolve("opened");
      });
      ws.on("error", () => { /* 不应发生 */ });
    });
    expect(normal).toBe("opened");
  });

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

    it("rejects relay.pair.code from an unauthenticated socket with E_AUTH", async () => {
      const relay = await startRelay();
      const c = await TestClient.connect(relay.port);
      c.send(makeEnvelope("relay.pair.code", "pc-unauth", "console-x"));

      const err = await c.next("relay.error");
      expect((err.payload as { code: string }).code).toBe("E_AUTH");

      c.close();
    });

    it("issues a one-time 6-digit code to an authenticated console", async () => {
      const relay = await startRelay();

      const consoleClient = await TestClient.connect(relay.port);
      consoleClient.send(
        registerEnvelope("reg-pc-console", "console-pc", { consoleId: "console-pc" }),
      );
      await consoleClient.next("relay.register.ack");

      consoleClient.send(makeEnvelope("relay.pair.code", "pc-1", "console-pc"));
      const ack = await consoleClient.next("relay.pair.code.ack");
      expect(ack.from).toBe("relay");
      expect(ack.to).toBe("console-pc");

      const payload = ack.payload as { code: string; ttlMs: number };
      expect(payload.code).toMatch(/^\d{6}$/);
      expect(payload.ttlMs).toBe(600_000);

      // 同一个码只能被消费一次：第一次配对成功，第二次返回 E_PAIR。
      const device = await TestClient.connect(relay.port);
      device.send(registerEnvelope("reg-pc-device", "device-pc", { deviceId: "device-pc" }));
      await device.next("relay.register.ack");

      device.send(
        makeEnvelope("relay.pair", "pair-pc-1", "device-pc", { code: payload.code, deviceId: "device-pc" }),
      );
      const pairAck = await device.next("relay.pair.ack");
      expect(pairAck.payload).toMatchObject({ deviceId: "device-pc", consoleId: "console-pc" });

      device.send(
        makeEnvelope("relay.pair", "pair-pc-2", "device-pc", { code: payload.code, deviceId: "device-pc" }),
      );
      const pairErr = await device.next("relay.error");
      expect((pairErr.payload as { code: string }).code).toBe("E_PAIR");

      consoleClient.close();
      device.close();
    });

    it("rejects relay.pair.code from an authenticated device (not console)", async () => {
      const relay = await startRelay();
      const device = await TestClient.connect(relay.port);
      device.send(registerEnvelope("reg-pc-dev", "device-only", { deviceId: "device-only" }));
      await device.next("relay.register.ack");

      device.send(makeEnvelope("relay.pair.code", "pc-dev", "device-only"));
      const err = await device.next("relay.error");
      expect((err.payload as { code: string }).code).toBe("E_AUTH");

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

  it("rejects re-register with a different publicKey for a bound clientId (C1)", async () => {
    const relay = await startRelay();
    const legitKey = { kty: "EC", crv: "P-256", x: "legit-x", y: "legit-y" };
    const attackerKey = { kty: "EC", crv: "P-256", x: "evil-x", y: "evil-y" };

    const device = await TestClient.connect(relay.port);
    device.send(registerEnvelope("reg-d1", "device-1", { deviceId: "device-1" }));
    await device.next("relay.register.ack");

    const legit = await TestClient.connect(relay.port);
    legit.send(
      registerEnvelope("reg-c1", "console-1", { consoleId: "console-1", publicKey: legitKey }),
    );
    await legit.next("relay.register.ack");

    // 攻击者以同一 consoleId 但不同公钥抢注 → E_AUTH，且 store 中公钥不变。
    const attacker = await TestClient.connect(relay.port);
    attacker.send(
      registerEnvelope("reg-c2", "console-1", { consoleId: "console-1", publicKey: attackerKey }),
    );
    const err = await attacker.next("relay.error");
    expect(err.payload).toMatchObject({ code: "E_AUTH" });
    expect(relay.store.getClient("console-1")?.publicKey).toEqual(legitKey);

    // 未携带公钥的重复注册不得清掉既有公钥绑定。
    const naive = await TestClient.connect(relay.port);
    naive.send(registerEnvelope("reg-c3", "console-1", { consoleId: "console-1" }));
    await naive.next("relay.register.ack");
    expect(relay.store.getClient("console-1")?.publicKey).toEqual(legitKey);

    // 合法客户端持同一把公钥重连仍然成功（重启回连场景）。
    const legitReconnect = await TestClient.connect(relay.port);
    legitReconnect.send(
      registerEnvelope("reg-c4", "console-1", { consoleId: "console-1", publicKey: legitKey }),
    );
    await legitReconnect.next("relay.register.ack");

    device.close();
    legit.close();
    attacker.close();
    naive.close();
    legitReconnect.close();
  });

  it("notifies an online console when a device pairs (relay.pair.ack)", async () => {
    const relay = await startRelay();
    const devicePublicKey = { kty: "EC", crv: "P-256", x: "dev-x", y: "dev-y" };

    const device = await TestClient.connect(relay.port);
    device.send(
      registerEnvelope("reg-d", "device-1", { deviceId: "device-1", publicKey: devicePublicKey }),
    );
    await device.next("relay.register.ack");

    const consoleClient = await TestClient.connect(relay.port);
    consoleClient.send(
      registerEnvelope("reg-c", "console-1", { consoleId: "console-1" }),
    );
    await consoleClient.next("relay.register.ack");

    const code = relay.store.createPairingCode("console-1");
    device.send(
      makeEnvelope("relay.pair", "pair-online", "device-1", { code, deviceId: "device-1" }),
    );

    const ack = await device.next("relay.pair.ack");
    const notice = await consoleClient.next("relay.pair.ack");

    expect(ack.id).not.toBe(notice.id);
    expect(notice.from).toBe("relay");
    expect(notice.to).toBe("console-1");
    expect(notice.payload).toMatchObject({
      deviceId: "device-1",
      peerPublicKey: devicePublicKey,
    });

    device.close();
    consoleClient.close();
  });

  it("queues pair notification for an offline console and delivers after re-register", async () => {
    const relay = await startRelay();
    const devicePublicKey = { kty: "EC", crv: "P-256", x: "dev-x", y: "dev-y" };

    const device = await TestClient.connect(relay.port);
    device.send(
      registerEnvelope("reg-d", "device-1", { deviceId: "device-1", publicKey: devicePublicKey }),
    );
    await device.next("relay.register.ack");

    const consoleClient = await TestClient.connect(relay.port);
    consoleClient.send(
      registerEnvelope("reg-c", "console-1", { consoleId: "console-1" }),
    );
    await consoleClient.next("relay.register.ack");

    consoleClient.close();
    await new Promise((r) => setTimeout(r, 30));

    const code = relay.store.createPairingCode("console-1");
    device.send(
      makeEnvelope("relay.pair", "pair-offline", "device-1", { code, deviceId: "device-1" }),
    );
    const ack = await device.next("relay.pair.ack");
    expect(ack.payload).toMatchObject({ deviceId: "device-1", consoleId: "console-1" });

    const consoleAgain = await TestClient.connect(relay.port);
    consoleAgain.send(
      registerEnvelope("reg-c-again", "console-1", { consoleId: "console-1" }),
    );
    await consoleAgain.next("relay.register.ack");

    const notice = await consoleAgain.next("relay.pair.ack");
    expect(notice.from).toBe("relay");
    expect(notice.to).toBe("console-1");
    expect(notice.payload).toMatchObject({
      deviceId: "device-1",
      peerPublicKey: devicePublicKey,
    });

    device.close();
    consoleAgain.close();
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

describe("relay pair hardening (P2b)", () => {
  it("locks unauthenticated pair attempts after repeated failures", async () => {
    const entries: RelayAuditEntry[] = [];
    const relay = await startRelay({
      maxPairAttempts: 3,
      pairLockMs: 60_000,
      audit: (entry) => entries.push(entry),
    });

    const c = await TestClient.connect(relay.port);
    // 连续快速尝试，服务端应在第 3 次触发锁定
    for (let i = 0; i < 3; i++) {
      c.send(
        makeEnvelope("relay.pair", `brute-${i}`, "attacker-device", {
          code: "000000",
          deviceId: "attacker-device",
        }),
      );
    }
    const first = await c.next("relay.error");
    const second = await c.next("relay.error");
    const third = await c.next("relay.error");
    expect((first.payload as { code: string }).code).toBe("E_PAIR");
    expect((second.payload as { code: string }).code).toBe("E_PAIR");
    expect((third.payload as { code: string }).code).toBe("E_RATE");

    // 锁定后继续尝试也拒绝
    c.send(
      makeEnvelope("relay.pair", "brute-locked", "attacker-device", {
        code: "000001",
        deviceId: "attacker-device",
      }),
    );
    const locked = await c.next("relay.error");
    expect((locked.payload as { code: string }).code).toBe("E_RATE");

    const pairFails = entries.filter((e) => e.event === "pair_fail");
    expect(pairFails.length).toBeGreaterThanOrEqual(3);
    expect(entries.some((e) => e.event === "pair_lock")).toBe(true);
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual(["event", "from", "ok", "to", "ts"]);
    }

    c.close();
  });

  it("limits the number of unused pairing codes per console", async () => {
    const relay = await startRelay({ maxPairingCodesPerConsole: 2 });
    const consoleClient = await TestClient.connect(relay.port);
    consoleClient.send(
      registerEnvelope("reg-console-limit", "console-limit", { consoleId: "console-limit" }),
    );
    await consoleClient.next("relay.register.ack");

    for (let i = 0; i < 2; i++) {
      consoleClient.send(
        makeEnvelope("relay.pair.code", `code-${i}`, "console-limit", {}),
      );
      const ack = await consoleClient.next("relay.pair.code.ack");
      expect(ack.payload).toMatchObject({ code: expect.stringMatching(/^\d{6}$/) });
    }

    consoleClient.send(
      makeEnvelope("relay.pair.code", "code-over", "console-limit", {}),
    );
    const err = await consoleClient.next("relay.error");
    expect((err.payload as { code: string }).code).toBe("E_RATE");
    expect((err.payload as { message: string }).message).toContain("too many unused pairing codes");

    consoleClient.close();
  });
});
