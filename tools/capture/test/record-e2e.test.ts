/**
 * E2E: recordTraffic against a REAL local HTTP + WS server (native fetch and
 * native global WebSocket — no injected fakes). Exercises the ws:// URL
 * derivation and the real network path.
 */

import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { recordTraffic } from "../src/record.js";

interface Stub {
  server: Server;
  port: number;
  close(): Promise<void>;
}

const openStubs: Stub[] = [];
afterEach(async () => {
  await Promise.all(openStubs.splice(0).map((s) => s.close()));
});

async function startStub(): Promise<Stub> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (req.method === "POST" && url.pathname === "/api/host.describe") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          rpcId: "x",
          ok: true,
          result: { name: "dsh-stub", version: "0.1.0-rc.5" },
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/api/events.mux" || url.pathname === "/api/events.host") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        setTimeout(() => {
          ws.send(JSON.stringify({ type: "session/event", sessionId: "s1" }));
          ws.send(JSON.stringify({ type: "session/projection", sessionId: "s1" }));
        }, 30);
      });
    } else {
      socket.destroy();
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address();
  if (addr === null || typeof addr === "string") throw new Error("no port");
  const stub: Stub = {
    server,
    port: addr.port,
    close: () =>
      new Promise<void>((resolve) => {
        wss.close();
        server.close(() => resolve());
      }),
  };
  openStubs.push(stub);
  return stub;
}

describe("recordTraffic E2E (real server, native fetch/WebSocket)", () => {
  it("probes host.describe and collects frames from both streams", async () => {
    const stub = await startStub();
    const fixture = await recordTraffic({
      host: "127.0.0.1",
      port: stub.port,
      durationMs: 200,
    });

    expect(fixture.unaryResponses).toHaveLength(1);
    expect(fixture.unaryResponses[0]).toMatchObject({ method: "host.describe", response: { ok: true } });
    expect(fixture.meta.describe).toMatchObject({ name: "dsh-stub" });
    expect(fixture.meta.baselineVersion).toBe("0.1.0-rc.5");
    expect(fixture.meta.source).toMatchObject({ host: "127.0.0.1", port: stub.port });

    // Both streams should have delivered frames.
    const mux = fixture.wsFrames.filter((f) => f.stream === "mux");
    const host = fixture.wsFrames.filter((f) => f.stream === "host");
    expect(mux.length).toBeGreaterThanOrEqual(1);
    expect(host.length).toBeGreaterThanOrEqual(1);
    expect(fixture.wsFrames[0]?.frame).toMatchObject({ type: "session/event" });
  });
});
