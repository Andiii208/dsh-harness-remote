import { describe, expect, it } from "vitest";
import { createMockHarness } from "../src/index.js";
import { loadFixtureDir } from "../src/fixture-loader.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));

async function harnessWith(...names: string[]) {
  const fixtures = await loadFixtureDir(fixturesDir);
  const selected = fixtures.filter((f) =>
    names.some((n) => f.meta.describe && JSON.stringify(f).includes(n)),
  );
  return createMockHarness({ fixtures: selected.length > 0 ? selected : fixtures, port: 0 });
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
    await h.stop();
  });

  it("replays typert gateway paths (commands/execute)", async () => {
    const h = await harnessWith("chat");
    const res = await post(h.url, "/api/commands/execute", { rpcId: "r1", method: "commands/execute", payload: { input: "x" } });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ rpcId: "r1", ok: true, result: { accepted: true } });
    await h.stop();
  });

  it("returns ok:false NOT_FOUND for unmatched methods", async () => {
    const h = await harnessWith("sessions");
    const res = await post(h.url, "/api/session.get", { rpcId: "r1", method: "session.get", payload: {} });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    await h.stop();
  });

  it("records /api/respond payloads", async () => {
    const h = await harnessWith("approval");
    const res = await post(h.url, "/api/respond", { rpcId: "req-approve-1", result: { approved: true } });
    expect((await res.json()) as Record<string, unknown>).toMatchObject({ ok: true });
    expect(h.state.receivedResponds).toEqual([{ rpcId: "req-approve-1", result: { approved: true } }]);
    await h.stop();
  });

  it("GET /api/host.describe works", async () => {
    const h = await harnessWith("sessions");
    const res = await fetch(`${h.url}/api/host.describe`);
    expect((await res.json()) as Record<string, unknown>).toMatchObject({ ok: true, result: { name: "dsh" } });
    await h.stop();
  });
});

describe("ws-server", () => {
  it("pushes fixture frames per stream", async () => {
    const h = await harnessWith("sessions");
    const ws = new WebSocket(`${h.url.replace(/^http/, "ws")}/api/events.mux`);
    const frames: unknown[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.onmessage = (ev) => {
        frames.push(JSON.parse(String(ev.data)));
        if (frames.length >= 1) resolve();
      };
      ws.onerror = () => reject(new Error("ws error"));
      setTimeout(() => reject(new Error("timeout")), 3000);
    });
    expect(frames[0]).toMatchObject({ type: "session/projection", sessionId: "s1" });
    ws.close();
    await h.stop();
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
    expect(h.state.wsViolations).toBeGreaterThanOrEqual(1);
    await h.stop();
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
    await h.stop();
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
    const first = await Promise.race([
      it.next(),
      new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 3000)),
    ]);
    if (first !== "timeout") frames.push(first.value);

    const more: unknown[] = [];
    for (let i = 0; i < 2; i++) {
      const n = await Promise.race([
        it.next(),
        new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 3000)),
      ]);
      if (n === "timeout") break;
      more.push(n.value);
    }
    expect(frames.concat(more).length).toBeGreaterThanOrEqual(1);
    conn.close();
    await h.stop();
  });
});
