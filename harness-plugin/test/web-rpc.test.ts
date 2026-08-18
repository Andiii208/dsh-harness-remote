import { describe, expect, it } from "vitest";
import type { RemoteAccessOptions } from "../src/remote-access.js";
import { createRemoteAccessService } from "../src/remote-service.js";
import { installRemoteRpc, REMOTE_RPC_CHANNEL, REMOTE_RPC_ENDPOINTS } from "../src/web-rpc.js";

function makeCtx() {
  let channel = "";
  let handler: ((endpoint: string, payload: Record<string, unknown>, signal?: { aborted?: boolean }) => Promise<unknown>) | null = null;
  let authority = "";
  const ctx = {
    connection: {
      rpc: {
        handle: (
          ch: string,
          h: (endpoint: string, payload: Record<string, unknown>, signal?: { aborted?: boolean }) => Promise<unknown>,
          opts?: { authority?: string },
        ) => {
          channel = ch;
          handler = h;
          authority = opts?.authority ?? "";
          return () => {};
        },
      },
    },
  };
  return { ctx, get: () => ({ channel, handler, authority }) };
}

describe("installRemoteRpc", () => {
  it("registers a loopback channel and answers status/stop", async () => {
    const { ctx, get } = makeCtx();
    const service = createRemoteAccessService({ autoDetectDsh: false });
    installRemoteRpc(ctx, service, console);

    expect(get().channel).toBe(REMOTE_RPC_CHANNEL);
    expect(get().authority).toBe("loopback");
    const handler = get().handler!;

    const statusRes = (await handler(REMOTE_RPC_ENDPOINTS.status, {})) as { ok: boolean; value: { running: boolean } };
    expect(statusRes.ok).toBe(true);
    expect(statusRes.value.running).toBe(false);

    const stopRes = (await handler(REMOTE_RPC_ENDPOINTS.stop, {})) as { ok: boolean; value: { running: boolean } };
    expect(stopRes.ok).toBe(true);
    expect(stopRes.value.running).toBe(false);
  });

  it("returns bad-request for unknown endpoints", async () => {
    const { ctx, get } = makeCtx();
    const service = createRemoteAccessService({ autoDetectDsh: false });
    installRemoteRpc(ctx, service, console);
    const res = (await get().handler!("nope", {})) as { ok: boolean; error: { code: string; message: string } };
    expect(res.ok).toBe(false);
    expect(res.error.code).toBe("bad-request");
  });

  it("handles start endpoint mode parameter", async () => {
    const { ctx, get } = makeCtx();
    const service = createRemoteAccessService({
      autoDetectDsh: false,
      startImpl: async (opts: RemoteAccessOptions) => ({
        host: opts.mode === "lan" ? "192.168.1.5" : "https://x.trycloudflare.com",
        port: 4090,
        url: opts.mode === "lan" ? "ws://192.168.1.5:4090" : "wss://x.trycloudflare.com",
        code: "654321",
        qrPayload: "dshremote://remote?addr=x&code=654321",
        dshUrl: null,
        mode: opts.mode ?? "tunnel",
        publicUrl: opts.mode === "lan" ? null : "https://x.trycloudflare.com",
        stop: async () => {},
      }),
      qrDataUrlImpl: async () => "data:image/png;base64,x",
    });
    installRemoteRpc(ctx, service, console);
    const res = (await get().handler!(REMOTE_RPC_ENDPOINTS.start, { mode: "lan" })) as { ok: boolean; value: { mode: string } };
    expect(res.ok).toBe(true);
    expect(res.value.mode).toBe("lan");
  });
});
