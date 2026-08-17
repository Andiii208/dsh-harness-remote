/**
 * requestInterrupt — 流式真中断分支测试：离线/不支持/成功三态。
 * UI 层（聊天页）据此决定显示「已发送中断请求」还是回退本地暂停。
 */

import { describe, expect, it, vi } from "vitest";
import type { Connection } from "@dsh-remote/protocol";
import { requestInterrupt } from "../src/transport/interrupt";

function fakeConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    unary: async () => ({ rpcId: "r", ok: true, result: {} }),
    respond: async () => {},
    events: {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ value: undefined, done: true }),
      }),
    },
    close: () => {},
    ...overrides,
  };
}

describe("requestInterrupt", () => {
  it("throws OFFLINE when there is no active connection (离线错误分支)", async () => {
    await expect(requestInterrupt(null, "s1")).rejects.toThrow("OFFLINE: not connected");
    await expect(requestInterrupt(undefined, "s1")).rejects.toThrow("OFFLINE: not connected");
  });

  it("throws UNSUPPORTED when the connection has no interrupt RPC", async () => {
    const conn = fakeConnection();
    await expect(requestInterrupt(conn, "s1")).rejects.toThrow(
      "UNSUPPORTED: connection has no session.interrupt RPC",
    );
  });

  it("calls connection.interrupt(sessionId) when available", async () => {
    const interrupt = vi.fn(async (_sessionId: string) => {});
    const conn = fakeConnection({ interrupt });
    await requestInterrupt(conn, "s1");
    expect(interrupt).toHaveBeenCalledWith("s1");
  });
});
