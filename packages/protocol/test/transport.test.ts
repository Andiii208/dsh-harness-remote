import { beforeEach, describe, expect, it } from "vitest";
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

/** Opens shortly after construction (simulates a real accepting server). */
class AutoOpenWs extends FakeWs {
  constructor(url: string) {
    super(url);
    setTimeout(() => this.open(), 0);
  }
}

/** Closes immediately without opening. */
class ClosingWs extends FakeWs {
  constructor(url: string) {
    super(url);
    setTimeout(() => this.close(), 0);
  }
}

/** Never opens (handshake timeout path). */
class NeverWs extends FakeWs {}

function describeOk(): typeof fetch {
  return (async (_url, init) => {
    const req = JSON.parse(String(init?.body)) as { rpcId: string };
    return new Response(
      JSON.stringify({ rpcId: req.rpcId, ok: true, result: { name: "dsh", version: "0.1.0-rc.5" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
}

function describeFail(): typeof fetch {
  return (async (_url, init) => {
    const req = JSON.parse(String(init?.body)) as { rpcId: string };
    return new Response(
      JSON.stringify({ rpcId: req.rpcId, ok: false, error: { code: "UNAUTHORIZED", message: "no" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
}

describe("LanTransport.connect", () => {
  beforeEach(() => {
    FakeWs.instances = [];
  });

  it("handshakes: opens both streams + host.describe ok, returns connection", async () => {
    const transport = new LanTransport({ fetchImpl: describeOk(), wsImpl: AutoOpenWs });
    const conn = await transport.connect({ host: "192.168.1.5", port: 3080 }, {});
    expect(FakeWs.instances.map((w) => w.url)).toEqual([
      "http://192.168.1.5:3080/api/events.mux",
      "http://192.168.1.5:3080/api/events.host",
    ]);
    expect(conn).toBeDefined();
    expect(typeof conn.unary).toBe("function");
  });

  it("fails the handshake when host.describe is not ok", async () => {
    const transport = new LanTransport({ fetchImpl: describeFail(), wsImpl: AutoOpenWs });
    await expect(transport.connect({ host: "h", port: 3080 }, {})).rejects.toMatchObject({
      name: "RpcError",
      code: "UNAUTHORIZED",
    });
    // streams released on failure
    expect(FakeWs.instances.every((w) => w.closed)).toBe(true);
  });

  it("releases both streams when ready rejects (socket died pre-open)", async () => {
    const transport = new LanTransport({ fetchImpl: describeOk(), wsImpl: ClosingWs });
    await expect(transport.connect({ host: "h", port: 3080 }, {})).rejects.toThrow(
      /before both streams opened/,
    );
    expect(FakeWs.instances.every((w) => w.closed)).toBe(true);
  });

  it("times out when streams never open", async () => {
    const transport = new LanTransport({
      fetchImpl: describeOk(),
      wsImpl: NeverWs,
      handshakeTimeoutMs: 30,
    });
    await expect(transport.connect({ host: "h", port: 3080 }, {})).rejects.toThrow(
      /did not open before handshake timeout/,
    );
    expect(FakeWs.instances.every((w) => w.closed)).toBe(true);
  });

  it("reports the describe result via onDescribe", async () => {
    let got: unknown;
    const transport = new LanTransport({
      fetchImpl: describeOk(),
      wsImpl: AutoOpenWs,
      onDescribe: (d) => {
        got = d;
      },
    });
    await transport.connect({ host: "h", port: 3080 }, {});
    expect(got).toMatchObject({ name: "dsh" });
  });
});
