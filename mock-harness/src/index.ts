/**
 * createMockHarness — a real HTTP+WS server that mimics the DSH /api and
 * event streams, replaying conformance fixtures. No real harness needed.
 */

import { createServer, type Server } from "node:http";
import type { FixtureSet } from "@dsh-remote/capture";
import { createApiHandler, type ApiServerState } from "./api-server.js";
import { attachWs } from "./ws-server.js";

export interface MockHarnessOptions {
  fixtures: FixtureSet[];
  host?: string;
  /** 0 → ephemeral port. */
  port?: number;
}

export interface MockHarness {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Base URL like http://127.0.0.1:41234 (valid after start()). */
  url: string;
  host: string;
  port: number;
  state: ApiServerState;
}

export async function createMockHarness(opts: MockHarnessOptions): Promise<MockHarness> {
  const host = opts.host ?? "127.0.0.1";
  const state: ApiServerState = { receivedResponds: [], wsViolations: 0 };
  const api = createApiHandler(opts.fixtures, state);
  const server: Server = createServer((req, res) => {
    void api(req, res);
  });
  attachWs(server, opts.fixtures, state);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 0, host, () => resolve());
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("mock-harness: failed to bind");
  }

  const harness: MockHarness = {
    async start() {
      // already listening
    },
    async stop() {
      await new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
        // If no connections keep the server open, close may not fire — force it.
        setTimeout(resolve, 1000).unref();
      });
    },
    url: `http://${host}:${address.port}`,
    host,
    port: address.port,
    state,
  };
  return harness;
}
