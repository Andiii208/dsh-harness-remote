import { describe, expect, it } from "vitest";
import {
  APPROVAL_HISTORY_KEY,
  ApprovalHistoryStore,
  type ApprovalHistoryEntry,
} from "../src/data/approvalHistoryStore";

function memoryApi(initial?: string) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set(APPROVAL_HISTORY_KEY, initial);
  return {
    store,
    api: {
      getItemAsync: async (key: string) => store.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => {
        store.set(key, value);
      },
      deleteItemAsync: async (key: string) => {
        store.delete(key);
      },
    },
  };
}

const entry = (over: Partial<ApprovalHistoryEntry> = {}): ApprovalHistoryEntry => ({
  rpcId: "r1",
  kind: "approval",
  prompt: "允许执行？",
  result: { approved: true },
  respondedAt: 1000,
  ...over,
});

describe("ApprovalHistoryStore", () => {
  it("records entries and returns them newest-first", async () => {
    const { api } = memoryApi();
    const s = new ApprovalHistoryStore(api);
    await s.record(entry({ rpcId: "r1", respondedAt: 1000 }));
    await s.record(entry({ rpcId: "r2", respondedAt: 2000, result: { approved: false } }));
    const list = await s.list();
    expect(list.map((e) => e.rpcId)).toEqual(["r2", "r1"]);
    expect(list[0]).toMatchObject({ rpcId: "r2", kind: "approval", result: { approved: false } });
  });

  it("persists as JSON and tolerates corrupted storage", async () => {
    const { api } = memoryApi("not-json");
    const s = new ApprovalHistoryStore(api);
    expect(await s.list()).toEqual([]);
  });

  it("drops malformed entries on read", async () => {
    const { api } = memoryApi(JSON.stringify([{ bad: true }, { rpcId: "ok", kind: "question", respondedAt: 1 }]));
    const s = new ApprovalHistoryStore(api);
    const list = await s.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.rpcId).toBe("ok");
  });

  it("caps history at 100 entries and never throws on write failure", async () => {
    const { api } = memoryApi();
    const s = new ApprovalHistoryStore(api);
    for (let i = 0; i < 110; i++) {
      await s.record(entry({ rpcId: `r${i}`, respondedAt: i }));
    }
    const list = await s.list();
    expect(list).toHaveLength(100);
    expect(list[0]?.rpcId).toBe("r109");

    const failing = new ApprovalHistoryStore({
      getItemAsync: async () => null,
      setItemAsync: async () => {
        throw new Error("disk full");
      },
      deleteItemAsync: async () => {},
    });
    await expect(failing.record(entry())).resolves.toBeUndefined();
    await expect(failing.list()).resolves.toEqual([]);
  });
});
