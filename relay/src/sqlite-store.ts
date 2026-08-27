/**
 * SQLite-backed relay store (M3.7 release-gate prep, optional).
 *
 * Same `RelayStore` interface as the in-memory store, backed by `node:sqlite`
 * (Node 22+ / 24). The relay server keeps its default in-memory behavior;
 * operators can opt in by passing `store: createSqliteRelayStore(path)` to
 * `createRelayServer` (or via the CLI `--store` flag).
 *
 * Persistence model:
 *  - clients survive restart (clientId/kind/publicKey/pushToken/online).
 *  - pairing codes survive restart (still one-time + TTL).
 *  - pair bindings survive restart.
 */

import { DatabaseSync } from "node:sqlite";
import type {
  ClientRecord,
  ConsumedPairingCode,
  RegisterClientInput,
  RelayStore,
} from "./store.js";

export interface SqliteRelayStore extends RelayStore {
  close(): void;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("\u0000");
}

function toClientRecord(row: Record<string, unknown>): ClientRecord {
  return {
    clientId: String(row.client_id),
    kind: row.kind === "console" ? "console" : "device",
    online: Boolean(row.online),
    registeredAt: Number(row.registered_at),
    lastSeenAt: Number(row.last_seen_at),
    ...(row.public_key !== null && row.public_key !== undefined
      ? { publicKey: JSON.parse(String(row.public_key)) as unknown }
      : {}),
    ...(row.push_token !== null && row.push_token !== undefined
      ? { pushToken: String(row.push_token) }
      : {}),
    ...(row.platform !== null && row.platform !== undefined
      ? { platform: String(row.platform) }
      : {}),
  };
}

export function createSqliteRelayStore(
  dbPath: string,
  opts: { generatePairingCode?: () => string; now?: () => number } = {},
): SqliteRelayStore {
  const generatePairingCode = opts.generatePairingCode;
  const now = opts.now ?? Date.now;
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS relay_clients (
      client_id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'device',
      public_key TEXT,
      push_token TEXT,
      platform TEXT,
      online INTEGER NOT NULL DEFAULT 0,
      registered_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS relay_pairing_codes (
      code TEXT PRIMARY KEY,
      console_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS relay_pairs (
      pair_key TEXT PRIMARY KEY
    );
  `);

  const getClient = (clientId: string): ClientRecord | undefined => {
    const row = db.prepare(
      `SELECT client_id, kind, public_key, push_token, platform, online,
              registered_at, last_seen_at
         FROM relay_clients WHERE client_id = ?`,
    ).get(clientId) as Record<string, unknown> | undefined;
    return row ? toClientRecord(row) : undefined;
  };

  return {
    registerClient(input: RegisterClientInput): ClientRecord {
      const ts = now();
      db.prepare(
        `INSERT INTO relay_clients
           (client_id, kind, public_key, push_token, platform, online, registered_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(client_id) DO UPDATE SET
           kind = excluded.kind,
           public_key = excluded.public_key,
           push_token = excluded.push_token,
           platform = excluded.platform,
           online = excluded.online,
           last_seen_at = excluded.last_seen_at`,
      ).run(
        input.clientId,
        input.kind,
        input.publicKey !== undefined ? JSON.stringify(input.publicKey) : null,
        input.pushToken ?? null,
        input.platform ?? null,
        ts,
        ts,
      );
      return getClient(input.clientId)!;
    },

    getClient,

    setOnline(clientId: string, online: boolean): boolean {
      const res = db.prepare(
        `UPDATE relay_clients SET online = ?, last_seen_at = ? WHERE client_id = ?`,
      ).run(online ? 1 : 0, now(), clientId);
      return Number(res.changes) > 0;
    },

    isOnline(clientId: string): boolean {
      const row = db.prepare(
        `SELECT online FROM relay_clients WHERE client_id = ?`,
      ).get(clientId) as { online?: number } | undefined;
      return row?.online === 1;
    },

    createPairingCode(consoleId: string, ttlMs = 10 * 60 * 1000): string {
      const code = generatePairingCode?.() ?? String(Math.floor(100000 + Math.random() * 900000));
      db.prepare(
        `INSERT INTO relay_pairing_codes (code, console_id, expires_at, used)
         VALUES (?, ?, ?, 0)
         ON CONFLICT(code) DO UPDATE SET
           console_id = excluded.console_id,
           expires_at = excluded.expires_at,
           used = 0`,
      ).run(code, consoleId, now() + ttlMs);
      return code;
    },

    countActivePairingCodes(consoleId: string): number {
      const row = db.prepare(
        `SELECT COUNT(*) AS n FROM relay_pairing_codes
          WHERE console_id = ? AND used = 0 AND expires_at > ?`,
      ).get(consoleId, now()) as { n?: number };
      return Number(row?.n ?? 0);
    },

    consumePairingCode(code: string): ConsumedPairingCode | undefined {
      const row = db.prepare(
        `SELECT code, console_id, expires_at, used FROM relay_pairing_codes WHERE code = ?`,
      ).get(code) as
        | { code: string; console_id: string; expires_at: number; used: number }
        | undefined;
      if (!row || row.used === 1) return undefined;
      if (row.expires_at <= now()) {
        db.prepare(`DELETE FROM relay_pairing_codes WHERE code = ?`).run(code);
        return undefined;
      }
      db.prepare(`DELETE FROM relay_pairing_codes WHERE code = ?`).run(code);
      return { code: row.code, consoleId: row.console_id };
    },

    bindPair(a: string, b: string): void {
      db.prepare(`INSERT OR IGNORE INTO relay_pairs (pair_key) VALUES (?)`).run(
        pairKey(a, b),
      );
    },

    isPaired(a: string, b: string): boolean {
      const row = db.prepare(
        `SELECT 1 AS ok FROM relay_pairs WHERE pair_key = ?`,
      ).get(pairKey(a, b)) as { ok?: number } | undefined;
      return row?.ok === 1;
    },

    close(): void {
      db.close();
    },
  };
}
