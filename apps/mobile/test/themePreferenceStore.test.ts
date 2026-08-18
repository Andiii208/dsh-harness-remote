import { describe, expect, it } from "vitest";
import {
  ThemePreferenceStore,
  THEME_PREFERENCE_KEY,
  type ThemePreference,
} from "../src/data/themePreferenceStore";
import type { SecureStoreApi } from "../src/data/tokenStore";

function stubApi(): SecureStoreApi & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async getItemAsync(key) {
      return store.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      store.set(key, value);
    },
    async deleteItemAsync(key) {
      store.delete(key);
    },
  };
}

describe("ThemePreferenceStore", () => {
  it("defaults to light when nothing is stored", async () => {
    expect(await new ThemePreferenceStore(stubApi()).get()).toBe("light");
  });

  it("round-trips a preference", async () => {
    const api = stubApi();
    const store = new ThemePreferenceStore(api);
    await store.set("dark");
    expect(await store.get()).toBe("dark");
    expect(api.store.get(THEME_PREFERENCE_KEY)).toBe('{"preference":"dark"}');
  });

  it("falls back to light on corrupted values", async () => {
    const api = stubApi();
    api.store.set(THEME_PREFERENCE_KEY, "not-json");
    expect(await new ThemePreferenceStore(api).get()).toBe("light");
  });

  it("accepts only light/dark/system", async () => {
    const api = stubApi();
    api.store.set(THEME_PREFERENCE_KEY, JSON.stringify({ preference: "neon" }));
    expect(await new ThemePreferenceStore(api).get()).toBe("light");
    for (const pref of ["light", "dark", "system"] as ThemePreference[]) {
      await new ThemePreferenceStore(api).set(pref);
      expect(await new ThemePreferenceStore(api).get()).toBe(pref);
    }
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
    const store = new ThemePreferenceStore(failing);
    await expect(store.get()).resolves.toBe("light");
    await expect(store.set("dark")).resolves.toBeUndefined();
  });
});
