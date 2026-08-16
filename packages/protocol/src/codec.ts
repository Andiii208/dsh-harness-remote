/**
 * Lenient codec — invariant #1: the online layer never crashes on unknown
 * data. Unknown keys are ignored; unknown envelope/frame types degrade to
 * Unknown*. Pure functions, idempotent, never throw on arbitrary input.
 */

import type {
  ClientRequest,
  Envelope,
  RpcErrorInfo,
  ServerResponse,
  ServerRequest,
  UnknownEnvelope,
} from "./envelopes.js";

/** Downlink frame types (events.mux + events.host). */
export const KNOWN_FRAME_TYPES = [
  "session/event",
  "session/projection",
  "session/registry",
  "server/request",
  "queue/event",
  "task/event",
  "host/event",
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
    return {
      code: typeof v.code === "string" ? v.code : "UnknownError",
      message: typeof v.message === "string" ? v.message : "unknown error",
      ...(v.details !== undefined ? { details: v.details } : {}),
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

/**
 * Classify an arbitrary JSON value into an Envelope.
 * Discrimination order: method → client-request; ok → server-response;
 * kind → server-request; result → client-response; else UnknownEnvelope.
 */
export function decodeEnvelope(input: unknown): Envelope {
  if (!isRecord(input)) return toUnknownEnvelope({ raw: input });
  const rpcId = typeof input.rpcId === "string" ? input.rpcId : "";

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
