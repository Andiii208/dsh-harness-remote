/**
 * ws-server — events.mux / events.host WebSocket endpoints that replay
 * fixture frames. Downlink only (invariant #3): any client message closes
 * the connection with code 1008 (mirroring real DSH behavior).
 */

import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { FixtureSet } from "@dsh-remote/capture";
import type { ApiServerState } from "./api-server.js";

const OPEN = WebSocket.OPEN;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function playStream(
  ws: WebSocket,
  stream: "mux" | "host",
  fixtures: FixtureSet[],
  state: ApiServerState,
): void {
  void (async () => {
    for (const fixture of fixtures) {
      const frames = fixture.wsFrames.filter((f) => f.stream === stream);
      for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (!f) continue;
        if (f.delayMs && f.delayMs > 0) await delay(f.delayMs);
        if (ws.readyState !== OPEN) return;
        ws.send(JSON.stringify(f.frame));
        // Scenario: disconnect after N frames.
        const scenario = fixture.scenarios?.find((s) => s.disconnectAfter === i + 1);
        if (scenario) {
          ws.close(1000, `scenario:${scenario.id}`);
          return;
        }
      }
    }
    // Stream stays open after the fixture is exhausted (like the real DSH).
  })();
}

export function attachWs(
  server: Server,
  fixtures: FixtureSet[],
  state: ApiServerState,
  wsClients: WebSocket[],
): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/events.mux" && url.pathname !== "/api/events.host") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wsClients.push(ws);
      ws.on("close", () => {
        const i = wsClients.indexOf(ws);
        if (i >= 0) wsClients.splice(i, 1);
      });
      ws.on("message", () => {
        // Downlink-only: the real DSH closes with 1008 on client sends.
        state.wsViolations += 1;
        ws.close(1008, "downlink-only");
      });
      const stream = url.pathname.endsWith("/api/events.mux") ? "mux" : "host";
      playStream(ws, stream, fixtures, state);
    });
  });
}
