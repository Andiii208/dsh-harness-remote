import { describe, expect, it } from "vitest";
import {
  deriveRelaySessionKeys,
  generateRelayKeyPair,
  openRelayPayload,
  RELAY_KDF_SALT,
  sealRelayPayload,
} from "../src/relay-crypto.js";

const crypto = globalThis.crypto;

const d2cInfo = new TextEncoder().encode("dsh-remote/relay-m3.2/device-to-console");
const c2dInfo = new TextEncoder().encode("dsh-remote/relay-m3.2/console-to-device");

describe("relay-crypto", () => {
  it("generates exportable ECDH P-256 JWK keypairs", async () => {
    const pair = await generateRelayKeyPair(crypto);
    expect(pair.publicKeyJwk).toMatchObject({ kty: "EC", crv: "P-256" });
    expect(pair.privateKeyJwk).toMatchObject({ kty: "EC", crv: "P-256" });
    expect(pair.privateKeyJwk.d).toBeDefined();
    expect(pair.publicKeyJwk.x).toBeDefined();
    expect(pair.publicKeyJwk.y).toBeDefined();
  });

  it("derives interoperable session keys: both peers seal/open each other's payloads", async () => {
    const device = await generateRelayKeyPair(crypto);
    const console_ = await generateRelayKeyPair(crypto);

    const deviceKeys = await deriveRelaySessionKeys(
      crypto,
      device.privateKeyJwk,
      console_.publicKeyJwk,
    );
    const consoleKeys = await deriveRelaySessionKeys(
      crypto,
      console_.privateKeyJwk,
      device.publicKeyJwk,
    );

    const sealed = await sealRelayPayload(crypto, deviceKeys.encKey, { hello: "console" });
    await expect(openRelayPayload(crypto, consoleKeys.encKey, sealed)).resolves.toEqual({
      hello: "console",
    });
  });

  it("seals and opens arbitrary JSON payloads round-trip", async () => {
    const device = await generateRelayKeyPair(crypto);
    const console_ = await generateRelayKeyPair(crypto);
    const keys = await deriveRelaySessionKeys(
      crypto,
      device.privateKeyJwk,
      console_.publicKeyJwk,
    );

    const payload = { rpcId: "r1", method: "session.list", payload: { limit: 10 }, ok: true };
    const sealed = await sealRelayPayload(crypto, keys.encKey, payload);
    expect(sealed).toEqual({
      ciphertext: expect.any(String),
      nonce: expect.any(String),
    });
    await expect(openRelayPayload(crypto, keys.encKey, sealed)).resolves.toEqual(payload);
  });

  it("fails when ciphertext is tampered", async () => {
    const device = await generateRelayKeyPair(crypto);
    const console_ = await generateRelayKeyPair(crypto);
    const keys = await deriveRelaySessionKeys(
      crypto,
      device.privateKeyJwk,
      console_.publicKeyJwk,
    );

    const sealed = await sealRelayPayload(crypto, keys.encKey, { sensitive: true });
    const bytes = Buffer.from(sealed.ciphertext, "base64url");
    // Flip a bit inside the AES-GCM output, after the 12-byte iv prefix.
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff;
    const tampered = { ...sealed, ciphertext: bytes.toString("base64url") };

    await expect(openRelayPayload(crypto, keys.encKey, tampered)).rejects.toThrow();
  });

  it("fails when the nonce is swapped (replay with a different nonce)", async () => {
    const device = await generateRelayKeyPair(crypto);
    const console_ = await generateRelayKeyPair(crypto);
    const keys = await deriveRelaySessionKeys(
      crypto,
      device.privateKeyJwk,
      console_.publicKeyJwk,
    );

    const first = await sealRelayPayload(crypto, keys.encKey, { n: 1 });
    const second = await sealRelayPayload(crypto, keys.encKey, { n: 2 });
    const swapped = { ciphertext: first.ciphertext, nonce: second.nonce };

    await expect(openRelayPayload(crypto, keys.encKey, swapped)).rejects.toThrow(
      /nonce does not match/,
    );
  });

  it("derives independent direction keys when different info is used", async () => {
    const device = await generateRelayKeyPair(crypto);
    const console_ = await generateRelayKeyPair(crypto);

    const d2c = await deriveRelaySessionKeys(
      crypto,
      device.privateKeyJwk,
      console_.publicKeyJwk,
      RELAY_KDF_SALT,
      d2cInfo,
    );
    const c2d = await deriveRelaySessionKeys(
      crypto,
      console_.privateKeyJwk,
      device.publicKeyJwk,
      RELAY_KDF_SALT,
      c2dInfo,
    );

    const sealed = await sealRelayPayload(crypto, d2c.encKey, { dir: "d2c" });
    // Each direction's key cannot decrypt the other direction's payload.
    await expect(openRelayPayload(crypto, c2d.encKey, sealed)).rejects.toThrow();
    await expect(openRelayPayload(crypto, d2c.encKey, sealed)).resolves.toEqual({
      dir: "d2c",
    });
  });

  it("re-derives the same session key deterministically (reconnect reuse)", async () => {
    const device = await generateRelayKeyPair(crypto);
    const console_ = await generateRelayKeyPair(crypto);

    const first = await deriveRelaySessionKeys(
      crypto,
      device.privateKeyJwk,
      console_.publicKeyJwk,
    );
    const second = await deriveRelaySessionKeys(
      crypto,
      device.privateKeyJwk,
      console_.publicKeyJwk,
    );

    const sealed = await sealRelayPayload(crypto, first.encKey, { session: "reconnect" });
    await expect(openRelayPayload(crypto, second.encKey, sealed)).resolves.toEqual({
      session: "reconnect",
    });
  });
});
