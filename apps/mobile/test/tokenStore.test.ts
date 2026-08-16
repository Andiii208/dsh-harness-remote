import { describe, expect, it } from "vitest";
import { TokenStore, TOKEN_KEY, type SecureStoreApi } from "../src/data/tokenStore.js";

function stubApi(): SecureStoreApi & { store: Map<string, string>; calls: string[] } {
  const store = new Map<string, string>();
  const calls: string[] = [];
  return {
    store,
    calls,
    async getItemAsync(key) {
      calls.push(`get:${key}`);
      return store.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      calls.push(`set:${key}`);
      store.set(key, value);
    },
    async deleteItemAsync(key) {
      calls.push(`del:${key}`);
      store.delete(key);
    },
  };
}

describe("TokenStore", () => {
  it("round-trips a token", async () => {
    const api = stubApi();
    const ts = new TokenStore(api);
    expect(await ts.get()).toBeNull();
    await ts.set("pair-tok-1");
    expect(await ts.get()).toBe("pair-tok-1");
    expect(api.store.get(TOKEN_KEY)).toBe("pair-tok-1");
  });

  it("clears the token", async () => {
    const api = stubApi();
    const ts = new TokenStore(api);
    await ts.set("pair-tok-1");
    await ts.clear();
    expect(await ts.get()).toBeNull();
  });

  it("treats empty values as absent", async () => {
    const api = stubApi();
    api.store.set(TOKEN_KEY, "");
    expect(await new TokenStore(api).get()).toBeNull();
  });

  it("never throws on storage failures", async () => {
    const failing: SecureStoreApi = {
      async getItemAsync() {
        throw new Error("native unavailable");
      },
      async setItemAsync() {
        throw new Error("native unavailable");
      },
      async deleteItemAsync() {
        throw new Error("native unavailable");
      },
    };
    const ts = new TokenStore(failing);
    await expect(ts.get()).resolves.toBeNull();
    await expect(ts.set("x")).resolves.toBeUndefined();
    await expect(ts.clear()).resolves.toBeUndefined();
  });
});
