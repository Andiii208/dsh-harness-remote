/**
 * Simple token-bucket rate limiter (M3.4). Pure TS, injectable clock.
 */

export interface RateLimiterOptions {
  /** Tokens refilled per minute. Defaults to 120. */
  perMinute?: number;
  /** Bucket capacity / initial token count. Defaults to 240. */
  burst?: number;
  now?: () => number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs?: number;
}

export interface RateLimiter {
  check(clientId: string): RateLimitDecision;
}

export function createRateLimiter(opts: RateLimiterOptions = {}): RateLimiter {
  const perMinute = opts.perMinute ?? 120;
  const burst = opts.burst ?? 240;
  const now = opts.now ?? Date.now;
  const refillPerMs = perMinute / 60_000;
  const buckets = new Map<string, { tokens: number; last: number }>();

  return {
    check(clientId) {
      const t = now();
      let bucket = buckets.get(clientId);
      if (!bucket) {
        bucket = { tokens: burst, last: t };
        buckets.set(clientId, bucket);
      } else {
        const elapsed = Math.max(0, t - bucket.last);
        bucket.tokens = Math.min(burst, bucket.tokens + elapsed * refillPerMs);
        bucket.last = t;
      }

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return { allowed: true };
      }

      const retryAfterMs =
        refillPerMs > 0 ? Math.ceil((1 - bucket.tokens) / refillPerMs) : undefined;
      return { allowed: false, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) };
    },
  };
}
