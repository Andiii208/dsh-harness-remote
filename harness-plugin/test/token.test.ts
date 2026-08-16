import { describe, expect, it } from "vitest";
import { PairingTokenStore, DEFAULT_TTL_MS } from "../src/token.js";

describe("PairingTokenStore", () => {
  it("issues a token that validates", () => {
    const s = new PairingTokenStore(() => 1000);
    const t = s.issue();
    expect(t.token.startsWith("dshpair_")).toBe(true);
    expect(t.expiresAt - t.issuedAt).toBe(DEFAULT_TTL_MS);
    expect(s.validate(t.token)).toBe(true);
    expect(s.isActive()).toBe(true);
  });

  it("rejects wrong tokens", () => {
    const s = new PairingTokenStore(() => 1000);
    s.issue();
    expect(s.validate("dshpair_wrong")).toBe(false);
  });

  it("rejects expired tokens", () => {
    let now = 1000;
    const s = new PairingTokenStore(() => now, DEFAULT_TTL_MS, () => "fixed-token");
    const t = s.issue();
    now = t.expiresAt + 1;
    expect(s.validate(t.token)).toBe(false);
    expect(s.isActive()).toBe(false);
    expect(s.remainingMs()).toBe(0);
  });

  it("invalidates the previous token on re-issue and on revoke", () => {
    let n = 0;
    const s = new PairingTokenStore(() => 1000, DEFAULT_TTL_MS, () => `tok${++n}`);
    const a = s.issue();
    const b = s.issue();
    expect(s.validate(a.token)).toBe(false);
    expect(s.validate(b.token)).toBe(true);
    s.revoke();
    expect(s.validate(b.token)).toBe(false);
    expect(s.isActive()).toBe(false);
  });

  it("remainingMs counts down", () => {
    let now = 0;
    const s = new PairingTokenStore(() => now, 1000);
    s.issue();
    now = 400;
    expect(s.remainingMs()).toBe(600);
  });
});
