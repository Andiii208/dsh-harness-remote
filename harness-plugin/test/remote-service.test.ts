import { describe, expect, it } from "vitest";
import type { RemoteAccessHandle } from "../src/remote-access.js";
import type { RemoteAccessOptions } from "../src/remote-access.js";
import type { RemotePersistedConfig } from "../src/persist.js";
import { createRemoteAccessService } from "../src/remote-service.js";

const TEST_JWK: JsonWebKey = { kty: "EC", crv: "P-256", x: "x1", y: "y1", d: "d1" };
const TEST_PEER_JWK: JsonWebKey = { kty: "EC", crv: "P-256", x: "p1", y: "p2" };

/** 确定性身份注入：让持久化断言不依赖 WebCrypto/时间戳。 */
function identityOverrides() {
  return {
    generateConsoleId: () => "console-test",
    generateEcdhPrivateJwk: async () => TEST_JWK,
  };
}

interface PersistRecord {
  enabled?: boolean;
  mode?: string;
  consoleId?: string;
  ecdhPrivateJwk?: JsonWebKey;
  ecdhPeerPublicJwk?: JsonWebKey;
}

function capturingPersist(readConfig: Record<string, unknown> | null = null) {
  const writes: Array<PersistRecord> = [];
  let current: Record<string, unknown> | null = readConfig ? { ...readConfig } : null;
  return {
    writes,
    persist: {
      read: (): RemotePersistedConfig | null => (current ? ({ ...current } as RemotePersistedConfig) : null),
      write: (config: RemotePersistedConfig): void => {
        current = { ...config } as Record<string, unknown>;
        writes.push({ ...config });
      },
    },
  };
}

function fakeHandle(overrides: Partial<RemoteAccessHandle> = {}): RemoteAccessHandle {
  return {
    host: "https://remote-1.trycloudflare.com",
    port: 4090,
    url: "wss://remote-1.trycloudflare.com",
    code: "123456",
    qrPayload: "dshremote://remote?addr=wss%3A%2F%2Fremote-1.trycloudflare.com&code=123456",
    dshUrl: "http://127.0.0.1:56734",
    mode: "tunnel",
    publicUrl: "https://remote-1.trycloudflare.com",
    stop: async () => {},
    ...overrides,
  };
}

describe("createRemoteAccessService", () => {
  it("start() runs and exposes a QR data URL, stop() clears", async () => {
    let stopped = false;
    const service = createRemoteAccessService({
      autoDetectDsh: false,
      startImpl: async () => fakeHandle({ stop: async () => { stopped = true; } }),
      qrDataUrlImpl: async (payload) => `data:image/png;base64,${payload.length}`,
    });

    const s = await service.start("tunnel");
    expect(s.running).toBe(true);
    expect(s.mode).toBe("tunnel");
    expect(s.code).toBe("123456");
    expect(s.qrDataUrl).toContain("data:image/png;base64,");
    expect(s.dshDetected).toBe(true);

    await service.stop();
    expect(stopped).toBe(true);
    expect(service.status().running).toBe(false);
    expect(service.status().code).toBeNull();
  });

  it("start() is idempotent for the same running mode", async () => {
    let starts = 0;
    const service = createRemoteAccessService({
      autoDetectDsh: false,
      startImpl: async () => {
        starts += 1;
        return fakeHandle();
      },
      qrDataUrlImpl: async () => "data:image/png;base64,x",
    });
    await service.start("tunnel");
    await service.start("tunnel");
    expect(starts).toBe(1);
  });

  it("start() records errors and rethrows", async () => {
    const service = createRemoteAccessService({
      autoDetectDsh: false,
      startImpl: async () => {
        throw new Error("公网隧道建立超时");
      },
      qrDataUrlImpl: async () => "data:image/png;base64,x",
    });
    await expect(service.start("tunnel")).rejects.toThrow("公网隧道建立超时");
    expect(service.status().running).toBe(false);
    expect(service.status().error).toContain("超时");
  });

  it("start() persists enabled+mode+identity when a persist impl is provided", async () => {
    const { writes, persist } = capturingPersist();
    const service = createRemoteAccessService({
      autoDetectDsh: false,
      startImpl: async () => fakeHandle({ mode: "lan" }),
      qrDataUrlImpl: async () => "data:image/png;base64,x",
      persist,
      ...identityOverrides(),
    });
    await service.start("lan");
    expect(writes).toEqual([
      { enabled: true, mode: "lan", consoleId: "console-test", ecdhPrivateJwk: TEST_JWK },
    ]);
  });

  it("start() reuses the persisted consoleId / ECDH key instead of regenerating (A2)", async () => {
    const persistedBefore = {
      enabled: true,
      mode: "lan",
      consoleId: "console-legacy",
      ecdhPrivateJwk: TEST_PEER_JWK,
    };
    const { writes, persist } = capturingPersist(persistedBefore);
    const seen: { opts: RemoteAccessOptions | null } = { opts: null };
    const service = createRemoteAccessService({
      autoDetectDsh: false,
      startImpl: async (opts) => {
        seen.opts = opts;
        return fakeHandle({ mode: "lan" });
      },
      qrDataUrlImpl: async () => "data:image/png;base64,x",
      persist,
    });
    await service.start("lan");
    expect(seen.opts?.consoleId).toBe("console-legacy");
    expect(seen.opts?.ecdhPrivateJwk).toEqual(TEST_PEER_JWK);
    // 不应再注入新的身份生成结果。
    expect(writes[0]).toMatchObject({ enabled: true, mode: "lan", consoleId: "console-legacy" });
  });

  it("forwards peerPublicKey from pairing into persistence while running", async () => {
    const { writes, persist } = capturingPersist();
    const captured: { opts: RemoteAccessOptions | null } = { opts: null };
    const service = createRemoteAccessService({
      autoDetectDsh: false,
      startImpl: async (opts) => {
        captured.opts = opts;
        return fakeHandle({ mode: "lan" });
      },
      qrDataUrlImpl: async () => "data:image/png;base64,x",
      persist,
      ...identityOverrides(),
    });
    await service.start("lan");
    expect(captured.opts).not.toBeNull();
    captured.opts?.onPaired?.({ deviceId: "relay-device-1", peerPublicKey: TEST_PEER_JWK });
    // 配对公钥即时落盘；运行中不得翻转 enabled。
    expect(writes.at(-1)).toMatchObject({
      enabled: true,
      mode: "lan",
      ecdhPeerPublicJwk: TEST_PEER_JWK,
      consoleId: "console-test",
    });
  });

  it("stop() persists enabled=false and keeps the last mode + identity", async () => {
    const { writes, persist } = capturingPersist();
    const service = createRemoteAccessService({
      autoDetectDsh: false,
      startImpl: async () => fakeHandle({ mode: "tunnel" }),
      qrDataUrlImpl: async () => "data:image/png;base64,x",
      persist,
      ...identityOverrides(),
    });
    await service.start("tunnel");
    await service.stop();
    expect(writes).toEqual([
      { enabled: true, mode: "tunnel", consoleId: "console-test", ecdhPrivateJwk: TEST_JWK },
      { enabled: false, mode: "tunnel", consoleId: "console-test", ecdhPrivateJwk: TEST_JWK },
    ]);
  });

  it("start() failure does not persist enabled=true", async () => {
    const writes: Array<{ enabled?: boolean; mode?: string }> = [];
    const service = createRemoteAccessService({
      autoDetectDsh: false,
      startImpl: async () => {
        throw new Error("tunnel down");
      },
      qrDataUrlImpl: async () => "data:image/png;base64,x",
      persist: {
        read: () => null,
        write: (c) => writes.push({ ...c }),
      },
    });
    await expect(service.start("tunnel")).rejects.toThrow("tunnel down");
    expect(writes).toEqual([]);
  });

  it("persist failures never break start/stop", async () => {
    const service = createRemoteAccessService({
      autoDetectDsh: false,
      startImpl: async () => fakeHandle(),
      qrDataUrlImpl: async () => "data:image/png;base64,x",
      persist: {
        read: () => null,
        write: () => {
          throw new Error("disk full");
        },
      },
    });
    await expect(service.start("tunnel")).resolves.toMatchObject({ running: true });
    await expect(service.stop()).resolves.toMatchObject({ running: false });
  });

  it("dispose() releases resources but never touches persisted config (A1)", async () => {
    let stopped = false;
    const writes: Array<Record<string, unknown>> = [];
    const service = createRemoteAccessService({
      autoDetectDsh: false,
      startImpl: async () => fakeHandle({ stop: async () => { stopped = true; } }),
      qrDataUrlImpl: async () => "data:image/png;base64,x",
      persist: {
        read: () => null,
        write: (c) => writes.push({ ...c }),
      },
      ...identityOverrides(),
    });
    await service.start("tunnel");
    await service.dispose();
    expect(stopped).toBe(true);
    expect(service.status().running).toBe(false);
    // 只有 start 写过一次；dispose 不得追加写入。
    expect(writes).toEqual([
      { enabled: true, mode: "tunnel", consoleId: "console-test", ecdhPrivateJwk: TEST_JWK },
    ]);
  });

  it("stop() after dispose still persists enabled=false exactly once", async () => {
    const { writes, persist } = capturingPersist();
    const service = createRemoteAccessService({
      autoDetectDsh: false,
      startImpl: async () => fakeHandle(),
      qrDataUrlImpl: async () => "data:image/png;base64,x",
      persist,
      ...identityOverrides(),
    });
    await service.start("tunnel");
    await service.dispose();
    await service.stop();
    expect(writes).toEqual([
      { enabled: true, mode: "tunnel", consoleId: "console-test", ecdhPrivateJwk: TEST_JWK },
      { enabled: false, mode: "tunnel", consoleId: "console-test", ecdhPrivateJwk: TEST_JWK },
    ]);
  });
});
