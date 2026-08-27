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
  /** Number of active (unused, unexpired) pairing codes currently bound to a console. */
  countActivePairingCodes(consoleId: string): number;
  /** Consume a pairing code. One-time: the code is destroyed on success and expired/used codes return undefined. */
  consumePairingCode(code: string): ConsumedPairingCode | undefined;
  bindPair(a: string, b: string): void;
  isPaired(a: string, b: string): boolean;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("\u0000");
}

export interface RelayStoreOptions {
  /** 注入六位配对码生成器；缺省保留可预测回退，server 会传 CSPRNG 实现。 */
  generatePairingCode?: () => string;
  /** 可注入时钟（原第二参数位置语义保留）。 */
  now?: () => number;
}

export function createRelayStore(
  optsOrNow: (() => number) | RelayStoreOptions = {},
): RelayStore {
  const isOpts = typeof optsOrNow !== "function";
  const generatePairingCode = isOpts ? optsOrNow.generatePairingCode : undefined;
  const now: () => number = isOpts ? (optsOrNow.now ?? Date.now) : (optsOrNow as () => number);

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
      const code = generatePairingCode?.() ?? String(Math.floor(100000 + Math.random() * 900000));
      pairingCodes.set(code, { code, consoleId, expiresAt: now() + ttlMs, used: false });
      return code;
    },

    countActivePairingCodes(consoleId) {
      let count = 0;
      for (const record of pairingCodes.values()) {
        if (
          record.consoleId === consoleId &&
          !record.used &&
          record.expiresAt > now()
        ) {
          count += 1;
        }
      }
      return count;
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
