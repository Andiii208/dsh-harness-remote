import { describe, expect, it } from "vitest";
import { CaptureError, recordTraffic } from "../src/record.js";
import type { WsCtor, WsLike } from "../src/ws-lite.js";

class FakeWs implements WsLike {
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = 0;
  closed = false;
  static instances: FakeWs[] = [];
  constructor(public url: string) {
    FakeWs.instances.push(this);
  }
  close(): void {
    this.closed = true;
    this.readyState = 3;
    this.onclose?.();
  }
  static fresh(): WsCtor {
    FakeWs.instances = [];
    return FakeWs;
  }
}

const describeOk = (async () =>
  new Response(
    JSON.stringify({ rpcId: "capture", ok: true, result: { name: "dsh", version: "0.1.0-rc.5" } }),
    { status: 200, headers: { "content-type": "application/json" } },
  )) as typeof fetch;

describe("recordTraffic", () => {
  it("records probes and ws frames into a fixture", async () => {
    const p = recordTraffic({
      host: "127.0.0.1",
      port: 3080,
      durationMs: 80,
      fetchImpl: describeOk,
      wsImpl: FakeWs.fresh(),
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(FakeWs.instances).toHaveLength(2);
    expect(FakeWs.instances.map((w) => w.url)).toEqual([
      "ws://127.0.0.1:3080/api/events.mux",
      "ws://127.0.0.1:3080/api/events.host",
    ]);
    FakeWs.instances[0]?.onmessage?.({ data: JSON.stringify({ type: "session/event", sessionId: "s1" }) });
    FakeWs.instances[1]?.onmessage?.({ data: JSON.stringify({ type: "session/registry", action: "added" }) });
    const fixture = await p;

    expect(fixture.unaryResponses).toHaveLength(1);
    expect(fixture.unaryResponses[0]).toMatchObject({ method: "host.describe", response: { ok: true } });
    expect(fixture.meta.describe).toMatchObject({ name: "dsh" });
    expect(fixture.meta.baselineVersion).toBe("0.1.0-rc.5");
    expect(fixture.wsFrames).toMatchObject([
      { stream: "mux", frame: { type: "session/event", sessionId: "s1" } },
      { stream: "host", frame: { type: "session/registry", action: "added" } },
    ]);
    // sockets closed after the window
    expect(FakeWs.instances.every((w) => w.closed)).toBe(true);
  });

  it("records ok:false probe responses", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          rpcId: "capture",
          ok: false,
          error: { code: "UNAUTHORIZED", message: "no" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as typeof fetch;
    const fixture = await recordTraffic({
      host: "h",
      port: 3080,
      durationMs: 1,
      fetchImpl,
      wsImpl: FakeWs.fresh(),
    });
    expect(fixture.unaryResponses[0]?.response).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("throws CaptureError when a probe fails", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    await expect(
      recordTraffic({ host: "h", port: 3080, durationMs: 1, fetchImpl, wsImpl: FakeWs.fresh() }),
    ).rejects.toBeInstanceOf(CaptureError);
  });
});
