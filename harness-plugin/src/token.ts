/**
 * PairingTokenStore — 一次性配对 token 的签发/校验/过期/吊销。
 * 纯 TS：now/rand 可注入，便于单测。token 仅存内存（重启失效），
 * 过期默认 15 分钟。非加密强度声明：token 是短期门禁凭证，
 * 不是长期密钥（M3 中继将升级为 E2E 密钥交换）。
 */

export interface PairingToken {
  token: string;
  issuedAt: number;
  expiresAt: number;
}

export const DEFAULT_TTL_MS = 15 * 60_000;

export function makeToken(rand: () => string = defaultRandom): string {
  return `dshpair_${rand()}${rand()}`;
}

/** 默认随机源：crypto.randomUUID（Node ≥19）。 */
function defaultRandom(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === "function") return g.crypto.randomUUID();
  return Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 14);
}

export class PairingTokenStore {
  private current: PairingToken | null = null;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
    private readonly rand: () => string = makeToken,
  ) {}

  /** 签发新 token（旧 token 立即失效）。 */
  issue(): PairingToken {
    const issuedAt = this.now();
    const token: PairingToken = {
      token: this.rand(),
      issuedAt,
      expiresAt: issuedAt + this.ttlMs,
    };
    this.current = token;
    return token;
  }

  /** 校验：存在、匹配、未过期。 */
  validate(candidate: string): boolean {
    const t = this.current;
    if (!t) return false;
    if (candidate !== t.token) return false;
    return this.now() <= t.expiresAt;
  }

  isActive(): boolean {
    return this.current !== null && this.now() <= this.current.expiresAt;
  }

  /** 吊销（断开配对）。 */
  revoke(): void {
    this.current = null;
  }

  /** 剩余有效毫秒（已过期/未签发 → 0）。 */
  remainingMs(): number {
    const t = this.current;
    if (!t) return 0;
    return Math.max(0, t.expiresAt - this.now());
  }
}
