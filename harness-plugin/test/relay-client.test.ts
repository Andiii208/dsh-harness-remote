import { describe, expect, it, vi } from "vitest";
import {
  deriveRelaySessionKeys,
  generateRelayKeyPair,
  openRelayPayload,
  sealRelayPayload,
} from "@dsh-remote/protocol";
import { RelayClient } from "../src/relay-client.js";
import type { WsCtor, WsLike } from "@dsh-remote/protocol";

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

function registerAck(
  id: string,
  to: string,
  payload: { credential: string; ttlMs: number },
): string {
  return JSON.stringify({
    v: 1,
    type: "relay.register.ack",
    id,
    from: "relay",
    to,
    ts: Date.now(),
    payload,
  });
}

async function connectedClient(): Promise<{ client: RelayClient; ws: FakeWs }> {
  const client = new RelayClient({
    url: "ws://relay.example:4090",
    clientId: "console-c",
    kind: "console",
    wsImpl: FakeWs.fresh(),
  });
  const p = client.connect();
  const ws = FakeWs.instances[0]!;
  ws.open();
  await vi.waitFor(() => expect(ws.sent).toHaveLength(2));
  const register = JSON.parse(ws.sent[1]!) as { id: string };
  ws.recv(registerAck(register.id, "console-c", { credential: "cred-1", ttlMs: 900_000 }));
  await p;
  return { client, ws };
}

async function connectedEncryptedClient(): Promise<{
  client: RelayClient;
  ws: FakeWs;
  consoleKeys: Awaited<ReturnType<typeof deriveRelaySessionKeys>>;
}> {
  const consolePair = await generateRelayKeyPair(crypto);
  const devicePair = await generateRelayKeyPair(crypto);
  const consoleKeys = await deriveRelaySessionKeys(
    crypto,
    consolePair.privateKeyJwk,
    devicePair.publicKeyJwk,
  );

  const client = new RelayClient({
    url: "ws://relay.example:4090",
    clientId: "console-c",
    kind: "console",
    wsImpl: FakeWs.fresh(),
    privateKeyJwk: consolePair.privateKeyJwk,
    peerPublicKeyJwk: devicePair.publicKeyJwk,
    crypto,
  });
  const p = client.connect();
  const ws = FakeWs.instances[0]!;
  ws.open();
  const register = JSON.parse(ws.sent[1]!) as { id: string };
  ws.recv(registerAck(register.id, "console-c", { credential: "cred-1", ttlMs: 900_000 }));
  await p;
  return { client, ws, consoleKeys };
}

describe("RelayClient", () => {
  it("connect opens the relay ws and sends hello + register before saving credential", async () => {
    const client = new RelayClient({
      url: "ws://relay.example:4090",
      clientId: "console-c",
      kind: "console",
      wsImpl: FakeWs.fresh(),
    });
    const p = client.connect();
    const ws = FakeWs.instances[0]!;

    expect(ws.url).toBe("ws://relay.example:4090");
    expect(client.isOnline()).toBe(false);

    ws.open();
    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));

    const hello = JSON.parse(ws.sent[0]!) as {
      v: number;
      type: string;
      from: string;
      to: string;
      payload: unknown;
    };
    expect(hello).toMatchObject({
      v: 1,
      type: "relay.hello",
      from: "console-c",
      to: "relay",
    });

    const register = JSON.parse(ws.sent[1]!) as {
      v: number;
      type: string;
      from: string;
      to: string;
      id: string;
      payload: { consoleId: string; kind: string; platform: string; protocolVersion: number };
    };
    expect(register).toMatchObject({
      v: 1,
      type: "relay.register",
      from: "console-c",
      to: "relay",
      payload: {
        consoleId: "console-c",
        kind: "console",
        platform: "node",
        protocolVersion: 1,
      },
    });

    ws.recv(registerAck(register.id, "console-c", { credential: "cred-1", ttlMs: 900_000 }));
    await p;

    expect(client.credential).toBe("cred-1");
    expect(client.isOnline()).toBe(true);
  });

  it("includes pushToken in register payload when configured", async () => {
    const client = new RelayClient({
      url: "ws://relay.example:4090",
      clientId: "console-c",
      kind: "console",
      wsImpl: FakeWs.fresh(),
      pushToken: "ExponentPushToken[test-token-1]",
    });
    const p = client.connect();
    const ws = FakeWs.instances[0]!;
    ws.open();
    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));

    const register = JSON.parse(ws.sent[1]!) as {
      type: string;
      payload: { consoleId: string; pushToken?: string };
      id: string;
    };
    expect(register).toMatchObject({
      type: "relay.register",
      payload: {
        consoleId: "console-c",
        pushToken: "ExponentPushToken[test-token-1]",
      },
    });

    ws.recv(registerAck(register.id, "console-c", { credential: "cred-1", ttlMs: 900_000 }));
    await p;
  });

  it("heartbeat sends relay.heartbeat from clientId to relay", async () => {
    const { client, ws } = await connectedClient();

    client.heartbeat();

    const hb = JSON.parse(ws.sent[2]!) as {
      v: number;
      type: string;
      from: string;
      to: string;
    };
    expect(hb).toMatchObject({
      v: 1,
      type: "relay.heartbeat",
      from: "console-c",
      to: "relay",
    });
  });

  it("send writes an envelope and onEnvelope delivers parsed incoming envelopes", async () => {
    const { client, ws } = await connectedClient();
    const seen: Array<Record<string, unknown>> = [];
    client.onEnvelope((env) => seen.push(env as unknown as Record<string, unknown>));

    await client.send({
      v: 1,
      type: "relay.route",
      id: "r1",
      from: "console-c",
      to: "peer",
      ts: Date.now(),
      payload: { want: "list" },
    });

    const sent = JSON.parse(ws.sent[2]!) as { type: string; payload: unknown };
    expect(sent).toMatchObject({ type: "relay.route", payload: { want: "list" } });

    ws.recv(
      JSON.stringify({
        v: 1,
        type: "relay.route",
        id: "r2",
        from: "peer",
        to: "console-c",
        ts: Date.now(),
        payload: { type: "session/event" },
      }),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: "relay.route", id: "r2", from: "peer" });
  });

  it("rejects connect when relay.error arrives during the handshake", async () => {
    const client = new RelayClient({
      url: "ws://relay.example:4090",
      clientId: "console-c",
      kind: "console",
      wsImpl: FakeWs.fresh(),
    });
    const p = client.connect();
    const ws = FakeWs.instances[0]!;
    ws.open();
    ws.recv(
      JSON.stringify({
        v: 1,
        type: "relay.error",
        id: "e1",
        from: "relay",
        to: "console-c",
        ts: Date.now(),
        payload: { code: "E_AUTH", message: "bad credential" },
      }),
    );

    await expect(p).rejects.toThrow(/relay error E_AUTH: bad credential/);
    expect(client.isOnline()).toBe(false);
  });

  it("seals relay.route payload with keys configured (no plaintext leak)", async () => {
    const { client, ws, consoleKeys } = await connectedEncryptedClient();

    const original = {
      to: "device-1",
      rpcId: "r1",
      method: "host.describe",
      payload: { want: "list" },
    };
    await client.send({
      v: 1,
      type: "relay.route",
      id: "r1",
      from: "console-c",
      to: "device-1",
      ts: Date.now(),
      payload: original,
    });

    const sent = JSON.parse(ws.sent[2]!) as {
      type: string;
      payload: { to?: string; ciphertext?: string; nonce?: string; rpcId?: string; method?: string };
    };
    expect(sent).toMatchObject({ type: "relay.route" });

    const payload = sent.payload;
    expect(payload.to).toBe("device-1");
    expect(payload.rpcId).toBeUndefined();
    expect(payload.method).toBeUndefined();
    expect(Object.keys(payload).sort()).toEqual(["ciphertext", "nonce", "to"]);

    await expect(
      openRelayPayload(crypto, consoleKeys.encKey, {
        ciphertext: payload.ciphertext!,
        nonce: payload.nonce!,
      }),
    ).resolves.toEqual(original);
  });

  it("decrypts incoming encrypted route and drops tampered ciphertext with onError", async () => {
    const { client, ws, consoleKeys } = await connectedEncryptedClient();
    const seen: Array<Record<string, unknown>> = [];
    const errors: unknown[] = [];
    client.onEnvelope((env) => seen.push(env as unknown as Record<string, unknown>));
    client.onError((err) => errors.push(err));

    const inner = { rpcId: "r1", method: "host.describe" };
    const sealed = await sealRelayPayload(crypto, consoleKeys.encKey, inner);
    ws.recv(
      JSON.stringify({
        v: 1,
        type: "relay.route",
        id: "r1",
        from: "device-1",
        to: "console-c",
        ts: Date.now(),
        payload: { to: "console-c", ...sealed },
      }),
    );

    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toMatchObject({ type: "relay.route", id: "r1", payload: inner });

    // 翻转 AES-GCM 输出（iv 之后）的一个真实字节，确保密文被真正篡改
    // （只改最后一个 base64url 字符可能只改到被忽略的 padding bits）。
    const tamperedBytes = Buffer.from(sealed.ciphertext, "base64url");
    tamperedBytes[tamperedBytes.length - 1] = tamperedBytes[tamperedBytes.length - 1]! ^ 0xff;
    const tampered = {
      ...sealed,
      ciphertext: tamperedBytes.toString("base64url"),
    };
    ws.recv(
      JSON.stringify({
        v: 1,
        type: "relay.route",
        id: "r2",
        from: "device-1",
        to: "console-c",
        ts: Date.now(),
        payload: { to: "console-c", ...tampered },
      }),
    );

    await vi.waitFor(() => expect(errors).toHaveLength(1), { timeout: 2000, interval: 10 });
    expect(seen).toHaveLength(1);
  });

  it("register payload carries EC public JWK when privateKeyJwk is configured", async () => {
    const consolePair = await generateRelayKeyPair(crypto);
    const client = new RelayClient({
      url: "ws://relay.example:4090",
      clientId: "console-c",
      kind: "console",
      wsImpl: FakeWs.fresh(),
      privateKeyJwk: consolePair.privateKeyJwk,
      crypto,
    });
    const p = client.connect();
    const ws = await vi.waitFor(() => {
      const instance = FakeWs.instances[0];
      expect(instance).toBeDefined();
      return instance!;
    });
    ws.open();

    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));
    const register = JSON.parse(ws.sent[1]!) as {
      type: string;
      id: string;
      payload: { publicKey?: JsonWebKey | null };
    };
    expect(register.type).toBe("relay.register");
    expect(register.payload.publicKey).not.toBeNull();
    expect(register.payload.publicKey).toMatchObject({
      kty: consolePair.publicKeyJwk.kty,
      crv: consolePair.publicKeyJwk.crv,
      x: consolePair.publicKeyJwk.x,
      y: consolePair.publicKeyJwk.y,
    });

    ws.recv(registerAck(register.id, "console-c", { credential: "cred-1", ttlMs: 900_000 }));
    await p;
  });

  it("derives session key from relay.pair.ack and sends encrypted route", async () => {
    const consolePair = await generateRelayKeyPair(crypto);
    const devicePair = await generateRelayKeyPair(crypto);
    const onPaired = vi.fn();

    const client = new RelayClient({
      url: "ws://relay.example:4090",
      clientId: "console-c",
      kind: "console",
      wsImpl: FakeWs.fresh(),
      privateKeyJwk: consolePair.privateKeyJwk,
      crypto,
      onPaired,
    });
    const p = client.connect();
    const ws = await vi.waitFor(() => {
      const instance = FakeWs.instances[0];
      expect(instance).toBeDefined();
      return instance!;
    });
    ws.open();

    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));
    const register = JSON.parse(ws.sent[1]!) as { id: string };
    ws.recv(registerAck(register.id, "console-c", { credential: "cred-1", ttlMs: 900_000 }));
    await p;

    ws.recv(
      JSON.stringify({
        v: 1,
        type: "relay.pair.ack",
        id: "pair-1",
        from: "relay",
        to: "console-c",
        ts: Date.now(),
        payload: { deviceId: "device-1", peerPublicKey: devicePair.publicKeyJwk },
      }),
    );

    await vi.waitFor(() => expect(onPaired).toHaveBeenCalledTimes(1));
    expect(onPaired).toHaveBeenCalledWith({
      deviceId: "device-1",
      peerPublicKey: devicePair.publicKeyJwk,
    });

    const original = {
      to: "device-1",
      rpcId: "r1",
      method: "host.describe",
      payload: {},
    };
    await client.send({
      v: 1,
      type: "relay.route",
      id: "r1",
      from: "console-c",
      to: "device-1",
      ts: Date.now(),
      payload: original,
    });

    const sent = JSON.parse(ws.sent[ws.sent.length - 1]!) as {
      type: string;
      payload: { to?: string; ciphertext?: string; nonce?: string; rpcId?: string; method?: string };
    };
    expect(sent.type).toBe("relay.route");
    expect(sent.payload.to).toBe("device-1");
    expect(sent.payload.rpcId).toBeUndefined();
    expect(sent.payload.method).toBeUndefined();
    expect(Object.keys(sent.payload).sort()).toEqual(["ciphertext", "nonce", "to"]);

    const consoleKeys = await deriveRelaySessionKeys(
      crypto,
      consolePair.privateKeyJwk,
      devicePair.publicKeyJwk,
    );
    await expect(
      openRelayPayload(crypto, consoleKeys.encKey, {
        ciphertext: sent.payload.ciphertext!,
        nonce: sent.payload.nonce!,
      }),
    ).resolves.toEqual(original);
  });

  it("requestPairCode sends relay.pair.code and resolves with the 6-digit code", async () => {
    const { client, ws } = await connectedClient();

    const p = client.requestPairCode();
    const sent = JSON.parse(ws.sent[2]!) as { type: string; from: string; to: string; id: string; payload?: unknown };
    expect(sent).toMatchObject({ type: "relay.pair.code", from: "console-c", to: "relay" });

    ws.recv(
      JSON.stringify({
        v: 1,
        type: "relay.pair.code.ack",
        id: sent.id,
        from: "relay",
        to: "console-c",
        ts: Date.now(),
        payload: { code: "483920", ttlMs: 600_000 },
      }),
    );

    await expect(p).resolves.toBe("483920");
  });

  it("requestPairCode rejects when relay answers with a bad code", async () => {
    const { client, ws } = await connectedClient();

    const p = client.requestPairCode();
    const sent = JSON.parse(ws.sent[2]!) as { id: string };
    ws.recv(
      JSON.stringify({
        v: 1,
        type: "relay.pair.code.ack",
        id: sent.id,
        from: "relay",
        to: "console-c",
        ts: Date.now(),
        payload: { code: "bad" },
      }),
    );

    await expect(p).rejects.toThrow(/missing code/);
  });

  it("auto-reconnects after an unexpected close (A3)", async () => {
    const client = new RelayClient({
      url: "ws://relay.example:4090",
      clientId: "console-c",
      kind: "console",
      wsImpl: FakeWs.fresh(),
      autoReconnect: true,
      reconnectBaseMs: 10,
      reconnectMaxMs: 20,
      heartbeatIntervalMs: 0,
    });
    const p = client.connect();
    const ws1 = FakeWs.instances[0]!;
    ws1.open();
    await vi.waitFor(() => expect(ws1.sent).toHaveLength(2));
    const register = JSON.parse(ws1.sent[1]!) as { id: string };
    ws1.recv(registerAck(register.id, "console-c", { credential: "c1", ttlMs: 900_000 }));
    await p;
    expect(client.isOnline()).toBe(true);

    // 意外断开 → 无需人工干预，退避后自动重连并重新注册成功。
    ws1.onclose?.();
    expect(client.isOnline()).toBe(false);
    await vi.waitFor(() => expect(FakeWs.instances.length).toBeGreaterThanOrEqual(2));
    const ws2 = FakeWs.instances[1]!;
    ws2.open();
    await vi.waitFor(() => expect(ws2.sent).toHaveLength(2));
    const register2 = JSON.parse(ws2.sent[1]!) as { id: string };
    ws2.recv(registerAck(register2.id, "console-c", { credential: "c2", ttlMs: 900_000 }));
    await vi.waitFor(() => expect(client.isOnline()).toBe(true));
    client.close();
  });

  it("close() suppresses auto-reconnect (user gave up)", async () => {
    const client = new RelayClient({
      url: "ws://relay.example:4090",
      clientId: "console-c",
      kind: "console",
      wsImpl: FakeWs.fresh(),
      autoReconnect: true,
      reconnectBaseMs: 10,
    });
    const p = client.connect();
    const ws = FakeWs.instances[0]!;
    ws.open();
    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));
    const register = JSON.parse(ws.sent[1]!) as { id: string };
    ws.recv(registerAck(register.id, "console-c", { credential: "c1", ttlMs: 900_000 }));
    await p;

    client.close();
    const instanceCount = FakeWs.instances.length;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 60));
    expect(FakeWs.instances.length).toBe(instanceCount);
    expect(client.isOnline()).toBe(false);
  });

  it("sends periodic heartbeats while online when autoReconnect is on", async () => {
    const client = new RelayClient({
      url: "ws://relay.example:4090",
      clientId: "console-c",
      kind: "console",
      wsImpl: FakeWs.fresh(),
      autoReconnect: true,
      heartbeatIntervalMs: 15,
    });
    const p = client.connect();
    const ws = FakeWs.instances[0]!;
    ws.open();
    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));
    const register = JSON.parse(ws.sent[1]!) as { id: string };
    ws.recv(registerAck(register.id, "console-c", { credential: "c1", ttlMs: 900_000 }));
    await p;

    await vi.waitFor(() => {
      const types = ws.sent.map((raw) => (JSON.parse(raw) as { type: string }).type);
      expect(types.filter((t) => t === "relay.heartbeat").length).toBeGreaterThan(0);
    });
    client.close();
  });

  it("does not reconnect by default (legacy behavior unchanged)", async () => {
    const client = new RelayClient({
      url: "ws://relay.example:4090",
      clientId: "console-c",
      kind: "console",
      wsImpl: FakeWs.fresh(),
    });
    const p = client.connect();
    const ws = FakeWs.instances[0]!;
    ws.open();
    await vi.waitFor(() => expect(ws.sent).toHaveLength(2));
    const register = JSON.parse(ws.sent[1]!) as { id: string };
    ws.recv(registerAck(register.id, "console-c", { credential: "c1", ttlMs: 900_000 }));
    await p;

    ws.onclose?.();
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 40));
    expect(FakeWs.instances.length).toBe(1);
  });
});
