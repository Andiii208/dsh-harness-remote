/**
 * api-server — DSH /api surface replaying fixture unary responses.
 * Invariant #2: HTTP status is only a carrier; business failures arrive as
 * ok:false + typed error code inside the envelope.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { FixtureSet, UnaryFixture } from "@dsh-remote/capture";

export interface ApiServerState {
  receivedResponds: Array<{ rpcId: string; result: unknown }>;
  wsViolations: number;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw.length === 0) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, body: unknown, status = 200): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** Match a unary fixture by method (payload matching is lenient: skip if absent). */
function matchUnary(fixtures: FixtureSet[], method: string): UnaryFixture | undefined {
  for (const f of fixtures) {
    const hit = f.unaryResponses.find((u) => u.method === method);
    if (hit) return hit;
  }
  return undefined;
}

export interface ApiRequest {
  rpcId?: string;
  method?: string;
  result?: unknown;
  payload?: unknown;
  [k: string]: unknown;
}

export function createApiHandler(fixtures: FixtureSet[], state: ApiServerState) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (req.method === "GET" && path === "/api/host.describe") {
      const describe = fixtures[0]?.meta.describe ?? { name: "mock-harness", version: "0.1.0-rc.5" };
      sendJson(res, { rpcId: "get", ok: true, result: describe });
      return;
    }

    if (req.method !== "POST" || !path.startsWith("/api/")) {
      res.writeHead(404);
      res.end("not found");
      return;
    }

    const body = (await readBody(req)) as ApiRequest;
    const rpcId = typeof body.rpcId === "string" ? body.rpcId : "unknown";

    // /api/respond — client-response to a server-request.
    if (path === "/api/respond") {
      state.receivedResponds.push({ rpcId, result: body.result });
      sendJson(res, { rpcId, ok: true, result: null });
      return;
    }

    // /api/<method> or typert /api/<namespace>/<method>.
    const method = path.slice("/api/".length);
    const fixture = matchUnary(fixtures, method);
    if (!fixture) {
      sendJson(res, {
        rpcId,
        ok: false,
        error: { code: "NOT_FOUND", message: `no fixture for method ${method}` },
      });
      return;
    }

    if (fixture.response.ok === true) {
      sendJson(res, { rpcId, ok: true, result: fixture.response.result });
    } else {
      sendJson(res, { rpcId, ok: false, error: fixture.response.error });
    }
  };
}
