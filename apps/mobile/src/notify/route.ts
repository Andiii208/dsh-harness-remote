/**
 * 通知深链 route 解析（纯函数，零依赖，可单测）。
 */

/** 从通知 data 提取可跳转的 route；仅允许应用内已知路由前缀。 */
export function routeFromNotificationData(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const route = (data as Record<string, unknown>).route;
  if (typeof route !== "string" || route.length === 0) return null;
  if (!route.startsWith("chat/") && !route.startsWith("approval/")) return null;
  return route;
}
