/**
 * Relay 连接模式判定（纯函数，便于单测）。
 *
 * M3.1 规则：
 * - `relay://host:port` 是自托管 relay 入口，转成 `ws://host:port` 后交给
 *   RelayTransport（RelayTransport 只识别 ws:// / wss://）。
 * - 直接粘贴 `ws://` / `wss://` URL 也视为 relay 模式。
 * - 其他 host（如 `192.168.1.5`）走既有 LAN 路径，行为不变。
 */

export function isRelayUrl(host: string): boolean {
  return (
    host.startsWith("relay://") ||
    host.startsWith("ws://") ||
    host.startsWith("wss://")
  );
}

/**
 * 把 relay:// 入口转成 RelayTransport 可识别的 ws:// URL。
 * 已经是 ws:// / wss:// 的 URL 原样返回。
 */
export function toRelayWsUrl(host: string): string {
  if (host.startsWith("relay://")) {
    return `ws://${host.slice("relay://".length)}`;
  }
  return host;
}
