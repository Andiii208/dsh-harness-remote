/**
 * DSH wire envelopes — all JSON, rpcId echoes back.
 * Pure TS, zero platform APIs (works in browser / RN / node).
 */

/** POST /api/<method> unary call. Real DSH carries `type: "client-request"`. */
export interface ClientRequest {
  type?: "client-request";
  rpcId: string;
  method: string;
  payload: unknown;
}

/** Typed business error carried inside a server-response (ok:false). */
export interface RpcErrorInfo {
  code: string;
  message: string;
  details?: unknown;
}

export interface ServerResponseOk {
  type?: "server-response";
  rpcId: string;
  ok: true;
  result: unknown;
}

export interface ServerResponseErr {
  type?: "server-response";
  rpcId: string;
  ok: false;
  error: RpcErrorInfo;
}

/** HTTP status is only a carrier; business failures arrive as ok:false. */
export type ServerResponse = ServerResponseOk | ServerResponseErr;

/** Server-initiated request (approval / question); answered via /api/respond. */
export interface ServerRequest {
  type?: "server-request";
  rpcId: string;
  kind: string;
  payload: unknown;
}

/** Answer to a server-request. Real DSH carries `type: "client-response"`. */
export interface ClientResponse {
  type?: "client-response";
  rpcId: string;
  result: unknown;
}

/** Lenient fallback: anything the codec cannot classify, passed through. */
export interface UnknownEnvelope {
  rpcId?: string;
  kind: "unknown";
  raw: Record<string, unknown>;
}

export type Envelope =
  | ClientRequest
  | ServerResponse
  | ServerRequest
  | ClientResponse
  | UnknownEnvelope;

export function isClientRequest(e: Envelope): e is ClientRequest {
  return "method" in e;
}

export function isServerResponse(e: Envelope): e is ServerResponse {
  return "ok" in e;
}

export function isServerRequest(e: Envelope): e is ServerRequest {
  return "kind" in e && !("ok" in e);
}

export function isClientResponse(e: Envelope): e is ClientResponse {
  return "result" in e && !("ok" in e) && !("kind" in e) && !("method" in e);
}

/**
 * Correlation id. Not cryptographically strong — rpcIds only correlate
 * request/response pairs; auth is out of scope for the envelope layer.
 */
export function makeRpcId(rand: () => number = Math.random): string {
  const stamp = Date.now().toString(36);
  const noise = Math.floor(rand() * 0xffffffff)
    .toString(36)
    .padStart(8, "0");
  return `${stamp}-${noise}`;
}
