import { describe, expect, it } from "vitest";
import type { RemoteAccessHandle } from "../src/remote-access.js";
import { createRemoteAccessService } from "../src/remote-service.js";

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
});
