import { describe, expect, it } from "vitest";
import { PairingTokenStore } from "../src/token.js";
import { decideAccess, extractToken, AUTH_HEADER } from "../src/gate.js";

describe("decideAccess (pairing fence)", () => {
  it("allows loopback without token (trust fence preserved)", () => {
    const store = new PairingTokenStore(() => 1000);
    expect(decideAccess({ isLoopback: true }, store)).toBe("allow");
  });

  it("denies non-loopback without token", () => {
    const store = new PairingTokenStore(() => 1000);
    expect(decideAccess({ isLoopback: false }, store)).toBe("deny-no-token");
  });

  it("allows non-loopback with a valid token", () => {
    const store = new PairingTokenStore(() => 1000);
    const t = store.issue();
    expect(decideAccess({ isLoopback: false, providedToken: t.token }, store)).toBe("allow");
  });

  it("denies non-loopback with an invalid token", () => {
    const store = new PairingTokenStore(() => 1000);
    store.issue();
    expect(decideAccess({ isLoopback: false, providedToken: "nope" }, store)).toBe("deny");
  });

  it("denies-expired when the store has no active token", () => {
    const store = new PairingTokenStore(() => 1000);
    expect(decideAccess({ isLoopback: false, providedToken: "stale" }, store)).toBe("deny-expired");
  });
});

describe("extractToken", () => {
  it("reads x-dsh-pair-token header", () => {
    expect(extractToken({ [AUTH_HEADER]: "abc123" })).toBe("abc123");
  });

  it("reads Authorization Bearer", () => {
    expect(extractToken({ authorization: "Bearer tok-1" })).toBe("tok-1");
    expect(extractToken({ Authorization: "bearer  TOK " })).toBe("TOK");
  });

  it("returns undefined without headers", () => {
    expect(extractToken({})).toBeUndefined();
    expect(extractToken({ authorization: "" })).toBeUndefined();
  });
});
