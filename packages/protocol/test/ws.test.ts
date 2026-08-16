import { describe, expect, it } from "vitest";
import { WsDownlink, type WsCtor, type WsLike } from "../src/ws.js";

class FakeWs implements WsLike {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = 0;
  closed = false;
  sent: unknown[] = [];
  constructor(public url: string) {
    FakeWs.instances.push(this);
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  static instances: FakeWs[] = [];
}

function fakeCtor(): WsCtor {
  FakeWs.instances = [];
  return FakeWs;
}

async function collect(iter: AsyncIterable<unknown>, n: number): Promise<unknown[]> {
  const out: unknown[] = [];
  const it = iter[Symbol.asyncIterator]();
  for (let i = 0; i < n; i++) {
    const r = await it.next();
    if (r.done) break;
    out.push(r.value);
  }
  return out;
}

describe("WsDownlink", () => {
  it("opens two streams and resolves ready when both open", async () => {
    const ws = new WsDownlink("ws://h/mux", "ws://h/host", fakeCtor());
    expect(FakeWs.instances).toHaveLength(2);
    expect(FakeWs.instances.map((w) => w.url)).toEqual(["ws://h/mux", "ws://h/host"]);
    FakeWs.instances[0]?.open();
    FakeWs.instances[1]?.open();
    await expect(ws.ready).resolves.toBeUndefined();
  });

  it("rejects ready when a stream closes before both opened", async () => {
    const ws = new WsDownlink("ws://h/mux", "ws://h/host", fakeCtor());
    FakeWs.instances[0]?.close();
    await expect(ws.ready).rejects.toThrow(/before both streams opened/);
  });

  it("merges frames from both streams, decoding via codec", async () => {
    const ws = new WsDownlink("ws://h/mux", "ws://h/host", fakeCtor());
    const frames = collect(ws.events, 2);
    FakeWs.instances[0]?.onmessage?.({ data: JSON.stringify({ type: "session/event", sessionId: "s1" }) });
    FakeWs.instances[1]?.onmessage?.({ data: JSON.stringify({ type: "session/registry", action: "added" }) });
    const got = await frames;
    expect(got).toMatchObject([
      { type: "session/event", sessionId: "s1" },
      { type: "session/registry", action: "added" },
    ]);
  });

  it("degrades unknown frame types", async () => {
    const ws = new WsDownlink("ws://h/mux", "ws://h/host", fakeCtor());
    const frames = collect(ws.events, 1);
    FakeWs.instances[0]?.onmessage?.({ data: JSON.stringify({ type: "brand/new" }) });
    const got = await frames;
    expect(got[0]).toMatchObject({ type: "unknown" });
  });

  it("never sends: no send path exists and no socket receives messages", async () => {
    const ws = new WsDownlink("ws://h/mux", "ws://h/host", fakeCtor());
    ws.close();
    for (const w of FakeWs.instances) {
      expect((w as unknown as { sent: unknown[] }).sent).toEqual([]);
    }
  });

  it("close() closes both sockets", async () => {
    const ws = new WsDownlink("ws://h/mux", "ws://h/host", fakeCtor());
    ws.close();
    expect(FakeWs.instances.every((w) => w.closed)).toBe(true);
  });

  it("handles Blob message data", async () => {
    const ws = new WsDownlink("ws://h/mux", "ws://h/host", fakeCtor());
    const frames = collect(ws.events, 1);
    FakeWs.instances[0]?.onmessage?.({ data: new Blob([JSON.stringify({ type: "task/event" })]) });
    const got = await frames;
    expect(got[0]).toMatchObject({ type: "task/event" });
  });

  it("still delivers string frames when the Blob global is absent", async () => {
    const orig = (globalThis as { Blob?: unknown }).Blob;
    try {
      (globalThis as { Blob?: unknown }).Blob = undefined;
      const ws = new WsDownlink("ws://h/mux", "ws://h/host", fakeCtor());
      const frames = collect(ws.events, 2);
      // 字符串帧：主路径
      FakeWs.instances[0]?.onmessage?.({ data: JSON.stringify({ type: "session/event", sessionId: "s1" }) });
      // 非字符串帧：Blob 缺失时旧代码会在 instanceof Blob 处抛 ReferenceError
      FakeWs.instances[1]?.onmessage?.({ data: new Uint8Array([123, 125]).buffer });
      const got = await frames;
      expect(got[0]).toMatchObject({ type: "session/event", sessionId: "s1" });
      expect(got[1]).toMatchObject({ type: "unknown" });
    } finally {
      (globalThis as { Blob?: unknown }).Blob = orig;
    }
  });
});
