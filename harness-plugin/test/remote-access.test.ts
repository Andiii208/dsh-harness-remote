import { describe, expect, it } from "vitest";
import { lanIp, startRemoteAccess } from "../src/remote-access.js";

describe("remote-access", () => {
  it("picks a LAN IPv4 address or falls back safely", () => {
    // 纯函数不应抛错；返回值要么是 IPv4 字符串，要么 undefined。
    const ip = lanIp();
    if (ip !== undefined) {
      expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    }
  });

  it("starts remote access, returns address/code/qr, and stops cleanly", async () => {
    const handle = await startRemoteAccess({ host: "127.0.0.1", port: 0 });
    try {
      expect(handle.port).toBeGreaterThan(0);
      expect(handle.url).toBe(`ws://127.0.0.1:${handle.port}`);
      expect(handle.code).toMatch(/^\d{6}$/);
      expect(handle.qrPayload).toContain("dshremote://remote?");
      expect(handle.qrPayload).toContain(`code=${handle.code}`);
    } finally {
      await handle.stop();
    }
  });
});
