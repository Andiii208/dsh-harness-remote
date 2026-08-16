/**
 * createMockHarness — a real HTTP+WS server that mimics the DSH /api and
 * event streams, replaying conformance fixtures. No real harness needed.
 *
 * Contract (per design): createMockHarness(fixtures, opts) →
 *   { start(), stop(), url, receivedResponds, wsClients }
 */

import { createServer, type Server } from "node:http";
import type { WebSocket } from "ws";
import type { FixtureSet } from "@dsh-remote/capture";
import { createApiHandler, type ApiServerState } from "./api-server.js";
import { attachWs } from "./ws-server.js";

export interface MockHarnessOptions {
  host?: string;
  /** 0 → ephemeral port. */
  port?: number;
  /** 配置后启用配对围栏模拟（HTTP Authorization 头 + WS ?pairToken=）；回环豁免。 */
  pairToken?: string;
  /** 测试旋钮：true 时回环也强制配对。 */
  enforcePairing?: boolean;
}

export interface MockHarness {
  /** Bind and start listening (idempotent). */
  start(): Promise<void>;
  /** Close the server and all client connections. */
  stop(): Promise<void>;
  /** Base URL like http://127.0.0.1:41234 (valid after start()). */
  url: string;
  host: string;
  port: number;
  /** client-responses received via /api/respond. */
  receivedResponds: Array<{ rpcId: string; result: unknown }>;
  /** live WebSocket clients connected to events.mux / events.host. */
  wsClients: WebSocket[];
}

export async function createMockHarness(
  fixtures: FixtureSet[],
  opts: MockHarnessOptions = {},
): Promise<MockHarness> {
  const host = opts.host ?? "127.0.0.1";
  const state: ApiServerState = { receivedResponds: [], wsViolations: 0 };
  const api = createApiHandler(fixtures, state, {
    pairToken: opts.pairToken,
    enforcePairing: opts.enforcePairing,
  });
  const server: Server = createServer((req, res) => {
    void api(req, res);
  });
  const wsClients: WebSocket[] = [];
  attachWs(server, fixtures, state, wsClients, {
    pairToken: opts.pairToken,
    enforcePairing: opts.enforcePairing,
  });

  let started = false;
  const harness: MockHarness = {
    url: "",
    host,
    port: 0,
    receivedResponds: state.receivedResponds,
    wsClients,
    async start() {
      if (started) return;
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(opts.port ?? 0, host, () => resolve());
      });
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("mock-harness: failed to bind");
      }
      harness.url = `http://${host}:${address.port}`;
      harness.port = address.port;
      started = true;
    },
    async stop() {
      if (!started) return;
      for (const ws of wsClients) ws.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        // If keep-alive connections block close, force-resolve after a tick.
        setTimeout(resolve, 1000).unref();
      });
      started = false;
    },
  };
  return harness;
}
