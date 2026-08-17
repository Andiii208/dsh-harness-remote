/**
 * Phase 1 流式真中断：请求宿主中断正在进行的流式输出。
 *
 * 优先走连接级 `session.interrupt` RPC（LanTransport 已接线）；
 * 离线或当前连接不具备该能力时抛错，由 UI 决定回退为本地暂停渲染。
 */

import type { Connection } from "@dsh-remote/protocol";

export async function requestInterrupt(
  connection: Connection | null | undefined,
  sessionId: string,
): Promise<void> {
  if (!connection) throw new Error("OFFLINE: not connected");
  if (!connection.interrupt) {
    throw new Error("UNSUPPORTED: connection has no session.interrupt RPC");
  }
  await connection.interrupt(sessionId);
}
