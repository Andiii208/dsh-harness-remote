import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it } from "vitest";
import { lanIp, startRemoteAccess } from "../src/remote-access.js";

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  kill(): boolean {
    this.killed = true;
    return true;
  }
}

describe("remote-access", () => {
  it("picks a LAN IPv4 address or falls back safely", () => {
    const ip = lanIp();
    if (ip !== undefined) {
      expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    }
  });

  it("starts LAN mode, returns address/code/qr, and stops cleanly", async () => {
    const handle = await startRemoteAccess({ mode: "lan", host: "127.0.0.1", port: 0 });
    try {
      expect(handle.mode).toBe("lan");
      expect(handle.publicUrl).toBeNull();
      expect(handle.port).toBeGreaterThan(0);
      expect(handle.url).toBe(`ws://127.0.0.1:${handle.port}`);
      expect(handle.code).toMatch(/^\d{6}$/);
      expect(handle.qrPayload).toContain("dshremote://remote?");
      expect(handle.qrPayload).toContain(`code=${handle.code}`);
      expect(handle.qrPayload).toContain(`port=${handle.port}`);
    } finally {
      await handle.stop();
    }
  });

  it("starts tunnel mode and returns a wss:// public URL", async () => {
    const child = new FakeChild();
    const promise = startRemoteAccess({
      mode: "tunnel",
      port: 0,
      autoDetectDsh: false,
      cloudflaredBin: process.execPath,
      tunnelSpawnImpl: () => child as unknown as ChildProcess,
    });
    // 等 startRemoteAccess 完成 relay/console 握手并给 fake child 挂上 stdout 监听后再吐 URL。
    setTimeout(() => {
      child.stdout.emit("data", Buffer.from("INF |  https://remote-42.trycloudflare.com\n"));
    }, 300);
    const handle = await promise;
    try {
      expect(handle.mode).toBe("tunnel");
      expect(handle.publicUrl).toBe("https://remote-42.trycloudflare.com");
      expect(handle.url).toBe("wss://remote-42.trycloudflare.com");
      expect(handle.qrPayload).toContain("addr=wss%3A%2F%2Fremote-42.trycloudflare.com");
      expect(handle.qrPayload).toContain(`code=${handle.code}`);
    } finally {
      await handle.stop();
    }
    expect(child.killed).toBe(true);
  }, 10000);
});
