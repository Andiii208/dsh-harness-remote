import { describe, expect, it } from "vitest";
import { HostStore, MAX_RECENT_HOSTS, type RecentHost } from "../src/discovery/hostStore";
import type { SecureStoreApi } from "../src/data/tokenStore";

function memStore(): SecureStoreApi & { dump(): Record<string, string> } {
  const map = new Map<string, string>();
  return {
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => void map.set(k, v),
    deleteItemAsync: async (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

describe("HostStore", () => {
  it("returns empty list when nothing stored", async () => {
    expect(await new HostStore(memStore()).list()).toEqual([]);
    expect(await new HostStore(memStore()).latest()).toBeNull();
  });

  it("dedupes by host:port and moves to front", async () => {
    const api = memStore();
    const store = new HostStore(api);
    await store.add("192.168.1.5", 3080, "dsh", "tok-5");
    await store.add("192.168.1.6", 3080, "dsh2", "tok-6");
    await store.add("192.168.1.5", 3080); // revisit：保留 name/token
    const list = await store.list();
    expect(list.map((h) => h.host)).toEqual(["192.168.1.5", "192.168.1.6"]);
    expect(list[0]?.name).toBe("dsh");
    expect(list[0]?.token).toBe("tok-5");
    expect(await store.latest()).toMatchObject({ host: "192.168.1.5", port: 3080, token: "tok-5" });
  });

  it("caps the list", async () => {
    const store = new HostStore(memStore());
    for (let i = 0; i < MAX_RECENT_HOSTS + 2; i++) {
      await store.add(`10.0.0.${i}`, 3080);
    }
    const list = await store.list();
    expect(list).toHaveLength(MAX_RECENT_HOSTS);
  });

  it("removes an entry", async () => {
    const store = new HostStore(memStore());
    await store.add("192.168.1.5", 3080);
    await store.add("192.168.1.6", 3080);
    await store.remove("192.168.1.5", 3080);
    const list = await store.list();
    expect(list.map((h) => h.host)).toEqual(["192.168.1.6"]);
  });

  it("tolerates corrupted json", async () => {
    const api = memStore();
    await api.setItemAsync("dsh-recent-hosts", "{oops");
    expect(await new HostStore(api).list()).toEqual([]);
  });

  it("returns the old list when persistence fails (memory/disk consistency)", async () => {
    const api = memStore();
    const store = new HostStore(api);
    await store.add("192.168.1.5", 3080);
    api.setItemAsync = async () => {
      throw new Error("disk full");
    };
    const list = await store.add("192.168.1.6", 3080);
    expect(list.map((h) => h.host)).toEqual(["192.168.1.5"]);
  });
});
