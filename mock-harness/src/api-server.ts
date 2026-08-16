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

export interface ApiServerOptions {
  /** 配置后启用配对围栏：所有 /api POST 必须携带匹配的配对 token。 */
  pairToken?: string;
}

/** 从请求头提取配对 token（Authorization: Bearer 或 x-dsh-pair-token）。 */
export function extractPairToken(headers: Record<string, string | string[] | undefined>): string | undefined {
  let raw: string | undefined;
  for (const [key, value] of Object.entries(headers)) {
    const lk = key.toLowerCase();
    if (lk === "authorization" || lk === "x-dsh-pair-token") {
      raw = Array.isArray(value) ? value[0] : value;
      break;
    }
  }
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) return trimmed.slice("bearer ".length).trim();
  return trimmed;
}

export function createApiHandler(
  fixtures: FixtureSet[],
  state: ApiServerState,
  opts: ApiServerOptions = {},
) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    if (req.method === "GET" && path === "/api/host.describe") {
      const describe = fixtures[0]?.meta.describe ?? { name: "mock-harness", version: "0.1.0-rc.5" };
      sendJson(res, { rpcId: "", ok: true, result: describe });
      return;
    }

    if (req.method !== "POST" || !path.startsWith("/api/")) {
      res.writeHead(404);
      res.end("not found");
      return;
    }

    const body = (await readBody(req)) as ApiRequest;
    const rpcId = typeof body.rpcId === "string" ? body.rpcId : "unknown";

    // 配对围栏（M2 模拟）：配置了 pairToken 时，非回环语义下所有调用必须带 token
    if (opts.pairToken) {
      const provided = extractPairToken(req.headers);
      if (provided !== opts.pairToken) {
        sendJson(res, {
          rpcId,
          ok: false,
          error: { code: "UNAUTHORIZED", message: "invalid or missing pairing token" },
        });
        return;
      }
    }

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
