import { describe, expect, it } from "vitest";
import {
  RelayDeviceStore,
  RELAY_DEVICE_KEY,
  type RelayDeviceRecord,
  type RelayDeviceStorage,
} from "../src/relay/relayDeviceStore";

function stubStorage(initial?: Record<string, string>): RelayDeviceStorage & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    store,
    async getItemAsync(key) {
      return store.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      store.set(key, value);
    },
  };
}

function failingStorage(): RelayDeviceStorage {
  return {
    async getItemAsync() {
      throw new Error("secure-store unavailable");
    },
    async setItemAsync() {
      throw new Error("secure-store unavailable");
    },
  };
}

describe("RelayDeviceStore", () => {
  it("degrades without throwing when storage is unavailable", async () => {
    const store = new RelayDeviceStore(failingStorage());
    const record = await store.getOrCreate();

    expect(record.deviceId.length).toBeGreaterThan(0);
    expect(record.deviceId.startsWith("relay-device-")).toBe(true);
    expect(record.privateKeyJwk === null || typeof record.privateKeyJwk === "object").toBe(true);
    expect(record.publicKeyJwk === null || typeof record.publicKeyJwk === "object").toBe(true);
  });

  it("reads the same deviceId and keys back from the same storage key", async () => {
    const storage = stubStorage();
    const store1 = new RelayDeviceStore(storage);
    const r1: RelayDeviceRecord = await store1.getOrCreate();

    expect(storage.store.has(RELAY_DEVICE_KEY)).toBe(true);

    const store2 = new RelayDeviceStore(storage);
    const r2 = await store2.getOrCreate();

    expect(r2.deviceId).toBe(r1.deviceId);
    expect(r2.privateKeyJwk).toEqual(r1.privateKeyJwk);
    expect(r2.publicKeyJwk).toEqual(r1.publicKeyJwk);
  });

  it("regenerates when persisted JSON is corrupted", async () => {
    const storage = stubStorage({ [RELAY_DEVICE_KEY]: "{not-json" });
    const store = new RelayDeviceStore(storage);
    const record = await store.getOrCreate();

    expect(record.deviceId.length).toBeGreaterThan(0);
    expect(() => JSON.parse(storage.store.get(RELAY_DEVICE_KEY) ?? "")).not.toThrow();
    expect(JSON.parse(storage.store.get(RELAY_DEVICE_KEY) ?? "")).toMatchObject({
      deviceId: record.deviceId,
    });
  });
});
