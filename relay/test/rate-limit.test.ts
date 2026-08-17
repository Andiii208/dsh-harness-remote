/**
 * rate-limiter unit tests (M3.4).
 */

import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/index.js";

describe("createRateLimiter", () => {
  it("allows up to burst then rejects with retryAfterMs", () => {
    let now = 1_000;
    const limiter = createRateLimiter({
      perMinute: 60_000, // 1 token per ms
      burst: 2,
      now: () => now,
    });

    expect(limiter.check("c1")).toEqual({ allowed: true });
    expect(limiter.check("c1")).toEqual({ allowed: true });

    const denied = limiter.check("c1");
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(1);
  });

  it("recovers after enough time passes", () => {
    let now = 1_000;
    const limiter = createRateLimiter({
      perMinute: 60_000,
      burst: 1,
      now: () => now,
    });

    expect(limiter.check("c1").allowed).toBe(true);
    expect(limiter.check("c1").allowed).toBe(false);

    now += 2; // refilled 2 tokens, capped at burst 1
    expect(limiter.check("c1").allowed).toBe(true);
    expect(limiter.check("c1").allowed).toBe(false);
  });

  it("tracks clients independently", () => {
    let now = 1_000;
    const limiter = createRateLimiter({
      perMinute: 60_000,
      burst: 1,
      now: () => now,
    });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(false);
  });
});
