/**
 * pipeline 装配测试：注入 mock Transport/Connection，断言状态流转、
 * 帧 → store、classifier 事件 → onNotification、stop 行为。
 */

import { describe, expect, it, vi } from "vitest";
import type { Connection, ConnectionState, DownlinkFrame, Transport } from "@dsh-remote/protocol";
import { createConnectionPipeline } from "../src/transport/pipeline.js";

class FeedableConnection implements Connection {
  private waiters: Array<(v: IteratorResult<DownlinkFrame>) => void> = [];
  private items: DownlinkFrame[] = [];
  private ended = false;
  closed = false;

  async unary(): Promise<{ rpcId: string; ok: boolean; result: unknown }> {
    return { rpcId: "r", ok: true, result: {} };
  }
  async respond(): Promise<void> {}

  events: AsyncIterable<DownlinkFrame> = {
    [Symbol.asyncIterator]: () => ({
      next: (): Promise<IteratorResult<DownlinkFrame>> => {
        const item = this.items.shift();
        if (item !== undefined) return Promise.resolve({ value: item, done: false });
        if (this.ended) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    }),
  };

  push(f: unknown): void {
    const frame = f as DownlinkFrame;
    const w = this.waiters.shift();
    if (w) w({ value: frame, done: false });
    else this.items.push(frame);
  }

  close(): void {
    this.closed = true;
  }
}

function makeTransport(conn: FeedableConnection): Transport & { connects: number } {
  const t = {
    connects: 0,
    async connect() {
      t.connects += 1;
      return conn;
    },
  };
  return t;
}

describe("createConnectionPipeline", () => {
  it("drives state connecting → online and folds frames into the store", async () => {
    const conn = new FeedableConnection();
    const transport = makeTransport(conn);
    const states: ConnectionState[] = [];
    const pipeline = createConnectionPipeline({
      endpoint: { host: "h", port: 3080 },
      transport,
      onStateChange: (s) => states.push(s),
    });

    pipeline.start();
    await vi.waitFor(() => expect(states).toContain("online"), { timeout: 3000 });
    expect(states).toEqual(expect.arrayContaining(["connecting", "online"]));

    conn.push({ type: "session/registry", action: "added", sessionId: "s1", title: "deploy" });
    await vi.waitFor(() => expect(pipeline.store.getSessions()).toHaveLength(1), { timeout: 3000 });
    expect(pipeline.store.getSessions()[0]).toMatchObject({ id: "s1", title: "deploy" });

    pipeline.stop();
  });

  it("routes classifier events to onNotification", async () => {
    const conn = new FeedableConnection();
    const notifications: unknown[] = [];
    const pipeline = createConnectionPipeline({
      endpoint: { host: "h", port: 3080 },
      transport: makeTransport(conn),
      onNotification: (n) => notifications.push(n),
    });
    pipeline.start();
    await new Promise((r) => setTimeout(r, 30));

    conn.push({
      type: "server/request",
      rpcId: "r2",
      kind: "approval",
      payload: { prompt: "run?" },
    });
    await vi.waitFor(() => expect(notifications.length).toBeGreaterThanOrEqual(1), { timeout: 3000 });
    expect(notifications[0]).toMatchObject({ kind: "approval-waiting", rpcId: "r2" });
    pipeline.stop();
  });

  it("stop() returns the loop to offline", async () => {
    const conn = new FeedableConnection();
    const pipeline = createConnectionPipeline({
      endpoint: { host: "h", port: 3080 },
      transport: makeTransport(conn),
    });
    pipeline.start();
    await vi.waitFor(() => expect(pipeline.loop.connectionState).toBe("online"), { timeout: 3000 });
    pipeline.stop();
    expect(pipeline.loop.connectionState).toBe("offline");
  });
});
