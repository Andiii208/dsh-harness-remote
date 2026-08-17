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
    expect(ws.sent).toHaveLength(2);

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
});
