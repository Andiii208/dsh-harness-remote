import { describe, expect, it } from "vitest";
import { LanTransport } from "../src/transport.js";
import type { WsCtor, WsLike } from "../src/ws.js";

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
    // Simulate a server that accepts immediately (real WS opens async).
    setTimeout(() => this.open(), 0);
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
  static fresh(): WsCtor {
    FakeWs.instances = [];
    return FakeWs;
  }
}

function describeOk(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ rpcId: "r", ok: true, result: { name: "dsh", version: "0.1.0-rc.5" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

function describeFail(): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({ rpcId: "r", ok: false, error: { code: "UNAUTHORIZED", message: "no" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
}

describe("LanTransport.connect", () => {
  it("handshakes: opens both streams + host.describe ok, returns connection", async () => {
    const describe = describeOk();
    const transport = new LanTransport({ fetchImpl: describe, wsImpl: FakeWs.fresh() });
    const conn = await transport.connect({ host: "192.168.1.5", port: 3080 }, {});
    expect(FakeWs.instances.map((w) => w.url)).toEqual([
      "http://192.168.1.5:3080/api/events.mux",
      "http://192.168.1.5:3080/api/events.host",
    ]);
    expect(conn).toBeDefined();
    expect(typeof conn.unary).toBe("function");
  });

  it("fails the handshake when host.describe is not ok", async () => {
    const transport = new LanTransport({ fetchImpl: describeFail(), wsImpl: FakeWs.fresh() });
    await expect(transport.connect({ host: "h", port: 3080 }, {})).rejects.toMatchObject({
      name: "RpcError",
      code: "UNAUTHORIZED",
    });
    // streams released on failure
    expect(FakeWs.instances.every((w) => w.closed)).toBe(true);
  });

  it("reports the describe result via onDescribe", async () => {
    let got: unknown;
    const transport = new LanTransport({
      fetchImpl: describeOk(),
      wsImpl: FakeWs.fresh(),
      onDescribe: (d) => {
        got = d;
      },
    });
    await transport.connect({ host: "h", port: 3080 }, {});
    expect(got).toMatchObject({ name: "dsh" });
  });
});
