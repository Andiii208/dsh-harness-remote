/**
 * recordTraffic — connect to a live DSH, probe unary endpoints, collect
 * downlink WS frames for a duration, and produce a FixtureSet.
 * Uses platform fetch + WebSocket (Node ≥22 / browsers); both injectable.
 */

import {
  fixtureFileName,
  serializeFixture,
  type FixtureMeta,
  type FixtureSet,
  type UnaryFixture,
  type WsFrameFixture,
} from "./fixture-format.js";
import type { WsCtor, WsLike } from "./ws-lite.js";

export interface RecordOptions {
  host: string;
  port: number;
  /** Collection window in ms. */
  durationMs: number;
  /** Unary methods to probe before recording (default host.describe). */
  probes?: string[];
  /** Override base URL (tests). */
  baseUrl?: string;
  wsImpl?: WsCtor;
  fetchImpl?: typeof fetch;
}

export interface RecordResult {
  fixture: FixtureSet;
  file?: string;
  frameCount: number;
  probeCount: number;
}

export const DEFAULT_PROBES = ["host.describe"];

export class CaptureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureError";
  }
}

export async function recordTraffic(opts: RecordOptions): Promise<FixtureSet> {
  const baseUrl = (opts.baseUrl ?? `http://${opts.host}:${opts.port}`).replace(/\/+$/, "");
  const probes = opts.probes ?? DEFAULT_PROBES;
  const fetchImpl = opts.fetchImpl ?? fetch;

  // 1. Probes (unary).
  const unaryResponses: UnaryFixture[] = [];
  for (const method of probes) {
    let response: UnaryFixture["response"];
    try {
      const res = await fetchImpl(`${baseUrl}/api/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rpcId: "capture", method, payload: {} }),
      });
      const data: unknown = await res.json().catch(() => null);
      const env = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
      if (env.ok === false) {
        const err = env.error as Record<string, unknown> | undefined;
        response = {
          ok: false,
          error: {
            code: typeof err?.code === "string" ? err.code : "UnknownError",
            message: typeof err?.message === "string" ? err.message : "unknown error",
            ...(err?.details !== undefined ? { details: err.details } : {}),
          },
        };
      } else {
        response = { ok: true, result: env.result ?? data };
      }
    } catch (err) {
      throw new CaptureError(`probe ${method} failed: ${(err as Error).message}`);
    }
    unaryResponses.push({ method, response });
  }

  // 2. WS collection window.
  const frames: WsFrameFixture[] = [];
  const collected: Array<{ stream: "mux" | "host"; frame: unknown }> = [];
  const sockets: WsLike[] = [];
  const ctor = opts.wsImpl ?? (globalThis as { WebSocket?: WsCtor }).WebSocket;
  if (!ctor) throw new CaptureError("no WebSocket implementation available");

  const openStream = (stream: "mux" | "host") => {
    const ws = new ctor(`${baseUrl.replace(/^http/, "ws")}/api/events.${stream}`);
    ws.onmessage = (ev) => {
      const data = ev.data;
      const text = typeof data === "string" ? data : data instanceof Blob ? null : String(data);
      if (text === null) return; // Blob path skipped in capture v1
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* keep raw string — lenient */
      }
      collected.push({ stream, frame: parsed });
    };
    ws.onerror = () => {
      /* surfaced via onclose */
    };
    sockets.push(ws);
  };
  openStream("mux");
  openStream("host");

  await new Promise<void>((resolve) => setTimeout(resolve, opts.durationMs));
  for (const s of sockets) s.close();

  for (const c of collected) frames.push({ stream: c.stream, frame: c.frame });

  // 3. Assemble fixture.
  const describeProbe = unaryResponses.find((u) => u.method === "host.describe");
  const describe =
    describeProbe && describeProbe.response.ok === true ? describeProbe.response.result : undefined;
  const meta: FixtureMeta = {
    baselineVersion:
      (describe as { version?: string } | undefined)?.version ?? "0.1.0-rc.5",
    recordedAt: new Date().toISOString(),
    source: { host: opts.host, port: opts.port },
    ...(describe !== undefined ? { describe } : {}),
  };

  return {
    meta,
    unaryResponses,
    wsFrames: frames,
    scenarios: [],
  };
}

/** Record and write to a .fixture.json file under outDir. */
export async function recordToFile(
  opts: RecordOptions,
  outDir: string,
): Promise<RecordResult> {
  const fixture = await recordTraffic(opts);
  const file = `${outDir.replace(/[\\/]+$/, "")}/${fixtureFileName()}`;
  await import("node:fs/promises").then((fs) => fs.writeFile(file, serializeFixture(fixture), "utf8"));
  return { fixture, file, frameCount: fixture.wsFrames.length, probeCount: fixture.unaryResponses.length };
}
