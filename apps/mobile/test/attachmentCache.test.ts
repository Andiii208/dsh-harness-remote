import { describe, expect, it } from "vitest";
import { createAttachmentCache } from "../src/data/attachmentCache";

describe("createAttachmentCache", () => {
  it("evicts the least-recently-used entry when over capacity", () => {
    const cache = createAttachmentCache(2);
    cache.put("a", { mediaType: "image/png", data: "1" });
    cache.put("b", { mediaType: "image/png", data: "2" });
    // 触摸 a → b 变成 LRU
    expect(cache.get("a")?.data).toBe("1");
    cache.put("c", { mediaType: "image/png", data: "3" });
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")?.data).toBe("1");
    expect(cache.get("c")?.data).toBe("3");
    expect(cache.size()).toBe(2);
  });

  it("get on missing key returns undefined without growing", () => {
    const cache = createAttachmentCache(4);
    expect(cache.get("nope")).toBeUndefined();
    expect(cache.size()).toBe(0);
  });
});
