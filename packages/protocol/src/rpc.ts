/**
 * RpcClient — unary POST /api/<method>, POST /api/respond, and the typert
 * gateway POST /api/<namespace>/<method>. Invariant #2: HTTP status is only
 * a carrier; business failures arrive as ok:false + typed error code.
 */

import { decodeEnvelope } from "./codec.js";
import type { ClientRequest, RpcErrorInfo } from "./envelopes.js";
import { makeRpcId } from "./envelopes.js";

export interface RpcResult {
  rpcId: string;
  ok: boolean;
  result?: unknown;
  error?: RpcErrorInfo;
}

export class RpcError extends Error {
  readonly code: string;
  readonly details: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.details = details;
  }
}

export interface RpcClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** 配对 token（M2）→ 请求携带 Authorization: Bearer <token>。 */
  token?: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export class RpcClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly token?: string;

  constructor(opts: RpcClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    // 浏览器里 fetch 是 WebIDL 方法，脱离 window 接收者调用会抛
    // "Illegal invocation"——bind 到 globalThis 保留正确接收者。
    const impl = opts.fetchImpl ?? fetch;
    this.fetchImpl = impl.bind(globalThis) as typeof fetch;
    this.token = opts.token;
  }

  /** POST /api/<method> — unary call. */
  async unary(method: string, payload: unknown): Promise<RpcResult> {
    const rpcId = makeRpcId();
    const envelope: ClientRequest = { type: "client-request", rpcId, method, payload };
    return this.post(`/api/${method}`, envelope);
  }

  /**
   * POST /api/session.cancel — request the host to interrupt a live stream.
   * DSH rc.7 implements `session.cancel`; older fixtures used `session.interrupt`.
   * We target the real host method and keep legacy mock fixtures working by
   * falling back when the first call reports a missing method.
   */
  async interrupt(sessionId: string): Promise<RpcResult> {
    try {
      return await this.unary("session.cancel", { sessionId });
    } catch (err) {
      if (err instanceof RpcError && (err.code === "HTTP_404" || err.code === "NOT_FOUND")) {
        return this.unary("session.interrupt", { sessionId });
      }
      throw err;
    }
  }

  /** POST /api/respond — answer a server-request (approval / question). */
  async respond(rpcId: string, result: unknown): Promise<void> {
    const body = { type: "client-response" as const, rpcId, result };
    const data = await this.postRaw("/api/respond", body);
    const env = decodeEnvelope(data);
    if ("ok" in env && typeof env.ok === "boolean") {
      // Legacy mock response ({ rpcId, ok: true, result: null }).
      if (env.ok) return;
      const err = env.error ?? { code: "UnknownError", message: "unknown error" };
      throw new RpcError(err.code, err.message, err.details);
    }
    if (isRecord(data) && data.accepted === false) {
      const reason = typeof data.reason === "string" ? data.reason : "bad-response";
      throw new RpcError(
        reason.replace(/-/g, "_").toUpperCase(),
        `respond rejected: ${reason}`,
      );
    }
    if (isRecord(data) && data.accepted === true) return;
    throw new RpcError("BAD_RESPONSE", "response was not a respond receipt", data);
  }

  /** POST /api/<namespace>/<method> — typert gateway (commands/*, goals/*, …). */
  async call(namespace: string, method: string, payload: unknown): Promise<RpcResult> {
    const rpcId = makeRpcId();
    const body = { type: "client-request" as const, rpcId, method, payload };
    return this.post(`/api/${namespace}/${method}`, body);
  }

  private async post(path: string, body: { rpcId: string }): Promise<RpcResult> {
    const data = await this.postRaw(path, body);
    const env = decodeEnvelope(data);
    if ("ok" in env && typeof env.ok === "boolean") {
      if (env.rpcId !== body.rpcId) {
        throw new RpcError("RPC_ID_MISMATCH", "response rpcId does not echo the request rpcId", {
          expected: body.rpcId,
          got: env.rpcId,
        });
      }
      if (env.ok) return { rpcId: env.rpcId, ok: true, result: env.result };
      const err = env.error ?? { code: "UnknownError", message: "unknown error" };
      throw new RpcError(err.code, err.message, err.details);
    }
    // No server-response envelope — tolerate and degrade.
    throw new RpcError("BAD_RESPONSE", "response was not a server-response envelope", data);
  }

  private async postRaw(path: string, body: unknown): Promise<unknown> {
    // The timeout timer must cover the WHOLE exchange — fetch() resolving only
    // means headers arrived; a server that never finishes its body would
    // otherwise hang res.json() far past timeoutMs (audit 2026-08-23: a local
    // service stalled a probe for ~30s with a 1.5s timeout configured).
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.baseUrl + path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      try {
        return await res.json();
      } catch (err) {
        // Body-phase abort: headers arrived but the body did not finish in time.
        if (err instanceof Error && err.name === "AbortError") {
          throw new RpcError("TIMEOUT", `request timed out after ${this.timeoutMs}ms`);
        }
        // Non-JSON body: HTTP status is only a carrier — surface as typed error.
        throw new RpcError(`HTTP_${res.status}`, `unexpected response (status ${res.status})`);
      }
    } catch (err) {
      if (err instanceof RpcError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new RpcError("TIMEOUT", `request timed out after ${this.timeoutMs}ms`);
      }
      throw new RpcError("NETWORK", `request failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}
