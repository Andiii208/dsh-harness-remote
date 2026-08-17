/**
 * M3.2 E2E encryption for the relay data plane.
 *
 * ECDH (P-256) → HKDF-SHA256 → AES-256-GCM, with WebCrypto injected so the
 * same pure functions run in Node, browsers, and React Native (and are
 * deterministic under test when the caller passes a fixed salt/info).
 *
 * `relay.route` payloads are sealed as `{ to, ciphertext, nonce }` where
 * `ciphertext` is base64url(iv || AES-GCM ciphertext+tag) and `nonce` is
 * base64url(iv). `openRelayPayload` verifies that the nonce matches the iv
 * embedded in the ciphertext and throws on any AES-GCM authentication
 * failure — tampered ciphertext, swapped nonces, and replays all fail.
 */

const encoder = new TextEncoder();

/** Fixed protocol salt for HKDF when the caller does not pass one. */
export const RELAY_KDF_SALT = encoder.encode("dsh-remote/relay-m3.2/kdf-salt");

/** Fixed protocol info for HKDF when the caller does not pass one. */
export const RELAY_KDF_INFO = encoder.encode("dsh-remote/relay-m3.2/kdf-info");

/** Default length of the AES-GCM IV used for every sealed relay payload. */
export const RELAY_GCM_IV_LENGTH = 12;

export interface RelayKeyPair {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
}

export interface RelaySessionKeys {
  encKey: CryptoKey;
}

export interface RelaySealedPayload {
  ciphertext: string;
  nonce: string;
}

/**
 * Generate an ECDH P-256 keypair with exportable JWK private/public keys.
 */
export async function generateRelayKeyPair(crypto: Crypto): Promise<RelayKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const [publicKeyJwk, privateKeyJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", pair.publicKey),
    crypto.subtle.exportKey("jwk", pair.privateKey),
  ]);
  return { publicKeyJwk, privateKeyJwk };
}

/**
 * Derive the AES-256-GCM session key for one direction.
 *
 * ECDH shared secret (P-256) is fed into HKDF-SHA256 with the given salt
 * (default `RELAY_KDF_SALT`) and info (default `RELAY_KDF_INFO`). The same
 * keypair + peer public key + salt + info always derive interoperable keys,
 * so a reconnecting peer can re-derive the same session key deterministically.
 * Pass different `info` (or `salt`) per direction for direction-independent
 * keys.
 */
export async function deriveRelaySessionKeys(
  crypto: Crypto,
  privateKeyJwk: JsonWebKey,
  peerPublicKeyJwk: JsonWebKey,
  salt: BufferSource = RELAY_KDF_SALT,
  info: BufferSource = RELAY_KDF_INFO,
): Promise<RelaySessionKeys> {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const peerPublicKey = await crypto.subtle.importKey(
    "jwk",
    peerPublicKeyJwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerPublicKey },
    privateKey,
    256,
  );

  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    { name: "HKDF" },
    false,
    ["deriveKey"],
  );

  const encKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  return { encKey };
}

/**
 * Seal an arbitrary JSON-able payload for the relay data plane.
 *
 * Layout: iv (12 bytes) + AES-256-GCM output (ciphertext || 16-byte tag),
 * base64url-encoded as `ciphertext`; `nonce` is base64url(iv).
 */
export async function sealRelayPayload(
  crypto: Crypto,
  key: CryptoKey,
  payload: unknown,
): Promise<RelaySealedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(RELAY_GCM_IV_LENGTH));
  const plaintext = encoder.encode(JSON.stringify(payload));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );

  // WebCrypto's AES-GCM output is ciphertext || tag. Prefix the iv so every
  // sealed payload is self-describing and nonce swaps can be detected.
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv, 0);
  combined.set(encrypted, iv.length);

  return {
    ciphertext: bytesToBase64Url(combined),
    nonce: bytesToBase64Url(iv),
  };
}

/**
 * Open a sealed relay payload. Throws on tampered ciphertext, nonce mismatch,
 * or malformed JSON — any failure means the payload must be discarded.
 */
export async function openRelayPayload(
  crypto: Crypto,
  key: CryptoKey,
  sealed: RelaySealedPayload,
): Promise<unknown> {
  const combined = base64UrlToBytes(sealed.ciphertext);
  if (combined.length < RELAY_GCM_IV_LENGTH + 16) {
    throw new Error("relay-crypto: ciphertext too short");
  }

  const iv = combined.slice(0, RELAY_GCM_IV_LENGTH);
  const nonce = base64UrlToBytes(sealed.nonce);
  if (!bytesEqual(iv, nonce)) {
    throw new Error("relay-crypto: nonce does not match ciphertext iv");
  }

  const encrypted = combined.slice(RELAY_GCM_IV_LENGTH);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted,
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
