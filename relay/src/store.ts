/**
 * In-memory relay store. Pure TS, no I/O — intentionally small and unit-testable.
 */

export type ClientKind = "device" | "console";

export interface RegisterClientInput {
  clientId: string;
  kind: ClientKind;
  publicKey?: unknown;
  pushToken?: string;
  platform?: string;
}

export interface ClientRecord {
  clientId: string;
  kind: ClientKind;
  publicKey?: unknown;
  pushToken?: string;
  platform?: string;
  online: boolean;
  registeredAt: number;
  lastSeenAt: number;
}

export interface ConsumedPairingCode {
  code: string;
  consoleId: string;
}

export interface RelayStore {
  registerClient(input: RegisterClientInput): ClientRecord;
  getClient(clientId: string): ClientRecord | undefined;
  setOnline(clientId: string, online: boolean): boolean;
  isOnline(clientId: string): boolean;
  /** Generate a one-time 6-digit pairing code bound to `consoleId`. */
  createPairingCode(consoleId: string, ttlMs?: number): string;
  /** Consume a pairing code. One-time: the code is destroyed on success and expired/used codes return undefined. */
  consumePairingCode(code: string): ConsumedPairingCode | undefined;
  bindPair(a: string, b: string): void;
  isPaired(a: string, b: string): boolean;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("\u0000");
}

export function createRelayStore(now: () => number = Date.now): RelayStore {
  const clients = new Map<string, ClientRecord>();
  const pairingCodes = new Map<string, { code: string; consoleId: string; expiresAt: number; used: boolean }>();
  const pairs = new Set<string>();

  return {
    registerClient(input) {
      const client: ClientRecord = {
        clientId: input.clientId,
        kind: input.kind,
        online: true,
        registeredAt: now(),
        lastSeenAt: now(),
        ...(input.publicKey !== undefined ? { publicKey: input.publicKey } : {}),
        ...(input.pushToken !== undefined ? { pushToken: input.pushToken } : {}),
        ...(input.platform !== undefined ? { platform: input.platform } : {}),
      };
      clients.set(input.clientId, client);
      return client;
    },

    getClient(clientId) {
      return clients.get(clientId);
    },

    setOnline(clientId, online) {
      const client = clients.get(clientId);
      if (!client) return false;
      client.online = online;
      client.lastSeenAt = now();
      return true;
    },

    isOnline(clientId) {
      return clients.get(clientId)?.online ?? false;
    },

    createPairingCode(consoleId, ttlMs = 10 * 60 * 1000) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      pairingCodes.set(code, { code, consoleId, expiresAt: now() + ttlMs, used: false });
      return code;
    },

    consumePairingCode(code) {
      const record = pairingCodes.get(code);
      if (!record || record.used) return undefined;
      if (record.expiresAt <= now()) {
        pairingCodes.delete(code);
        return undefined;
      }
      pairingCodes.delete(code);
      return { code: record.code, consoleId: record.consoleId };
    },

    bindPair(a, b) {
      pairs.add(pairKey(a, b));
    },

    isPaired(a, b) {
      return pairs.has(pairKey(a, b));
    },
  };
}
