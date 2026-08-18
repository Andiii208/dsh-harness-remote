/**
 * Lenient codec — invariant #1: the online layer never crashes on unknown
 * data. Unknown keys are ignored; unknown envelope/frame types degrade to
 * Unknown*. Pure functions, idempotent, never throw on arbitrary input.
 */

import type {
  ClientRequest,
  ClientResponse,
  Envelope,
  RpcErrorInfo,
  ServerResponse,
  ServerRequest,
  UnknownEnvelope,
} from "./envelopes.js";
import { isKnownErrorCode } from "./dto/errors.js";

/** Downlink frame types (events.mux + events.host). */
export const KNOWN_FRAME_TYPES = [
  "session/event",
  "session/projection",
  "session/registry",
  "server/request",
  "queue/event",
  "task/event",
  "host/event",
  // Real DSH rc.7 mux/host frame types (kept as typed passthrough).
  "session/subscribed",
  "approval/requested",
  "approval/resolved",
  "question/requested",
  "question/resolved",
  "session/queue",
  "session/jobs",
  "host/session-added",
  "host/session-removed",
  "host/session-status",
  "host/agent-error",
  "host/workspace-changed",
  "host/workspace-removed",
  "host/workspace-order-changed",
  "host/archived-sessions-changed",
  "host/remote-event",
  "stream/error",
] as const;

export type KnownFrameType = (typeof KNOWN_FRAME_TYPES)[number];

/** Typed downlink frame: known fields kept, unknown fields pass through. */
export interface Frame<T extends string = string> {
  type: T;
  [key: string]: unknown;
}

/** Lenient fallback for unrecognized frame types. */
export interface UnknownFrame {
  type: "unknown";
  raw: Record<string, unknown>;
}

export type DownlinkFrame = Frame<KnownFrameType> | UnknownFrame;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeError(v: unknown): RpcErrorInfo {
  if (isRecord(v)) {
    const rawCode = typeof v.code === "string" ? v.code : undefined;
    // Unknown error codes degrade to UnknownError; the original code is
    // preserved in details.originalCode (lenient: never lose information).
    const unknown = rawCode !== undefined && !isKnownErrorCode(rawCode);
    const code = unknown ? "UnknownError" : (rawCode ?? "UnknownError");
    const details = unknown
      ? { ...(v.details !== undefined ? { raw: v.details } : {}), originalCode: rawCode }
      : v.details;
    return {
      code,
      message: typeof v.message === "string" ? v.message : "unknown error",
      ...(details !== undefined ? { details } : {}),
    };
  }
  return { code: "UnknownError", message: "unknown error", details: v };
}

function toUnknownEnvelope(v: Record<string, unknown>): UnknownEnvelope {
  return {
    ...(typeof v.rpcId === "string" ? { rpcId: v.rpcId } : {}),
    kind: "unknown",
    raw: v,
  };
}

/** Decode a real-DSH `server-response` envelope into the shared ServerResponse shape. */
function decodeDshServerResponse(
  input: Record<string, unknown>,
  rpcId: string,
): ServerResponse | null {
  const inner = isRecord(input.result) ? input.result : null;
  if (!inner) return null;
  if (inner.ok === true) {
    return { type: "server-response", rpcId, ok: true, result: inner.value };
  }
  if (inner.ok === false) {
    return {
      type: "server-response",
      rpcId,
      ok: false,
      error: normalizeError(inner.error),
    };
  }
  return null;
}

/**
 * Classify an arbitrary JSON value into an Envelope.
 * Discrimination order: explicit wire type → legacy (no-type) shapes.
 * Real DSH envelopes carry `type`; mock-harness fixtures historically omit it,
 * so both paths stay supported.
 */
export function decodeEnvelope(input: unknown): Envelope {
  if (!isRecord(input)) return toUnknownEnvelope({ raw: input });
  const rpcId = typeof input.rpcId === "string" ? input.rpcId : "";
  const type = typeof input.type === "string" ? input.type : undefined;

  if (type === "client-request" && typeof input.method === "string") {
    const e: ClientRequest = { type, rpcId, method: input.method, payload: input.payload };
    return e;
  }
  if (type === "server-response") {
    const d = decodeDshServerResponse(input, rpcId);
    if (d) return d;
  }
  if (type === "server-request") {
    const s: ServerRequest = {
      type,
      rpcId,
      // Real DSH uses `method` in the server-request slot; our legacy type uses
      // `kind`. Keep both available by mirroring method into kind when present.
      kind: typeof input.method === "string" ? input.method : (typeof input.kind === "string" ? input.kind : ""),
      payload: input.payload,
    };
    return s;
  }
  if (type === "client-response") {
    const c: ClientResponse = { type, rpcId, result: input.result };
    return c;
  }

  // Legacy envelopes without an explicit `type` (mock-harness / earlier fixtures).
  if (typeof input.method === "string") {
    const e: ClientRequest = { rpcId, method: input.method, payload: input.payload };
    return e;
  }
  if (typeof input.ok === "boolean") {
    const base = { rpcId };
    if (input.ok) {
      const s: ServerResponse = { ...base, ok: true as const, result: input.result };
      return s;
    }
    const s: ServerResponse = { ...base, ok: false as const, error: normalizeError(input.error) };
    return s;
  }
  if (typeof input.kind === "string" && input.kind === "unknown") {
    // Already degraded — return as-is (idempotent).
    return input as unknown as UnknownEnvelope;
  }
  if (typeof input.kind === "string") {
    const s: ServerRequest = { rpcId, kind: input.kind, payload: input.payload };
    return s;
  }
  if ("result" in input) {
    const base = { rpcId };
    const c: Envelope = { ...base, result: input.result };
    return c;
  }
  return toUnknownEnvelope(input);
}

/** Decode a downlink frame: known type → typed Frame; else UnknownFrame. */
export function decodeFrame(input: unknown): DownlinkFrame {
  if (isRecord(input) && typeof input.type === "string") {
    const t = input.type as string;
    if ((KNOWN_FRAME_TYPES as readonly string[]).includes(t)) {
      return { ...input, type: t as KnownFrameType };
    }
  }
  if (isRecord(input)) return { type: "unknown", raw: input };
  return { type: "unknown", raw: { raw: input } };
}

export { isRecord };
