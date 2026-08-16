/**
 * 配对围栏（pairing fence）——访问决策：
 * - 回环请求：放行（特权功能继续 loopback-only，保持 DSH 既有信任围栏语义）。
 * - 非回环请求：必须携带有效配对 token（Authorization: Bearer 或 X-DSH-Pair-Token）。
 * 纯函数，便于单测与移植到插件接线层。
 */

import type { PairingTokenStore } from "./token.js";

export const AUTH_HEADER = "x-dsh-pair-token";

export interface AccessRequest {
  /** Host 是否为回环（127.0.0.1 / ::1 / localhost）。 */
  isLoopback: boolean;
  /** 请求携带的 token（从 Authorization: Bearer 或 X-DSH-Pair-Token 提取）。 */
  providedToken?: string;
}

export type AccessDecision = "allow" | "deny" | "deny-no-token" | "deny-expired";

export function decideAccess(
  req: AccessRequest,
  store: PairingTokenStore,
): AccessDecision {
  if (req.isLoopback) return "allow";
  const t = req.providedToken;
  if (!t) return "deny-no-token";
  if (!store.validate(t)) return store.isActive() ? "deny" : "deny-expired";
  return "allow";
}

/** 从请求头提取配对 token（大小写不敏感；支持 Bearer 与裸值）。 */
export function extractToken(headers: Record<string, string | undefined>): string | undefined {
  let raw: string | undefined;
  for (const [key, value] of Object.entries(headers)) {
    const lk = key.toLowerCase();
    if (lk === "authorization" || lk === AUTH_HEADER) {
      raw = value;
      break;
    }
  }
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) return trimmed.slice("bearer ".length).trim();
  return trimmed;
}
