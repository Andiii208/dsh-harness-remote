import { describe, expect, it } from "vitest";
import { createLocalStorageApi } from "../src/data/webStorageApi";

function stubStorage() {
  const map = new Map<string, string>();
  return {
    storage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
    map,
  };
}

describe("createLocalStorageApi", () => {
  it("round-trips values through localStorage", async () => {
    const { storage } = stubStorage();
    const api = createLocalStorageApi(() => storage as Storage);
    await api.setItemAsync("k", JSON.stringify({ preference: "dark" }));
    expect(await api.getItemAsync("k")).toBe(JSON.stringify({ preference: "dark" }));
    await api.deleteItemAsync("k");
    expect(await api.getItemAsync("k")).toBeNull();
  });

  it("returns null for missing keys", async () => {
    const { storage } = stubStorage();
    const api = createLocalStorageApi(() => storage as Storage);
    expect(await api.getItemAsync("missing")).toBeNull();
  });

  it("rejects when localStorage is unavailable so callers fall back", async () => {
    const api = createLocalStorageApi(() => undefined);
    await expect(api.getItemAsync("k")).rejects.toThrow("localStorage unavailable");
    await expect(api.setItemAsync("k", "v")).rejects.toThrow("localStorage unavailable");
    await expect(api.deleteItemAsync("k")).rejects.toThrow("localStorage unavailable");
  });
});
