import { describe, expect, it } from "vitest";
import {
  KeepaliveScheduler,
  KEEPALIVE_TASK,
  shouldReconnect,
  type BackgroundTaskApi,
} from "../src/notify/keepalive";

describe("shouldReconnect", () => {
  const now = 1_000_000;
  it("triggers when offline beyond threshold", () => {
    expect(shouldReconnect("offline", now - 300_000, now, 300_000)).toBe(true);
  });
  it("triggers when backoff beyond threshold", () => {
    expect(shouldReconnect("backoff", now - 301_000, now, 300_000)).toBe(true);
  });
  it("does not trigger when online/connecting", () => {
    expect(shouldReconnect("online", now - 600_000, now, 300_000)).toBe(false);
    expect(shouldReconnect("connecting", now - 600_000, now, 300_000)).toBe(false);
  });
  it("does not trigger before the threshold", () => {
    expect(shouldReconnect("offline", now - 299_000, now, 300_000)).toBe(false);
  });
});

describe("KeepaliveScheduler (injected api)", () => {
  function stubApi(): BackgroundTaskApi & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      defineTask(name) {
        calls.push(`define:${name}`);
      },
      async registerTaskAsync(name) {
        calls.push(`register:${name}`);
      },
      async unregisterTaskAsync(name) {
        calls.push(`unregister:${name}`);
      },
    };
  }

  it("registers idempotently", async () => {
    const api = stubApi();
    const s = new KeepaliveScheduler(api, () => "online", () => {});
    await s.register(600_000);
    await s.register(600_000);
    expect(api.calls.filter((c) => c.startsWith("register:"))).toHaveLength(1);
  });

  it("triggers onReconnect when offline beyond threshold", async () => {
    const api = stubApi();
    let reconnects = 0;
    let t = 0;
    const s = new KeepaliveScheduler(api, () => "offline", () => {
      reconnects += 1;
    }, () => t, 60_000);
    s.markPing(); // t=0
    t = 61_000;
    await s.tick();
    expect(reconnects).toBe(1);
  });

  it("does not reconnect when online", async () => {
    const api = stubApi();
    let reconnects = 0;
    let t = 0;
    const s = new KeepaliveScheduler(api, () => "online", () => {
      reconnects += 1;
    }, () => t, 60_000);
    s.markPing();
    t = 120_000;
    await s.tick();
    expect(reconnects).toBe(0);
  });

  it("register failure is swallowed (no throw)", async () => {
    const api: BackgroundTaskApi = {
      defineTask() {},
      async registerTaskAsync() {
        throw new Error("native unavailable");
      },
      async unregisterTaskAsync() {
        return undefined;
      },
    };
    const s = new KeepaliveScheduler(api, () => "offline", () => {});
    await expect(s.register(60_000)).resolves.toBeUndefined();
  });

  it("unregister calls the api", async () => {
    const api = stubApi();
    const s = new KeepaliveScheduler(api, () => "online", () => {});
    await s.register(60_000);
    await s.unregister();
    expect(api.calls).toContain(`unregister:${KEEPALIVE_TASK}`);
  });
});
