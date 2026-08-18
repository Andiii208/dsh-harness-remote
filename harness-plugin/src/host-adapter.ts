/**
 * host-adapter.ts — P0 真实 DSH 宿主接缝适配层（参考实现）。
 *
 * DSH rc.7 的 RPC 命名与 dsh-remote 早期假设不同。本模块提供纯函数映射，
 * 供 harness-plugin 在需要把旧协议方法翻译为真实宿主方法时使用；不改 DSH
 * 核心源码。App 侧仍保持“能力探测不到就隐藏”，本适配层用于宿主插件/代理
 * 侧的可选接线。
 */

export interface HostRpcAdapterResult {
  method: string;
  payload: unknown;
}

/**
 * 把 dsh-remote 旧 RPC 名映射为真实 DSH rc.7 方法名。
 * 已知等价关系：
 * - session.interrupt → session.cancel（真实宿主用 session.cancel）
 * - goals/pause       → goal.pause（真实宿主用 dot 命名 + sessionId/ref）
 * - goals/resume      → goal.resume
 * 其余方法原样返回。
 */
export function adaptHostRpc(method: string, payload: unknown): HostRpcAdapterResult {
  switch (method) {
    case "session.interrupt":
      return { method: "session.cancel", payload };
    case "goals/pause":
      return { method: "goal.pause", payload };
    case "goals/resume":
      return { method: "goal.resume", payload };
    default:
      return { method, payload };
  }
}

/**
 * 把 DSH 设置面方法名翻译为真实宿主方法：
 * - host.settings.get → settings.describe（rc.7 设置域）
 * - host.settings.set → settings.update
 * 返回值供上层决定是否调用真实方法（settings.* 属特权回环 API）。
 */
export function adaptHostSettingsRpc(method: string, payload: unknown): HostRpcAdapterResult {
  switch (method) {
    case "host.settings.get":
      return { method: "settings.describe", payload };
    case "host.settings.set":
      return { method: "settings.update", payload };
    default:
      return { method, payload };
  }
}
