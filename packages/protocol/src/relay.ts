/**
 * Relay (M3) control-plane envelope types and pure parsers.
 *
 * The relay moves the same DSH wire protocol over an E2E-encrypted outbound
 * connection. These definitions are intentionally additive: they do not
 * change any existing envelope/frame behavior. `parseRelayEnvelope` follows
 * the same lenient rules as `decodeEnvelope` — never throw on arbitrary input.
 */

export const RELAY_ENVELOPE_VERSION = 1;

export type RelayEnvelopeType =
  | "relay.hello"
  | "relay.hello.ack"
  | "relay.register"
  | "relay.register.ack"
  | "relay.pair"
  | "relay.pair.ack"
  | "relay.route"
  | "relay.route.ack"
  | "relay.heartbeat"
  | "relay.heartbeat.ack"
  | "relay.error";

export type RelayErrorCode =
  | "E_BAD_ENVELOPE"
  | "E_AUTH"
  | "E_PAIR"
  | "E_ROUTE"
  | "E_EXPIRED"
  | "E_RATE"
  | "E_UNKNOWN";

export interface RelayError {
  code: RelayErrorCode;
  message: string;
  details?: unknown;
}

/** M3.1 device registration payload. */
export interface RelayRegistration {
  deviceId: string;
  /** ECDH public key (JWK) the device generated for the relay session. */
  publicKey: unknown;
  /** APNs / FCM push token for wake-ups. */
  pushToken?: string;
  platform?: "ios" | "android" | "web";
  protocolVersion?: number;
}

/** M3.1 pairing payload: the mobile app asks the relay to pair with a console code. */
export interface RelayPairing {
  code: string;
  deviceId: string;
}

/** M3.2 routing payload: relay delivers this opaque encrypted payload to the peer. */
export interface RelayRoute {
  /** Opaque encrypted envelope (ciphertext + nonce + ephemeral key). */
  ciphertext: string;
  nonce: string;
  /** Target device id / console id. */
  to: string;
}

/** M3.3 heartbeat payload (optional latency/backpressure hints). */
export interface RelayHeartbeat {
  rttMs?: number;
  backpressure?: "none" | "pause" | "drop";
}

export interface RelayEnvelope {
  v: typeof RELAY_ENVELOPE_VERSION;
  type: RelayEnvelopeType;
  /** Correlation id for request/response pairs. */
  id: string;
  /** Sender id (deviceId / consoleId / relay). */
  from: string;
  /** Receiver id; empty for relay-addressed control messages. */
  to: string;
  /** Unix ms timestamp. */
  ts: number;
  payload?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

const KNOWN_TYPES: readonly string[] = [
  "relay.hello",
  "relay.hello.ack",
  "relay.register",
  "relay.register.ack",
  "relay.pair",
  "relay.pair.ack",
  "relay.route",
  "relay.route.ack",
  "relay.heartbeat",
  "relay.heartbeat.ack",
  "relay.error",
];

/** Lenient parser: returns null for anything that is not a relay envelope. */
export function parseRelayEnvelope(input: unknown): RelayEnvelope | null {
  if (!isRecord(input)) return null;
  const type = str(input.type);
  if (!type || !KNOWN_TYPES.includes(type)) return null;
  const id = str(input.id);
  if (!id) return null;
  const from = str(input.from);
  if (!from) return null;
  const v = num(input.v);
  const ts = num(input.ts);
  if (v !== RELAY_ENVELOPE_VERSION) return null;
  if (ts === undefined || ts < 0) return null;
  return {
    v: RELAY_ENVELOPE_VERSION,
    type: type as RelayEnvelopeType,
    id,
    from,
    to: str(input.to) ?? "",
    ts,
    ...(input.payload !== undefined ? { payload: input.payload } : {}),
  };
}

export function isRelayEnvelope(input: unknown): input is RelayEnvelope {
  return parseRelayEnvelope(input) !== null;
}

const KNOWN_ERROR_CODES: readonly string[] = [
  "E_BAD_ENVELOPE",
  "E_AUTH",
  "E_PAIR",
  "E_ROUTE",
  "E_EXPIRED",
  "E_RATE",
  "E_UNKNOWN",
];

/** Lenient relay error normalization: unknown codes degrade to E_UNKNOWN. */
export function normalizeRelayError(input: unknown): RelayError {
  if (isRecord(input)) {
    const rawCode = str(input.code);
    const code = rawCode && KNOWN_ERROR_CODES.includes(rawCode)
      ? (rawCode as RelayErrorCode)
      : "E_UNKNOWN";
    return {
      code,
      message: str(input.message) ?? "relay error",
      ...(input.details !== undefined ? { details: input.details } : {}),
    };
  }
  return { code: "E_UNKNOWN", message: "relay error", details: input };
}
