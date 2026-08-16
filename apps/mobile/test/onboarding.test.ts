import { describe, expect, it } from "vitest";
import { OnboardingStore } from "../src/discovery/onboardingStore";
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

describe("OnboardingStore", () => {
  it("starts unseen and persists after markSeen", async () => {
    const api = memStore();
    const s = new OnboardingStore(api);
    expect(await s.seen()).toBe(false);
    await s.markSeen();
    expect(await s.seen()).toBe(true);
    expect(api.map.get("dsh-seen-onboarding")).toBe("1");
  });

  it("assumes seen when storage is unavailable (web fallback, no redirect loop)", async () => {
    const broken: SecureStoreApi = {
      getItemAsync: async () => {
        throw new Error("SecureStore unavailable");
      },
      setItemAsync: async () => {},
      deleteItemAsync: async () => {},
    };
    expect(await new OnboardingStore(broken).seen()).toBe(true);
  });
});
