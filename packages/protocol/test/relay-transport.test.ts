import { describe, expect, it, vi } from "vitest";
import {
  makeHeartbeat,
  makeHello,
  makePair,
  makeRegister,
  RELAY_ENVELOPE_VERSION,
  RelayTransport,
} from "../src/relay.js";
import {
  deriveRelaySessionKeys,
  generateRelayKeyPair,
  openRelayPayload,
  sealRelayPayload,
} from "../src/relay-crypto.js";
import type { WsCtor, WsLike } from "../src/ws.js";

const crypto = globalThis.crypto;

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

function relayPairAck(id: string, to: string, payload: unknown): string {
  return JSON.stringify({
    v: RELAY_ENVELOPE_VERSION,
    type: "relay.pair.ack",
    id,
    from: "relay",
    to,
    ts: Date.now(),
    payload,
  });
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

async function connectedPair(
  opts: ConstructorParameters<typeof RelayTransport>[0] = {},
): Promise<{ conn: Awaited<ReturnType<RelayTransport["connect"]>>; ws: FakeWs }> {
  const transport = new RelayTransport({
    wsImpl: FakeWs.fresh(),
    deviceId: "device-a",
    ...opts,
  });
  const p = transport.connect({ host: "relay.example", port: 4090 }, {});
  const ws = FakeWs.instances[0]!;
  ws.open();
  await vi.waitFor(() => expect(ws.sent.length).toBe(2));

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

async function connectedEncryptedPair(): Promise<{
  conn: Awaited<ReturnType<RelayTransport["connect"]>>;
  ws: FakeWs;
  encKey: CryptoKey;
}> {
  const device = await generateRelayKeyPair(crypto);
  const console_ = await generateRelayKeyPair(crypto);
  const keys = await deriveRelaySessionKeys(
    crypto,
    device.privateKeyJwk,
    console_.publicKeyJwk,
  );

  const transport = new RelayTransport({
    wsImpl: FakeWs.fresh(),
    deviceId: "device-a",
    peerId: "console-c",
    privateKeyJwk: device.privateKeyJwk,
    peerPublicKeyJwk: console_.publicKeyJwk,
    crypto,
  });
  const p = transport.connect({ host: "relay.example", port: 4090 }, {});
  const ws = FakeWs.instances[0]!;
  ws.open();

  // M3.2 key derivation is async: connect() creates the socket first, then
  // awaits deriveRelaySessionKeys before attaching onopen and sending hello.
  await vi.waitFor(() => {
    expect(ws.sent.length).toBe(2);
  });

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
  return { conn, ws, encKey: keys.encKey };
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
    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));
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

  it("auto-generates a keypair and sends a non-null publicKey in relay.register", async () => {
    const transport = new RelayTransport({
      wsImpl: FakeWs.fresh(),
      deviceId: "device-a",
      crypto,
    });
    const p = transport.connect({ host: "relay.example", port: 4090 }, {});
    const ws = FakeWs.instances[0]!;
    ws.open();
    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));

    const register = JSON.parse(ws.sent[1]!) as {
      id: string;
      payload: { deviceId: string; publicKey: JsonWebKey };
    };
    expect(register.payload.deviceId).toBe("device-a");
    expect(register.payload.publicKey).not.toBeNull();
    expect(register.payload.publicKey).toMatchObject({
      kty: "EC",
      crv: "P-256",
    });
    expect(typeof register.payload.publicKey.x).toBe("string");
    expect(typeof register.payload.publicKey.y).toBe("string");

    const hello = JSON.parse(ws.sent[0]!) as { id: string };
    ws.recv(relayAck("relay.hello.ack", hello.id, "device-a"));
    ws.recv(relayAck("relay.register.ack", register.id, "device-a"));
    await p;
  });

  it("sends relay.pair with code+deviceId after the handshake when pairCode is configured", async () => {
    const transport = new RelayTransport({
      wsImpl: FakeWs.fresh(),
      deviceId: "device-a",
      pairCode: "123456",
      crypto,
    });
    const p = transport.connect({ host: "relay.example", port: 4090 }, {});
    const ws = FakeWs.instances[0]!;
    ws.open();
    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));

    const hello = JSON.parse(ws.sent[0]!) as { id: string };
    const register = JSON.parse(ws.sent[1]!) as { id: string };
    ws.recv(relayAck("relay.hello.ack", hello.id, "device-a"));
    ws.recv(relayAck("relay.register.ack", register.id, "device-a"));

    await vi.waitFor(() => expect(ws.sent).toHaveLength(3));
    const pair = JSON.parse(ws.sent[2]!) as {
      v: number;
      type: string;
      from: string;
      to: string;
      id: string;
      payload: { code: string; deviceId: string };
    };
    expect(pair).toMatchObject({
      v: 1,
      type: "relay.pair",
      from: "device-a",
      to: "relay",
      payload: { code: "123456", deviceId: "device-a" },
    });

    ws.recv(
      relayPairAck(pair.id, "device-a", {
        code: "123456",
        deviceId: "device-a",
        consoleId: "console-c",
      }),
    );
    await p;
  });

  it("surfaces unsolicited host events via onHostEvent (0.4)", async () => {
    const hostEvents: Array<Record<string, unknown>> = [];
    const transport = new RelayTransport({
      wsImpl: FakeWs.fresh(),
      deviceId: "device-a",
      onHostEvent: (e) => hostEvents.push(e),
    });
    const p = transport.connect({ host: "relay", port: 4090 }, { token: undefined });
    const ws = FakeWs.instances[0]!;
    ws.open();
    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));
    const hello = JSON.parse(ws.sent[0]!) as { id: string };
    const register = JSON.parse(ws.sent[1]!) as { id: string };
    ws.recv(relayAck("relay.hello.ack", hello.id, "device-a"));
    ws.recv(relayAck("relay.register.ack", register.id, "device-a"));
    const conn = await p;

    // console 推送（relay.route 信封直投，无 pending 对应）→ onHostEvent 收到。
    ws.recv(
      JSON.stringify({
        v: 1,
        type: "relay.route",
        id: "srv-frame",
        from: "console-c",
        to: "device-a",
        ts: Date.now(),
        payload: {
          rpcId: "srv-abc",
          ok: true,
          result: { __dshRemoteEvent: "tunnel.urlChanged", url: "https://new.trycloudflare.com" },
        },
      }),
    );
    await vi.waitFor(() => expect(hostEvents).toHaveLength(1));
    expect(hostEvents[0]).toMatchObject({
      __dshRemoteEvent: "tunnel.urlChanged",
      url: "https://new.trycloudflare.com",
    });
    void conn;
  });

  it("derives the session key from relay.pair.ack and seals unary routes", async () => {
    const device = await generateRelayKeyPair(crypto);
    const console_ = await generateRelayKeyPair(crypto);
    const expectedKeys = await deriveRelaySessionKeys(
      crypto,
      device.privateKeyJwk,
      console_.publicKeyJwk,
    );

    let onPairAck: { consoleId: string; peerPublicKey: unknown } | undefined;
    const transport = new RelayTransport({
      wsImpl: FakeWs.fresh(),
      deviceId: "device-a",
      privateKeyJwk: device.privateKeyJwk,
      pairCode: "654321",
      crypto,
      onPairAck: (ack) => {
        onPairAck = ack;
      },
    });
    const p = transport.connect({ host: "relay.example", port: 4090 }, {});
    const ws = FakeWs.instances[0]!;
    ws.open();
    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));

    const hello = JSON.parse(ws.sent[0]!) as { id: string };
    const register = JSON.parse(ws.sent[1]!) as { id: string };
    ws.recv(relayAck("relay.hello.ack", hello.id, "device-a"));
    ws.recv(relayAck("relay.register.ack", register.id, "device-a"));
    await vi.waitFor(() => expect(ws.sent).toHaveLength(3));
    const pair = JSON.parse(ws.sent[2]!) as { id: string };

    ws.recv(
      relayPairAck(pair.id, "device-a", {
        code: "654321",
        deviceId: "device-a",
        consoleId: "console-c",
        peerPublicKey: console_.publicKeyJwk,
      }),
    );

    const conn = await p;
    expect(onPairAck).toEqual({
      consoleId: "console-c",
      peerPublicKey: console_.publicKeyJwk,
    });

    const _unaryP = conn.unary("host.describe", { want: "list" });
    await vi.waitFor(() => expect(ws.sent).toHaveLength(4));
    const route = JSON.parse(ws.sent[3]!) as {
      type: string;
      payload: { to?: string; ciphertext?: string; nonce?: string; rpcId?: string; method?: string; payload?: unknown };
    };
    expect(route.type).toBe("relay.route");
    expect(route.payload.to).toBe("console-c");
    expect(typeof route.payload.ciphertext).toBe("string");
    expect(typeof route.payload.nonce).toBe("string");
    expect(route.payload.rpcId).toBeUndefined();
    expect(route.payload.method).toBeUndefined();
    expect(route.payload.payload).toBeUndefined();
    expect(Object.keys(route.payload).sort()).toEqual(["ciphertext", "nonce", "to"]);

    const inner = await openRelayPayload(crypto, expectedKeys.encKey, {
      ciphertext: route.payload.ciphertext!,
      nonce: route.payload.nonce!,
    });
    expect(inner).toMatchObject({ method: "host.describe", payload: { want: "list" } });
  });

  it("includes pushToken in relay.register payload when configured", async () => {
    const transport = new RelayTransport({
      wsImpl: FakeWs.fresh(),
      deviceId: "device-a",
      pushToken: "push-tok-1",
    });
    const p = transport.connect({ host: "relay.example", port: 4090 }, {});
    const ws = FakeWs.instances[0]!;
    ws.open();
    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));

    const hello = JSON.parse(ws.sent[0]!) as { id: string };
    const register = JSON.parse(ws.sent[1]!) as {
      id: string;
      payload: { deviceId: string; pushToken?: string };
    };
    expect(register.payload).toMatchObject({
      deviceId: "device-a",
      pushToken: "push-tok-1",
    });

    ws.recv(relayAck("relay.hello.ack", hello.id, "device-a"));
    ws.recv(
      relayAck("relay.register.ack", register.id, "device-a", {
        credential: "cred-1",
        ttlMs: 900_000,
      }),
    );
    await p;
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
    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));
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
    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));
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

  it("encKey mode: unary sends a sealed relay.route without plaintext rpcId/method", async () => {
    const { conn, ws, encKey } = await connectedEncryptedPair();

    const unaryP = conn.unary("host.describe", { want: "list" });
    await vi.waitFor(() => {
      expect(ws.sent.length).toBe(3);
    });

    const route = JSON.parse(ws.sent[2]!) as {
      type: string;
      payload: {
        to?: string;
        ciphertext?: string;
        nonce?: string;
        rpcId?: string;
        method?: string;
        payload?: unknown;
      };
    };
    expect(route.type).toBe("relay.route");
    expect(route.payload.to).toBe("console-c");
    expect(typeof route.payload.ciphertext).toBe("string");
    expect(typeof route.payload.nonce).toBe("string");
    expect(route.payload.rpcId).toBeUndefined();
    expect(route.payload.method).toBeUndefined();
    expect(route.payload.payload).toBeUndefined();
    expect(JSON.stringify(route)).not.toContain("host.describe");
    expect(JSON.stringify(route)).not.toContain("want");

    const inner = await openRelayPayload(crypto, encKey, {
      ciphertext: route.payload.ciphertext!,
      nonce: route.payload.nonce!,
    });
    expect(inner).toMatchObject({ method: "host.describe", payload: { want: "list" } });

    // Resolve the pending unary through an encrypted response.
    const rpcId = (inner as { rpcId: string }).rpcId;
    const sealed = await sealRelayPayload(crypto, encKey, {
      rpcId,
      ok: true,
      result: { name: "dsh" },
    });
    ws.recv(
      JSON.stringify({
        v: 1,
        type: "relay.route",
        id: "resp-1",
        from: "console-c",
        to: "device-a",
        ts: Date.now(),
        payload: { to: "device-a", ciphertext: sealed.ciphertext, nonce: sealed.nonce },
      }),
    );
    await expect(unaryP).resolves.toEqual({ rpcId, ok: true, result: { name: "dsh" } });
  });

  it("encKey mode: incoming sealed route is decrypted and yields the inner frame", async () => {
    const { conn, ws, encKey } = await connectedEncryptedPair();

    const frames = collect(conn.events, 1);
    const sealed = await sealRelayPayload(crypto, encKey, {
      type: "session/event",
      sessionId: "s-enc",
    });
    ws.recv(
      JSON.stringify({
        v: 1,
        type: "relay.route",
        id: "r-enc",
        from: "console-c",
        to: "device-a",
        ts: Date.now(),
        payload: { to: "device-a", ciphertext: sealed.ciphertext, nonce: sealed.nonce },
      }),
    );

    const got = await frames;
    expect(got[0]).toMatchObject({ type: "session/event", sessionId: "s-enc" });
  });

  it("without encKey: sealed route payloads are ignored, plaintext frames still flow", async () => {
    const { conn, ws } = await connectedPair();

    const frames = collect(conn.events, 1);
    ws.recv(
      JSON.stringify({
        v: 1,
        type: "relay.route",
        id: "r-sealed",
        from: "console-c",
        to: "device-a",
        ts: Date.now(),
        payload: { to: "device-a", ciphertext: "abc", nonce: "xyz" },
      }),
    );
    ws.recv(
      JSON.stringify({
        v: 1,
        type: "relay.route",
        id: "r-plain",
        from: "console-c",
        to: "device-a",
        ts: Date.now(),
        payload: { type: "task/event" },
      }),
    );

    const got = await frames;
    expect(got[0]).toMatchObject({ type: "task/event" });
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

  it("rejects unary after unaryTimeoutMs when no response arrives", async () => {
    const { conn } = await connectedPair({ unaryTimeoutMs: 25 });
    const unaryP = conn.unary("session.list", {});
    await expect(unaryP).rejects.toThrow(/timed out after 25ms/);
  });
});
