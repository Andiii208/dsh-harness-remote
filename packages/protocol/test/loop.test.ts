import { describe, expect, it, vi } from "vitest";
import { ConnectionLoop } from "../src/loop.js";
import type { Connection, ConnectionState, Transport } from "../src/transport.js";
import type { DownlinkFrame } from "../src/codec.js";

function makeFrames(count: number): AsyncIterable<DownlinkFrame> {
  return {
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < count; i++) {
        yield { type: "session/event" as const, sessionId: `s${i}` };
      }
    },
  };
}

function makeConnection(): Connection & { closed: boolean } {
  const c = {
    closed: false,
    async unary() {
      return { rpcId: "r", ok: true, result: {} };
    },
    async respond() {},
    events: makeFrames(1),
    close() {
      this.closed = true;
    },
  };
  return c;
}

function alwaysFailingTransport(): Transport {
  return {
    async connect() {
      throw new Error("connection refused");
    },
  };
}

function flakyTransport(failures: number): Transport & { connects: number } {
  const t = {
    connects: 0,
    async connect() {
      t.connects += 1;
      if (t.connects <= failures) throw new Error("refused");
      return makeConnection();
    },
  };
  return t;
}

describe("ConnectionLoop backoff", () => {
  it("grows backoff 500→1000→… capped at 10000ms, with jitter", async () => {
    const delays: number[] = [];
    const loop = new ConnectionLoop({
      endpoint: { host: "h", port: 3080 },
      transport: alwaysFailingTransport(),
      random: () => 0.5, // jitter factor 0 → delay = raw
      sleep: async (ms) => {
        delays.push(ms);
        await new Promise((r) => setTimeout(r, 0));
        if (delays.length >= 7) loop.stop();
      },
    });
    loop.start();
    await vi.waitFor(() => expect(delays.length).toBeGreaterThanOrEqual(7), { timeout: 3000 });
    expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 10000, 10000]);
  });

  it("resets backoff after a successful reconnect", async () => {
    const delays: number[] = [];
    const transport = flakyTransport(1);
    const loop = new ConnectionLoop({
      endpoint: { host: "h", port: 3080 },
      transport,
      random: () => 0.5,
      sleep: async (ms) => {
        delays.push(ms);
        await new Promise((r) => setTimeout(r, 0));
        if (delays.length >= 3) loop.stop();
      },
    });
    loop.start();
    await vi.waitFor(() => expect(delays.length).toBeGreaterThanOrEqual(3), { timeout: 3000 });
    // 1st failure → 500; success; disconnect → backoff resets to 500 again
    expect(delays.slice(0, 2)).toEqual([500, 500]);
    expect(transport.connects).toBeGreaterThanOrEqual(3);
  });
});

describe("ConnectionLoop states & resync", () => {
  it("emits connecting → online and calls onResync", async () => {
    const states: ConnectionState[] = [];
    let resyncs = 0;
    const transport = flakyTransport(0);
    const loop = new ConnectionLoop({
      endpoint: { host: "h", port: 3080 },
      transport,
      onStateChange: (s) => states.push(s),
      onResync: () => {
        resyncs += 1;
      },
      sleep: async () => {
        await new Promise((r) => setTimeout(r, 0));
      },
    });
    loop.start();
    await vi.waitFor(() => expect(states).toContain("online"), { timeout: 3000 });
    expect(resyncs).toBeGreaterThanOrEqual(1);
    expect(states).toEqual(expect.arrayContaining(["connecting", "online"]));
    loop.stop();
  });

  it("reconnects after the event stream ends (disconnect) and resyncs", async () => {
    const states: ConnectionState[] = [];
    const transport = flakyTransport(0);
    const loop = new ConnectionLoop({
      endpoint: { host: "h", port: 3080 },
      transport,
      onStateChange: (s) => states.push(s),
      sleep: async () => {
        await new Promise((r) => setTimeout(r, 0));
        if (transport.connects >= 2) loop.stop();
      },
    });
    loop.start();
    await vi.waitFor(() => expect(transport.connects).toBeGreaterThanOrEqual(2), { timeout: 3000 });
    expect(states).toEqual(expect.arrayContaining(["online", "offline", "backoff", "connecting"]));
  });

  it("start() is idempotent: second call does not spawn another loop", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let connects = 0;
    const transport: Transport = {
      async connect() {
        connects += 1;
        return {
          async unary() {
            return { rpcId: "r", ok: true, result: {} };
          },
          async respond() {},
          events: {
            async *[Symbol.asyncIterator]() {
              yield { type: "session/event" as const };
              await gate; // stream stays open
            },
          },
          close() {},
        };
      },
    };
    const loop = new ConnectionLoop({
      endpoint: { host: "h", port: 3080 },
      transport,
      sleep: async () => {
        await new Promise((r) => setTimeout(r, 0));
      },
    });
    loop.start();
    loop.start(); // second call must be a no-op
    loop.start();
    await vi.waitFor(() => expect(loop.connectionState).toBe("online"), { timeout: 3000 });
    expect(connects).toBe(1);
    loop.stop();
    release();
  });

  it("jitter bounds: delays stay within [0.875, 1.125] × raw", async () => {
    const delays: number[] = [];
    const mk = (rand: () => number) => {
      const loop = new ConnectionLoop({
        endpoint: { host: "h", port: 3080 },
        transport: alwaysFailingTransport(),
        random: rand,
        sleep: async (ms) => {
          delays.push(ms);
          loop.stop();
        },
      });
      return loop;
    };
    // random=0 → 500 * 0.875 = 437.5 → 438; random=1 → 500 * 1.125 = 562.5 → 563
    mk(() => 0).start();
    await vi.waitFor(() => expect(delays.length).toBe(1), { timeout: 3000 });
    const lowDelay = delays[0];
    delays.length = 0;
    mk(() => 1).start();
    await vi.waitFor(() => expect(delays.length).toBe(1), { timeout: 3000 });
    expect(lowDelay).toBe(438);
    expect(delays[0]).toBe(563);
  });

  it("emits onError when connect fails", async () => {
    const errors: unknown[] = [];
    const loop = new ConnectionLoop({
      endpoint: { host: "h", port: 3080 },
      transport: alwaysFailingTransport(),
      onError: (e) => {
        errors.push(e);
      },
      sleep: async () => {
        await new Promise((r) => setTimeout(r, 0));
        if (errors.length >= 1) loop.stop();
      },
    });
    loop.start();
    await vi.waitFor(() => expect(errors.length).toBeGreaterThanOrEqual(1), { timeout: 3000 });
    expect(errors[0]).toBeInstanceOf(Error);
  });
});

describe("ConnectionLoop states & resync", () => {
  it("releases the connection when the event stream ends", async () => {
    let closed = false;
    const transport: Transport = {
      async connect() {
        return {
          async unary() {
            return { rpcId: "r", ok: true, result: {} };
          },
          async respond() {},
          events: makeFrames(0), // stream ends immediately → connection released
          close() {
            closed = true;
          },
        };
      },
    };
    const loop = new ConnectionLoop({
      endpoint: { host: "h", port: 3080 },
      transport,
      sleep: async () => {
        await new Promise((r) => setTimeout(r, 0));
        loop.stop();
      },
    });
    loop.start();
    await vi.waitFor(() => expect(closed).toBe(true), { timeout: 3000 });
    expect(loop.connectionState).toBe("offline");
  });

  it("stop() closes the live connection while online", async () => {
    let closed = false;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const transport: Transport = {
      async connect() {
        return {
          async unary() {
            return { rpcId: "r", ok: true, result: {} };
          },
          async respond() {},
          events: {
            async *[Symbol.asyncIterator]() {
              yield { type: "session/event" as const };
              await gate; // stream stays open until released
            },
          },
          close() {
            closed = true;
          },
        };
      },
    };
    const loop = new ConnectionLoop({
      endpoint: { host: "h", port: 3080 },
      transport,
      sleep: async () => {
        await new Promise((r) => setTimeout(r, 0));
      },
    });
    loop.start();
    await vi.waitFor(() => expect(loop.connectionState).toBe("online"), { timeout: 3000 });
    loop.stop();
    release();
    expect(closed).toBe(true);
    expect(loop.connectionState).toBe("offline");
  });
});

describe("ConnectionLoop state accessor", () => {
  it("exposes connectionState", () => {
    const loop = new ConnectionLoop({
      endpoint: { host: "h", port: 3080 },
      transport: alwaysFailingTransport(),
    });
    expect(loop.connectionState).toBe("offline");
  });

  it("a second stop() resolves without deadlock after the first settles", async () => {
    const loop = new ConnectionLoop({
      endpoint: { host: "h", port: 3080 },
      transport: alwaysFailingTransport(),
      sleep: async () => {
        await new Promise((r) => setTimeout(r, 0));
      },
    });
    loop.start();
    await loop.stop(); // first stop：等 run() 退出并 settle
    await expect(loop.stop()).resolves.toBeUndefined(); // 二次 stop 不挂起
  });
});

describe("ConnectionLoop give-up", () => {
  it("stops retrying after maxAttempts and calls onGiveUp with the last error", async () => {
    let gaveUp = 0;
    let lastErr: unknown = null;
    const states: ConnectionState[] = [];
    const loop = new ConnectionLoop({
      endpoint: { host: "h", port: 3080 },
      transport: alwaysFailingTransport(),
      maxAttempts: 3,
      random: () => 0.5,
      onStateChange: (s) => states.push(s),
      onGiveUp: (err) => {
        gaveUp += 1;
        lastErr = err;
      },
      sleep: async () => {
        await new Promise((r) => setTimeout(r, 0));
      },
    });
    loop.start();
    await vi.waitFor(() => expect(gaveUp).toBe(1), { timeout: 3000 });
    expect(lastErr).toBeInstanceOf(Error);
    expect(loop.connectionState).toBe("offline");
    expect(loop.lastErrorResult()).toBe(lastErr);
    // give-up 后 stop() 立即结算，不挂起。
    await expect(loop.stop()).resolves.toBeUndefined();
  });

  it("start() can be called again after give-up", async () => {
    let gaveUp = 0;
    const transport = flakyTransport(3);
    const loop = new ConnectionLoop({
      endpoint: { host: "h", port: 3080 },
      transport,
      maxAttempts: 2,
      random: () => 0.5,
      onGiveUp: () => {
        gaveUp += 1;
      },
      sleep: async () => {
        await new Promise((r) => setTimeout(r, 0));
      },
    });
    loop.start();
    await vi.waitFor(() => expect(gaveUp).toBe(1), { timeout: 3000 });
    loop.start(); // 再次 start 应重新跑（flaky transport 第 3 次失败、第 4 次成功）
    await vi.waitFor(() => expect(transport.connects).toBeGreaterThanOrEqual(4), { timeout: 3000 });
    expect(loop.lastErrorResult()).toBeNull();
    loop.stop();
  });
});
