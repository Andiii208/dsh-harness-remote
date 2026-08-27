/**
 * M3.7 release-gate prep: multi console/device isolation.
 *
 * Two devices + two consoles: pairing is per-pair, routes are delivered only
 * to the paired peer, and offline queues are isolated per peer.
 */

import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type RawData } from "ws";
import { createRelayServer, type RelayServer } from "../src/index.js";
import type { RelayEnvelope } from "@dsh-remote/protocol";

const relays: RelayServer[] = [];

afterEach(async () => {
  await Promise.all(relays.splice(0).map((r) => r.stop()));
});

async function startRelay(): Promise<RelayServer> {
  const relay = createRelayServer({ credentialTtlMs: 60_000 });
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

  static connect(port: number): Promise<TestClient> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
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
      const timerRef: { current?: NodeJS.Timeout } = {};
      timerRef.current = setTimeout(
        () => reject(new Error(`timeout waiting for ${type}`)),
        timeoutMs,
      );
      this.waiters.push({ type, resolve, timer: timerRef.current! });
    });
  }

  expectNo(type: string, timeoutMs = 250): Promise<void> {
    return new Promise((resolve, reject) => {
      const idx = this.queue.findIndex((e) => e.type === type);
      if (idx >= 0) {
        reject(new Error(`unexpected ${type}`));
        return;
      }
      const timerRef: { current?: NodeJS.Timeout } = {};
      const waiter = {
        type,
        resolve: (): void => {
          clearTimeout(timerRef.current);
          reject(new Error(`unexpected ${type}`));
        },
        timer: setTimeout(() => {
          const i = this.waiters.findIndex((w) => w.type === type);
          if (i >= 0) this.waiters.splice(i, 1);
          resolve();
        }, timeoutMs),
      };
      if (timerRef.current !== undefined) this.waiters.push(waiter);
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

function registerEnvelope(id: string, from: string, payload: Record<string, unknown>): Record<string, unknown> {
  return makeEnvelope("relay.register", id, from, payload);
}

async function registerClient(relay: RelayServer, id: string, kind: "device" | "console"): Promise<TestClient> {
  const c = await TestClient.connect(relay.port);
  c.send(registerEnvelope(`reg-${id}`, id, kind === "console" ? { consoleId: id } : { deviceId: id }));
  await c.next("relay.register.ack");
  return c;
}

async function pair(relay: RelayServer, device: TestClient, deviceId: string, consoleId: string): Promise<void> {
  const code = relay.store.createPairingCode(consoleId);
  device.send(makeEnvelope("relay.pair", `pair-${deviceId}-${consoleId}`, deviceId, { code, deviceId }));
  await device.next("relay.pair.ack");
}

describe("relay multi console/device isolation", () => {
  it("routes each device only to its paired console", async () => {
    const relay = await startRelay();
    const d1 = await registerClient(relay, "device-1", "device");
    const d2 = await registerClient(relay, "device-2", "device");
    const c1 = await registerClient(relay, "console-1", "console");
    const c2 = await registerClient(relay, "console-2", "console");

    await pair(relay, d1, "device-1", "console-1");
    await pair(relay, d2, "device-2", "console-2");

    d1.send({
      v: 1,
      type: "relay.route",
      id: "route-d1-c1",
      from: "device-1",
      to: "console-1",
      ts: Date.now(),
      payload: { to: "console-1", payload: "for-c1" },
    });

    const routed = await c1.next("relay.route");
    expect(routed.id).toBe("route-d1-c1");
    expect(routed.payload).toMatchObject({ to: "console-1" });
    await c2.expectNo("relay.route");

    // Cross-pair route must be rejected with E_PAIR and never delivered.
    d1.send({
      v: 1,
      type: "relay.route",
      id: "route-d1-c2",
      from: "device-1",
      to: "console-2",
      ts: Date.now(),
      payload: { to: "console-2", payload: "should-not-arrive" },
    });
    const err = await d1.next("relay.error");
    expect((err.payload as { code: string }).code).toBe("E_PAIR");
    await c2.expectNo("relay.route");

    d1.close();
    d2.close();
    c1.close();
    c2.close();
  });

  it("keeps offline queues isolated per console", async () => {
    const relay = await startRelay();
    const d1 = await registerClient(relay, "device-1", "device");
    const d2 = await registerClient(relay, "device-2", "device");
    const c1 = await registerClient(relay, "console-1", "console");
    const c2 = await registerClient(relay, "console-2", "console");

    await pair(relay, d1, "device-1", "console-1");
    await pair(relay, d2, "device-2", "console-2");

    c1.close();
    c2.close();
    await new Promise((r) => setTimeout(r, 30));

    d1.send({
      v: 1,
      type: "relay.route",
      id: "queue-d1-c1",
      from: "device-1",
      to: "console-1",
      ts: Date.now(),
      payload: { to: "console-1", ciphertext: "abc", nonce: "xyz" },
    });
    await d1.next("relay.error");

    d2.send({
      v: 1,
      type: "relay.route",
      id: "queue-d2-c2",
      from: "device-2",
      to: "console-2",
      ts: Date.now(),
      payload: { to: "console-2", ciphertext: "def", nonce: "uvw" },
    });
    await d2.next("relay.error");

    const c1b = await TestClient.connect(relay.port);
    c1b.send(registerEnvelope("reg-c1b", "console-1", { consoleId: "console-1" }));
    await c1b.next("relay.register.ack");
    const routed1 = await c1b.next("relay.route");
    expect(routed1.id).toBe("queue-d1-c1");

    const c2b = await TestClient.connect(relay.port);
    c2b.send(registerEnvelope("reg-c2b", "console-2", { consoleId: "console-2" }));
    await c2b.next("relay.register.ack");
    const routed2 = await c2b.next("relay.route");
    expect(routed2.id).toBe("queue-d2-c2");

    d1.close();
    d2.close();
    c1b.close();
    c2b.close();
  });
});
