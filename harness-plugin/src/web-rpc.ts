/**
 * web-rpc.ts — 设置页 ⇄ 宿主插件的 loopback RPC 通道。
 *
 * 对齐 DSH rpcErrorSchema：成功 `{ok:true,value}`；失败
 * `{ok:false,error:{code:'cancelled'|'bad-request',...}}`。
 * 配对码/公网地址只经 loopback 通道返回给本机设置页。
 */

import type { RemoteAccessService } from "./remote-service.js";

export const REMOTE_RPC_CHANNEL = "dsh-harness-remote";

export const REMOTE_RPC_ENDPOINTS = Object.freeze({
  status: "status",
  start: "start",
  stop: "stop",
});

export interface RemoteRpcContext {
  connection?: {
    rpc?: {
      handle?: (
        channel: string,
        handler: (endpoint: string, payload: Record<string, unknown>, signal?: { aborted?: boolean }) => Promise<unknown>,
        opts?: { authority?: string },
      ) => () => void;
    };
  };
  logger?: (name: string) => { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };
}

function ok(value: unknown) {
  return { ok: true, value };
}

function fail(code: "cancelled" | "bad-request", message: string) {
  if (code === "cancelled") return { ok: false, error: { code, message, details: {} } };
  return { ok: false, error: { code, message, details: { issues: [{ message }] } } };
}

/** 注册 /dsh-harness-remote 逻辑通道（仅本机 loopback 可调）。返回 dispose 函数。 */
export function installRemoteRpc(ctx: RemoteRpcContext, service: RemoteAccessService, logger?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void }): () => void {
  if (!ctx?.connection?.rpc?.handle) {
    logger?.warn?.("dsh-harness-remote: DSH Host Connection RPC unavailable — settings tab disabled | 无 Connection RPC，设置页不可用");
    return () => {};
  }

  return ctx.connection.rpc.handle(
    REMOTE_RPC_CHANNEL,
    async (endpoint, payload = {}, signal) => {
      if (signal?.aborted) return fail("cancelled", "The request was cancelled.");
      try {
        switch (endpoint) {
          case REMOTE_RPC_ENDPOINTS.status:
            return ok(service.status());
          case REMOTE_RPC_ENDPOINTS.start: {
            const mode = payload?.mode === "lan" ? "lan" : "tunnel";
            return ok(await service.start(mode));
          }
          case REMOTE_RPC_ENDPOINTS.stop:
            return ok(await service.stop());
          default:
            return fail("bad-request", `Unknown endpoint: ${endpoint}`);
        }
      } catch (err) {
        logger?.warn?.(`dsh-harness-remote: rpc ${endpoint} failed | RPC 失败: ${err instanceof Error ? err.message : String(err)}`);
        return fail("bad-request", err instanceof Error ? err.message : String(err));
      }
    },
    { authority: "loopback" },
  );
}
