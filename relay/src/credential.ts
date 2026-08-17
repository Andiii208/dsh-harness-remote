/**
 * Short-lived relay credentials (HMAC-SHA256).
 *
 * Token layout: `v1.<base64url(clientId)>.<expiresAtEpochMs>.<base64url(sig)>`
 * where sig = HMAC-SHA256(secret, `v1.<clientB64>.<expiresAt>`). The payload
 * only carries a clientId and an expiry timestamp — never any DSH content.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DEFAULT_SECRET =
  process.env.RELAY_CREDENTIAL_SECRET ?? randomBytes(32).toString("hex");

export interface RelayCredentialService {
  issue(clientId: string, ttlMs: number): string;
  verify(token: string): { clientId: string } | null;
}

function sign(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromB64url(input: string): string | null {
  try {
    return Buffer.from(input, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function createCredentialService(secret: string = DEFAULT_SECRET): RelayCredentialService {
  return {
    issue(clientId, ttlMs) {
      const expiresAt = Date.now() + Math.max(1, Math.floor(ttlMs));
      const body = `${b64url(clientId)}.${expiresAt}`;
      const sig = sign(secret, body);
      return `v1.${body}.${sig}`;
    },

    verify(token) {
      if (typeof token !== "string") return null;
      const parts = token.split(".");
      if (parts.length !== 4 || parts[0] !== "v1") return null;
      const clientB64 = parts[1];
      const expiresRaw = parts[2];
      const sig = parts[3];
      if (!clientB64 || !expiresRaw || !sig) return null;

      const body = `${clientB64}.${expiresRaw}`;
      const expected = sign(secret, body);
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

      const expiresAt = Number(expiresRaw);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;

      const clientId = fromB64url(clientB64);
      if (!clientId) return null;
      return { clientId };
    },
  };
}

const defaultService = createCredentialService();

/** Issue a short-lived credential for `clientId` valid for `ttlMs` milliseconds. */
export function issue(clientId: string, ttlMs: number): string {
  return defaultService.issue(clientId, ttlMs);
}

/** Verify a credential; returns `{ clientId }` or `null` when invalid/expired. */
export function verify(token: string): { clientId: string } | null {
  return defaultService.verify(token);
}
