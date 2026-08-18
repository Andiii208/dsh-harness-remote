/**
 * push + offline queue unit tests (M3.3).
 */

import { describe, expect, it } from "vitest";
import {
  createOfflineQueue,
  ExpoPushProvider,
  MockPushProvider,
  NoopPushProvider,
} from "../src/index.js";
import type { RelayEnvelope } from "@dsh-remote/protocol";

function routeEnv(id: string, ts: number): RelayEnvelope {
  return { v: 1, type: "relay.route", id, from: "a", to: "b", ts };
}

describe("push providers", () => {
  it("MockPushProvider records calls and consumes results in order", async () => {
    const push = new MockPushProvider({ results: ["sent", "failed"] });

    expect(await push.wake("c1", "t1")).toBe("sent");
    expect(await push.wake("c2")).toBe("failed");
    expect(await push.wake("c3", "t3")).toBe("sent");

    expect(push.calls).toEqual([
      { clientId: "c1", pushToken: "t1" },
      { clientId: "c2" },
      { clientId: "c3", pushToken: "t3" },
    ]);
  });

  it("MockPushProvider failNext fails exactly once and then recovers", async () => {
    const push = new MockPushProvider({ failNext: true });
    expect(await push.wake("c1", "t1")).toBe("failed");
    expect(await push.wake("c2", "t2")).toBe("sent");
  });

  it("NoopPushProvider always returns skipped", async () => {
    const push = new NoopPushProvider();
    expect(await push.wake("c1", "t1")).toBe("skipped");
  });

  it("ExpoPushProvider sends a wake notification and reports sent", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const push = new ExpoPushProvider({
      endpoint: "https://push.test/send",
      accessToken: "tok",
      fetchImpl: (async (url, init) => {
        calls.push({ url: String(url), init: init as RequestInit });
        return new Response(JSON.stringify({ data: [{ status: "ok" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as typeof fetch,
    });
    expect(await push.wake("c1", "ExponentPushToken[abc]")).toBe("sent");
    expect(calls[0]?.url).toBe("https://push.test/send");
    const body = JSON.parse(String(calls[0]?.init.body)) as { to: string; data: { clientId: string } };
    expect(body.to).toBe("ExponentPushToken[abc]");
    expect(body.data.clientId).toBe("c1");
  });

  it("ExpoPushProvider skips without a token", async () => {
    const push = new ExpoPushProvider({ fetchImpl: async () => new Response("{}", { status: 200 }) as Response });
    expect(await push.wake("c1")).toBe("skipped");
  });

  it("ExpoPushProvider reports failed on HTTP error or ticket error", async () => {
    const push = new ExpoPushProvider({
      fetchImpl: async () => new Response("boom", { status: 500 }) as Response,
    });
    expect(await push.wake("c1", "t1")).toBe("failed");

    const ticketError = new ExpoPushProvider({
      fetchImpl: async () => new Response(JSON.stringify({ data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] }), { status: 200 }) as Response,
    });
    expect(await ticketError.wake("c2", "t2")).toBe("failed");
  });
});

describe("createOfflineQueue", () => {
  it("drains live envelopes FIFO and removes the peer queue", () => {
    const q = createOfflineQueue();
    const e1 = routeEnv("e1", Date.now());
    const e2 = routeEnv("e2", Date.now());

    expect(q.enqueue("b", e1)).toEqual({ queued: true, dropped: false });
    expect(q.enqueue("b", e2)).toEqual({ queued: true, dropped: false });
    expect(q.drain("b")).toEqual([e1, e2]);
    expect(q.drain("b")).toEqual([]);
  });

  it("rejects expired envelopes on enqueue", () => {
    const q = createOfflineQueue({ now: () => 1_000 });
    const expired = routeEnv("e1", 1_000 - 120_001); // older than default 2 min TTL
    expect(q.enqueue("b", expired)).toEqual({ queued: false, dropped: true });
    expect(q.drain("b")).toEqual([]);
  });

  it("expire removes only expired envelopes and returns the count", () => {
    let now = 1_000;
    const q = createOfflineQueue({ ttlMs: 100, now: () => now });
    q.enqueue("b", routeEnv("old", 950)); // expires at 1050, dead when now=1100
    q.enqueue("b", routeEnv("live", 1_050));

    now = 1_100;
    const removed = q.expire();
    expect(removed).toBe(1);
    expect(q.drain("b")).toEqual([routeEnv("live", 1_050)]);
  });
});
