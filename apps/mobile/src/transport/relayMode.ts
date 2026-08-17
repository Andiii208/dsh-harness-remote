/**
 * Relay 连接模式判定（纯函数，便于单测）。
 *
 * M3.1 规则：
 * - `relay://host:port` 是自托管 relay 入口，转成 `ws://host:port` 后交给
 *   RelayTransport（RelayTransport 只识别 ws:// / wss://）。
 * - 直接粘贴 `ws://` / `wss://` URL 也视为 relay 模式。
 * - 其他 host（如 `192.168.1.5`）走既有 LAN 路径，行为不变。
 *
 * R1 远程优先：
 * - 远程模式允许只填 host（如 `relay.example.com`），App 自动补
 *   `ws://host:4090`。
 */

/** Relay 模式默认端口（自托管 relay 约定端口）。 */
export const RELAY_DEFAULT_PORT = 4090;

/** 已带协议的 relay URL（relay:// / ws:// / wss://）。 */
export function isRelayUrl(host: string): boolean {
  return (
    host.startsWith("relay://") ||
    host.startsWith("ws://") ||
    host.startsWith("wss://")
  );
}

/**
 * 把用户输入的 relay 地址转成 RelayTransport 可识别的 ws:// URL。
 * - `relay://host:port` → `ws://host:port`（缺省端口时补默认 4090）
 * - `ws://` / `wss://` 原样保留
 * - 裸 host（`relay.example.com` / `192.168.1.5`）→ `ws://host:4090`
 */
export function toRelayWsUrl(host: string): string {
  const trimmed = host.trim();
  if (trimmed.startsWith("relay://")) {
    const rest = trimmed.slice("relay://".length);
    return `ws://${normalizeHostPort(rest)}`;
  }
  if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) {
    return trimmed;
  }
  return `ws://${normalizeHostPort(trimmed)}`;
}

function normalizeHostPort(hostPort: string): string {
  if (hostPort.length === 0) return hostPort;
  if (hostPort.startsWith("[")) {
    // IPv6 字面量（如 [::1]）补默认端口
    return /\]:\d+$/.test(hostPort)
      ? hostPort
      : `${hostPort}:${RELAY_DEFAULT_PORT}`;
  }
  if (hostPort.includes(":") && hostPort.split(":").length > 2) {
    // 裸 IPv6（如 ::1）→ 加方括号再补端口
    return `[${hostPort}]:${RELAY_DEFAULT_PORT}`;
  }
  if (/:\d+$/.test(hostPort)) return hostPort;
  return `${hostPort}:${RELAY_DEFAULT_PORT}`;
}
