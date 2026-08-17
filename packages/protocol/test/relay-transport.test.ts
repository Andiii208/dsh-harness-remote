import { describe, expect, it } from "vitest";
import {
  makeHeartbeat,
  makeHello,
  makePair,
  makeRegister,
  RELAY_ENVELOPE_VERSION,
  RelayTransport,
} from "../src/relay.js";
import type { WsCtor, WsLike } from "../src/ws.js";

class FakeWs implements WsLike {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = 0;
  closed = false;
  sent: string[] = [];
  static instances: FakeWs[] = [];
  constructor(public url: string) {
    FakeWs.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  recv(data: unknown): void {
    this.onmessage?.({ data });
  }
  static fresh(): WsCtor {
    FakeWs.instances = [];
    return FakeWs;
  }
}

function relayAck(
  type: "relay.hello.ack" | "relay.register.ack",
  id: string,
  to: string,
  payload?: unknown,
): string {
  return JSON.stringify({
    v: RELAY_ENVELOPE_VERSION,
    type,
    id,
    from: "relay",
    to,
    ts: Date.now(),
    ...(payload !== undefined ? { payload } : {}),
  });
}

async function collect(
  iter: AsyncIterable<unknown>,
  n: number,
): Promise<unknown[]> {
  const out: unknown[] = [];
  const it = iter[Symbol.asyncIterator]();
  for (let i = 0; i < n; i++) {
    const r = await it.next();
    if (r.done) break;
    out.push(r.value);
  }
  return out;
}

async function connectedPair(): Promise<{ conn: Awaited<ReturnType<RelayTransport["connect"]>>; ws: FakeWs }> {
  const transport = new RelayTransport({
    wsImpl: FakeWs.fresh(),
    deviceId: "device-a",
  });
  const p = transport.connect({ host: "relay.example", port: 4090 }, {});
  const ws = FakeWs.instances[0]!;
  ws.open();

  const hello = JSON.parse(ws.sent[0]!) as { id: string };
  const register = JSON.parse(ws.sent[1]!) as { id: string };
  ws.recv(relayAck("relay.hello.ack", hello.id, "device-a"));
  ws.recv(
    relayAck("relay.register.ack", register.id, "device-a", {
      credential: "cred-1",
      ttlMs: 900_000,
    }),
  );

  const conn = await p;
  return { conn, ws };
}

describe("relay request constructors", () => {
  it("makeHello/makeRegister produce correct control fields", () => {
    const hello = makeHello("device-a", { id: "id-1", ts: 42 });
    expect(hello).toMatchObject({
      v: 1,
      type: "relay.hello",
      id: "id-1",
      from: "device-a",
      to: "relay",
      ts: 42,
      payload: { protocolVersion: 1 },
    });

    const reg = makeRegister(
      "device-a",
      { deviceId: "device-a", publicKey: { kty: "EC" } },
      { id: "id-2", ts: 43 },
    );
    expect(reg).toMatchObject({
      v: 1,
      type: "relay.register",
      id: "id-2",
      from: "device-a",
      to: "relay",
      ts: 43,
    });
    expect(reg.payload).toEqual({ deviceId: "device-a", publicKey: { kty: "EC" } });
  });

  it("makePair/makeHeartbeat produce correct control fields", () => {
    const pair = makePair("device-a", "123456", "console-c", { id: "p1", ts: 1 });
    expect(pair).toMatchObject({
      v: 1,
      type: "relay.pair",
      id: "p1",
      from: "device-a",
      to: "relay",
      ts: 1,
    });
    expect(pair.payload).toEqual({ code: "123456", deviceId: "console-c" });

    const hb = makeHeartbeat("device-a", { rttMs: 7 }, { id: "h1", ts: 2 });
    expect(hb).toMatchObject({
      v: 1,
      type: "relay.heartbeat",
      id: "h1",
      from: "device-a",
      to: "relay",
      ts: 2,
      payload: { rttMs: 7 },
    });

    const hbNoPayload = makeHeartbeat("device-a");
    expect(hbNoPayload.payload).toBeUndefined();
  });
});

describe("RelayTransport.connect", () => {
  it("builds ws:// url, sends hello/register, waits for both acks, then unary sends relay.route", async () => {
    const transport = new RelayTransport({
      wsImpl: FakeWs.fresh(),
      deviceId: "device-a",
    });
    const p = transport.connect({ host: "relay.example", port: 4090 }, {});
    const ws = FakeWs.instances[0]!;
    expect(ws.url).toBe("ws://relay.example:4090");

    ws.open();
    expect(ws.sent).toHaveLength(2);
    const hello = JSON.parse(ws.sent[0]!) as {
      type: string;
      from: string;
      to: string;
      id: string;
    };
    expect(hello).toMatchObject({ type: "relay.hello", from: "device-a", to: "relay" });
    const register = JSON.parse(ws.sent[1]!) as {
      type: string;
      from: string;
      payload: { deviceId: string; protocolVersion: number };
      id: string;
    };
    expect(register).toMatchObject({
      type: "relay.register",
      from: "device-a",
      payload: { deviceId: "device-a", protocolVersion: 1 },
    });

    ws.recv(relayAck("relay.hello.ack", hello.id, "device-a"));
    ws.recv(
      relayAck("relay.register.ack", register.id, "device-a", {
        credential: "cred-1",
        ttlMs: 900_000,
      }),
    );

    const conn = await p;
    const unaryP = conn.unary("host.describe", { want: "list" });
    const route = JSON.parse(ws.sent[2]!) as {
      v: number;
      type: string;
      from: string;
      payload: { rpcId: string; method: string; payload: unknown };
    };
    expect(route).toMatchObject({
      v: 1,
      type: "relay.route",
      from: "device-a",
      payload: { method: "host.describe", payload: { want: "list" } },
    });
    expect(typeof route.payload.rpcId).toBe("string");

    ws.recv(
      JSON.stringify({
        v: 1,
        type: "relay.route",
        id: "resp-1",
        from: "console-c",
        to: "device-a",
        ts: Date.now(),
        payload: { rpcId: route.payload.rpcId, ok: true, result: { name: "dsh" } },
      }),
    );
    await expect(unaryP).resolves.toEqual({
      rpcId: route.payload.rpcId,
      ok: true,
      result: { name: "dsh" },
    });
  });

  it("appends auth.token as credential query parameter", async () => {
    const transport = new RelayTransport({
      wsImpl: FakeWs.fresh(),
      deviceId: "device-a",
      relayUrl: "wss://relay.example",
    });
    const p = transport.connect({ host: "ignored", port: 0 }, { token: "tok-9" });
    const ws = FakeWs.instances[0]!;
    expect(ws.url).toBe("wss://relay.example?credential=tok-9");
    // keep the pending handshake from leaking a timeout
    ws.open();
    const hello = JSON.parse(ws.sent[0]!) as { id: string };
    const register = JSON.parse(ws.sent[1]!) as { id: string };
    ws.recv(relayAck("relay.hello.ack", hello.id, "device-a"));
    ws.recv(relayAck("relay.register.ack", register.id, "device-a"));
    await p;
  });

  it("rejects when relay.error arrives during the control-plane handshake", async () => {
    const transport = new RelayTransport({
      wsImpl: FakeWs.fresh(),
      deviceId: "device-a",
    });
    const p = transport.connect({ host: "relay.example", port: 4090 }, {});
    const ws = FakeWs.instances[0]!;
    ws.open();
    ws.recv(
      JSON.stringify({
        v: 1,
        type: "relay.error",
        id: "e1",
        from: "relay",
        to: "device-a",
        ts: Date.now(),
        payload: { code: "E_AUTH", message: "bad credential" },
      }),
    );
    await expect(p).rejects.toThrow(/E_AUTH: bad credential/);
  });

  it("yields decodeFrame'd frames from incoming relay.route payloads", async () => {
    const { conn, ws } = await connectedPair();
    const frames = collect(conn.events, 1);
    ws.recv(
      JSON.stringify({
        v: 1,
        type: "relay.route",
        id: "r1",
        from: "console-c",
        to: "device-a",
        ts: Date.now(),
        payload: { type: "session/event", sessionId: "s1" },
      }),
    );
    const got = await frames;
    expect(got[0]).toMatchObject({ type: "session/event", sessionId: "s1" });
  });

  it("times out when the relay never acks hello/register", async () => {
    const transport = new RelayTransport({
      wsImpl: FakeWs.fresh(),
      deviceId: "device-a",
      connectTimeoutMs: 20,
    });
    const p = transport.connect({ host: "relay.example", port: 4090 }, {});
    const ws = FakeWs.instances[0]!;
    ws.open();
    await expect(p).rejects.toThrow(/control plane not ready before 20ms timeout/);
  });
});
