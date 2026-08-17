import { describe, expect, it } from "vitest";
import { DraftStore } from "../src/discovery/draftStore";
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

describe("DraftStore", () => {
  it("returns null when nothing stored", async () => {
    expect(await new DraftStore(memStore()).get()).toBeNull();
  });

  it("persists and reads a draft", async () => {
    const api = memStore();
    const s = new DraftStore(api);
    await s.set("192.168.1.7", 3080);
    expect(await s.get()).toEqual({ host: "192.168.1.7", port: 3080 });
  });

  it("tolerates corrupted json", async () => {
    const api = memStore();
    await api.setItemAsync("dsh-connect-draft", "nope");
    expect(await new DraftStore(api).get()).toBeNull();
  });

  it("rejects invalid drafts (empty host / bad port)", async () => {
    const api = memStore();
    const s = new DraftStore(api);
    await s.set("  ", 3080);
    await s.set("192.168.1.5", NaN);
    await s.set("192.168.1.5", -1);
    await s.set("192.168.1.5", 70000);
    expect(api.map.has("dsh-connect-draft")).toBe(false);
  });

  it("persists relay drafts with port 0 (R1 remote-first)", async () => {
    const api = memStore();
    const s = new DraftStore(api);
    await s.set("relay.example.com", 0);
    expect(await s.get()).toEqual({ host: "relay.example.com", port: 0 });
  });
});
