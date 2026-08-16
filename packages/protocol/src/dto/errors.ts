/**
 * Typed error codes carried by ok:false server-responses (baseline rc.5).
 * Unknown codes degrade to "UnknownError" — never crash the online layer.
 */

export const KNOWN_ERROR_CODES = [
  "NOT_FOUND",
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "INTERNAL",
  "NOT_IMPLEMENTED",
  "SESSION_NOT_FOUND",
  "SESSION_BUSY",
  "SERVICE_UNAVAILABLE",
  "TIMEOUT",
] as const;

export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number];

export type ErrorCode = KnownErrorCode | (string & {}) | "UnknownError";

export function isKnownErrorCode(v: string): v is KnownErrorCode {
  return (KNOWN_ERROR_CODES as readonly string[]).includes(v);
}
