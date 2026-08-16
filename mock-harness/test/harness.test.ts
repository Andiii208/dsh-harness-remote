import { afterEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { createMockHarness, type MockHarness } from "../src/index.js";
import { loadFixtureDir } from "../src/fixture-loader.js";

const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));

const harnesses: MockHarness[] = [];
afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((h) => h.stop()));
});

/** Start a harness with only the fixtures whose file contains the given token. */
async function harnessWith(token: string): Promise<MockHarness> {
  const all = await loadFixtureDir(fixturesDir);
  const selected = all.filter((f) => JSON.stringify(f).includes(token));
  if (selected.length === 0) throw new Error(`no fixture matches ${token}`);
  const h = await createMockHarness(selected, { port: 0 });
  await h.start();
  harnesses.push(h);
  return h;
}

function post(base: string, path: string, body: unknown): Promise<Response> {
  return fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("api-server unary replay", () => {
  it("replays host.describe with rpcId echo", async () => {
    const h = await harnessWith("sessions");
    const res = await post(h.url, "/api/host.describe", { rpcId: "abc", method: "host.describe", payload: {} });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ rpcId: "abc", ok: true, result: { name: "dsh" } });
  });

  it("replays typert gateway paths (commands/execute)", async () => {
    const h = await harnessWith("commands/execute");
    const res = await post(h.url, "/api/commands/execute", { rpcId: "r1", method: "commands/execute", payload: { input: "x" } });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ rpcId: "r1", ok: true, result: { accepted: true } });
  });

  it("replays session.prompt (send-message path)", async () => {
    const h = await harnessWith("session.prompt");
    const res = await post(h.url, "/api/session.prompt", {
      rpcId: "r2",
      method: "session.prompt",
      payload: { sessionId: "s1", prompt: "继续" },
    });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ rpcId: "r2", ok: true, result: { accepted: true } });
  });

  it("returns ok:false NOT_FOUND for unmatched methods", async () => {
    const h = await harnessWith("sessions");
    const res = await post(h.url, "/api/session.get", { rpcId: "r1", method: "session.get", payload: {} });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("records /api/respond payloads (receivedResponds)", async () => {
    const h = await harnessWith("approval");
    const res = await post(h.url, "/api/respond", { rpcId: "req-approve-1", result: { approved: true } });
    expect((await res.json()) as Record<string, unknown>).toMatchObject({ ok: true });
    expect(h.receivedResponds).toEqual([{ rpcId: "req-approve-1", result: { approved: true } }]);
  });

  it("GET /api/host.describe works", async () => {
    const h = await harnessWith("sessions");
    const res = await fetch(`${h.url}/api/host.describe`);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({ ok: true, result: { name: "dsh" } });
  });
});

describe("ws-server", () => {
  it("pushes events.mux frames in fixture order (full chat sequence)", async () => {
    const h = await harnessWith("commands/execute");
    const ws = new WebSocket(`${h.url.replace(/^http/, "ws")}/api/events.mux`);
    const events: string[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.onmessage = (ev) => {
        const f = JSON.parse(String(ev.data)) as { event?: string };
        if (f.event) events.push(f.event);
        if (events.length >= 6) resolve();
      };
      ws.onerror = () => reject(new Error("ws error"));
      setTimeout(() => reject(new Error("timeout")), 3000);
    });
    expect(events).toEqual([
      "turn/start",
      "step/start",
      "message/delta",
      "message/delta",
      "message/complete",
      "turn/complete",
    ]);
    ws.close();
  });

  it("pushes events.host frames (session/registry)", async () => {
    const h = await harnessWith("sessions");
    const ws = new WebSocket(`${h.url.replace(/^http/, "ws")}/api/events.host`);
    const frames: unknown[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.onmessage = (ev) => {
        frames.push(JSON.parse(String(ev.data)));
        if (frames.length >= 2) resolve();
      };
      ws.onerror = () => reject(new Error("ws error"));
      setTimeout(() => reject(new Error("timeout")), 3000);
    });
    expect(frames[0]).toMatchObject({ type: "session/registry", action: "added", sessionId: "s1" });
    expect(frames[1]).toMatchObject({ type: "session/registry", action: "added", sessionId: "s2" });
    ws.close();
  });

  it("closes with 1008 when the client sends (downlink-only)", async () => {
    const h = await harnessWith("sessions");
    const ws = new WebSocket(`${h.url.replace(/^http/, "ws")}/api/events.host`);
    const closeInfo = await new Promise<{ code: number; reason: string }>((resolve) => {
      ws.onopen = () => ws.send("hi");
      ws.onclose = (ev) => resolve({ code: ev.code, reason: ev.reason });
      setTimeout(() => resolve({ code: -1, reason: "timeout" }), 3000);
    });
    expect(closeInfo.code).toBe(1008);
    ws.close();
  });

  it("tracks connected clients in wsClients", async () => {
    const h = await harnessWith("sessions");
    const ws = new WebSocket(`${h.url.replace(/^http/, "ws")}/api/events.mux`);
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });
    expect(h.wsClients.length).toBe(1);
    ws.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(h.wsClients.length).toBe(0);
  });

  it("disconnect scenario closes the stream after N frames", async () => {
    const h = await harnessWith("disconnect");
    const ws = new WebSocket(`${h.url.replace(/^http/, "ws")}/api/events.mux`);
    const frames: unknown[] = [];
    const closed = await new Promise<boolean>((resolve) => {
      ws.onmessage = (ev) => {
        frames.push(JSON.parse(String(ev.data)));
      };
      ws.onclose = () => resolve(true);
      setTimeout(() => resolve(false), 3000);
    });
    expect(closed).toBe(true);
    expect(frames.length).toBeGreaterThanOrEqual(2);
  });
});

describe("protocol integration", () => {
  it("LanTransport handshake + events against mock-harness", async () => {
    const h = await harnessWith("sessions");
    const { LanTransport } = await import("@dsh-remote/protocol");
    const conn = await new LanTransport().connect({ host: "127.0.0.1", port: h.port }, {});
    const describe = await conn.unary("host.describe", {});
    expect(describe).toMatchObject({ ok: true, result: { name: "dsh" } });

    const frames: unknown[] = [];
    const it = conn.events[Symbol.asyncIterator]();
    for (let i = 0; i < 3; i++) {
      const n = await Promise.race([
        it.next(),
        new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 3000)),
      ]);
      if (n === "timeout") break;
      frames.push(n.value);
    }
    expect(frames.length).toBeGreaterThanOrEqual(1);
    conn.close();
  });
});
