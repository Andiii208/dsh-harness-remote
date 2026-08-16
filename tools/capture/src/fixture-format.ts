/**
 * Conformance fixture format (v1) — recorded real DSH traffic for replay by
 * mock-harness and protocol-drift regression.
 *
 * A fixture is a single JSON file:
 *   meta           — provenance (baseline version, recordedAt, source, describe)
 *   unaryResponses — POST /api/<method> responses to replay (rpcId echoed)
 *   wsFrames       — downlink frames from events.mux / events.host, in order
 *   scenarios      — optional disconnect/reconnect sequences
 *
 * Validation is lenient: unknown fields are ignored and preserved via `raw`;
 * type mismatches are reported as errors (never thrown).
 */

export interface FixtureMeta {
  /** DSH protocol baseline, e.g. "0.1.0-rc.5". */
  baselineVersion: string;
  /** ISO timestamp of the recording. */
  recordedAt: string;
  source?: {
    host?: string;
    port?: number;
  };
  /** host.describe result at record time. */
  describe?: unknown;
  [key: string]: unknown;
}

export interface UnaryFixture {
  method: string;
  /** Optional request-payload matcher (mock-harness may ignore). */
  requestPayload?: unknown;
  /** Response to replay: envelope body minus rpcId (echoed per request). */
  response:
    | { ok: true; result: unknown }
    | {
        ok: false;
        error: { code: string; message: string; details?: unknown };
      };
  [key: string]: unknown;
}

export interface WsFrameFixture {
  stream: "mux" | "host";
  /** The frame as received (JSON-decoded). */
  frame: unknown;
  /** Relative delay in ms before this frame is pushed (default 0). */
  delayMs?: number;
}

export interface DisconnectScenario {
  id: string;
  /** Close the stream after this many wsFrames have been pushed. */
  disconnectAfter?: number;
  /** Scenario-specific frames (appended after the main wsFrames). */
  frames?: WsFrameFixture[];
  [key: string]: unknown;
}

export interface FixtureSet {
  meta: FixtureMeta;
  unaryResponses: UnaryFixture[];
  wsFrames: WsFrameFixture[];
  scenarios?: DisconnectScenario[];
}

export type ValidationResult =
  | { ok: true; fixture: FixtureSet }
  | { ok: false; errors: string[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validate an arbitrary JSON value as a FixtureSet. Lenient: never throws. */
export function validateFixtureSet(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: ["fixture must be a JSON object"] };

  const meta = input.meta;
  if (!isRecord(meta)) {
    errors.push("meta: missing object");
  } else {
    if (typeof meta.baselineVersion !== "string") errors.push("meta.baselineVersion: expected string");
    if (typeof meta.recordedAt !== "string") errors.push("meta.recordedAt: expected string");
    if (meta.source !== undefined && !isRecord(meta.source)) errors.push("meta.source: expected object");
  }

  if (!Array.isArray(input.unaryResponses)) {
    errors.push("unaryResponses: expected array");
  } else {
    input.unaryResponses.forEach((u, i) => {
      if (!isRecord(u)) return errors.push(`unaryResponses[${i}]: expected object`);
      if (typeof u.method !== "string") errors.push(`unaryResponses[${i}].method: expected string`);
      const r = u.response;
      if (!isRecord(r) || typeof r.ok !== "boolean") {
        errors.push(`unaryResponses[${i}].response: expected { ok: boolean, ... }`);
      } else if (r.ok === false && (!isRecord(r.error) || typeof r.error.code !== "string")) {
        errors.push(`unaryResponses[${i}].response.error: expected { code: string, ... }`);
      }
    });
  }

  if (!Array.isArray(input.wsFrames)) {
    errors.push("wsFrames: expected array");
  } else {
    input.wsFrames.forEach((w, i) => {
      if (!isRecord(w)) return errors.push(`wsFrames[${i}]: expected object`);
      if (w.stream !== "mux" && w.stream !== "host") {
        errors.push(`wsFrames[${i}].stream: expected "mux" | "host"`);
      }
      if (!("frame" in w)) errors.push(`wsFrames[${i}].frame: missing`);
      if (w.delayMs !== undefined && typeof w.delayMs !== "number") {
        errors.push(`wsFrames[${i}].delayMs: expected number`);
      }
    });
  }

  if (input.scenarios !== undefined) {
    if (!Array.isArray(input.scenarios)) {
      errors.push("scenarios: expected array");
    } else {
      input.scenarios.forEach((s, i) => {
        if (!isRecord(s) || typeof s.id !== "string") {
          errors.push(`scenarios[${i}].id: expected string`);
        }
        if (s.disconnectAfter !== undefined && typeof s.disconnectAfter !== "number") {
          errors.push(`scenarios[${i}].disconnectAfter: expected number`);
        }
        if (s.frames !== undefined && !Array.isArray(s.frames)) {
          errors.push(`scenarios[${i}].frames: expected array`);
        }
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, fixture: input as unknown as FixtureSet };
}

/** Serialize a fixture set with stable key order. */
export function serializeFixture(f: FixtureSet): string {
  return JSON.stringify(f, null, 2) + "\n";
}

/** Suggest a file name for a new recording. */
export function fixtureFileName(recordedAt = new Date()): string {
  const stamp = recordedAt.toISOString().replace(/[:.]/g, "-");
  return `capture-${stamp}.fixture.json`;
}
