import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteRelayStore, type SqliteRelayStore } from "../src/sqlite-store.js";

const stores: SqliteRelayStore[] = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const store of stores.splice(0)) {
    try {
      store.close();
    } catch {
      /* already closed */
    }
  }
  for (const dir of dirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function tempPath(name: string): Promise<{ dir: string; path: string }> {
  const dir = await mkdtemp(join(tmpdir(), `dsh-relay-sqlite-${name}-`));
  const path = join(dir, "relay.sqlite");
  dirs.push(dir);
  return { dir, path };
}

describe("createSqliteRelayStore", () => {
  it("persists clients and pair bindings across reopen", async () => {
    const { dir, path } = await tempPath("persist");
    const store = createSqliteRelayStore(path);
    stores.push(store);

    store.registerClient({ clientId: "device-1", kind: "device", publicKey: { kty: "EC", crv: "P-256" } });
    store.registerClient({ clientId: "console-1", kind: "console", publicKey: { kty: "EC", crv: "P-256" } });
    store.bindPair("device-1", "console-1");
    expect(store.isPaired("device-1", "console-1")).toBe(true);

    store.close();
    const reopened = createSqliteRelayStore(path);
    stores.push(reopened);

    expect(reopened.getClient("device-1")).toMatchObject({ clientId: "device-1", kind: "device" });
    expect(reopened.getClient("console-1")?.publicKey).toEqual({ kty: "EC", crv: "P-256" });
    expect(reopened.isPaired("device-1", "console-1")).toBe(true);
    expect(reopened.isPaired("console-1", "device-1")).toBe(true);
    // Silence unused variable (kept for clarity of the reopened temp path).
    expect(dir).toBeDefined();
  });

  it("persists online state", async () => {
    const { path } = await tempPath("online");
    const store = createSqliteRelayStore(path);
    stores.push(store);

    store.registerClient({ clientId: "device-1", kind: "device" });
    expect(store.isOnline("device-1")).toBe(true);
    store.setOnline("device-1", false);
    expect(store.isOnline("device-1")).toBe(false);

    store.close();
    const reopened = createSqliteRelayStore(path);
    stores.push(reopened);
    expect(reopened.isOnline("device-1")).toBe(false);
    expect(reopened.getClient("device-1")?.online).toBe(false);
  });

  it("keeps pairing codes one-time and TTL-gated", async () => {
    const { path } = await tempPath("pairing");
    let clock = 1_000_000;
    const store = createSqliteRelayStore(path, () => clock);
    stores.push(store);

    const code = store.createPairingCode("console-1", 10_000);
    expect(store.consumePairingCode(code)).toEqual({ code, consoleId: "console-1" });
    // One-time: second consume must fail.
    expect(store.consumePairingCode(code)).toBeUndefined();

    const expired = store.createPairingCode("console-1", 10_000);
    clock += 20_000;
    expect(store.consumePairingCode(expired)).toBeUndefined();
  });
});
