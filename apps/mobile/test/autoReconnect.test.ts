import { describe, expect, it } from "vitest";
import { AutoReconnectStore } from "../src/discovery/autoReconnectStore";
import type { SecureStoreApi } from "../src/data/tokenStore";

function memStore(): SecureStoreApi & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => void map.set(k, v),
    deleteItemAsync: async (k) => void map.delete(k),
  };
}

describe("AutoReconnectStore", () => {
  it("defaults to enabled", async () => {
    expect(await new AutoReconnectStore(memStore()).enabled()).toBe(true);
  });

  it("persists disable and re-enable", async () => {
    const api = memStore();
    const s = new AutoReconnectStore(api);
    await s.setEnabled(false);
    expect(await s.enabled()).toBe(false);
    await s.setEnabled(true);
    expect(await s.enabled()).toBe(true);
  });
});
