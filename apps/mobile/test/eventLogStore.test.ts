import { describe, expect, it } from "vitest";
import { EventLogStore, MAX_EVENT_LOG, parseEventLog } from "../src/notify/eventLogStore";
import type { NotificationEvent } from "../src/notify/classifier";
import type { SecureStoreApi } from "../src/data/tokenStore";

function memoryApi(initial: Record<string, string> = {}): SecureStoreApi & { dump(): Record<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    getItemAsync: async (k) => map.get(k) ?? null,
    setItemAsync: async (k, v) => void map.set(k, v),
    deleteItemAsync: async (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

function ev(kind: string, i: number): NotificationEvent {
  return { kind: kind as NotificationEvent["kind"], dedupeKey: `${kind}-${i}`, receivedAt: i };
}

describe("eventLogStore", () => {
  it("round-trips events and caps at MAX_EVENT_LOG", async () => {
    const api = memoryApi();
    const store = new EventLogStore(api);
    const many = Array.from({ length: MAX_EVENT_LOG + 30 }, (_, i) => ev("turn-complete", i));
    await store.writeAll(many);
    const readBack = await store.read();
    expect(readBack).toHaveLength(MAX_EVENT_LOG);
    expect(readBack[0]?.dedupeKey).toBe(`turn-complete-${30}`);
  });

  it("parses leniently: corrupt JSON / non-objects / missing kind are dropped", () => {
    expect(parseEventLog(null)).toEqual([]);
    expect(parseEventLog("{oops")).toEqual([]);
    expect(parseEventLog(JSON.stringify([1, "x", { nope: 1 }, { kind: "approval-waiting" }]))).toEqual([
      { kind: "approval-waiting" },
    ]);
  });

  it("read failures degrade to empty list", async () => {
    const store = new EventLogStore({
      getItemAsync: async () => {
        throw new Error("locked");
      },
      setItemAsync: async () => {},
      deleteItemAsync: async () => {},
    });
    await expect(store.read()).resolves.toEqual([]);
  });
});
