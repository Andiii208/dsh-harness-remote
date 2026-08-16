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

export class RpcClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly token?: string;

  constructor(opts: RpcClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.token = opts.token;
  }

  /** POST /api/<method> — unary call. */
  async unary(method: string, payload: unknown): Promise<RpcResult> {
    const rpcId = makeRpcId();
    const envelope: ClientRequest = { rpcId, method, payload };
    return this.post(`/api/${method}`, envelope);
  }

  /** POST /api/respond — answer a server-request (approval / question). */
  async respond(rpcId: string, result: unknown): Promise<void> {
    const body = { rpcId, result };
    await this.post("/api/respond", body);
  }

  /** POST /api/<namespace>/<method> — typert gateway (commands/*, goals/*, …). */
  async call(namespace: string, method: string, payload: unknown): Promise<RpcResult> {
    const rpcId = makeRpcId();
    const body = { rpcId, method, payload };
    return this.post(`/api/${namespace}/${method}`, body);
  }

  private async post(path: string, body: { rpcId: string }): Promise<RpcResult> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(this.baseUrl + path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new RpcError("TIMEOUT", `request timed out after ${this.timeoutMs}ms`);
      }
      throw new RpcError("NETWORK", `request failed: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch {
      // Non-JSON body: HTTP status is only a carrier — surface as typed error.
      throw new RpcError(`HTTP_${res.status}`, `unexpected response (status ${res.status})`);
    }

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
}
