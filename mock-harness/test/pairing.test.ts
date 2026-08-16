/**
 * 配对围栏模拟（M2-T4）：配置 pairToken 后，HTTP 与 WS 均要求配对 token。
 */

import { afterEach, describe, expect, it } from "vitest";
import { createMockHarness, type MockHarness } from "../src/index.js";
import { loadFixtureDir } from "../src/fixture-loader.js";
import { fileURLToPath } from "node:url";

const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));
const harnesses: MockHarness[] = [];
afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((h) => h.stop()));
});

async function pairingHarness(token: string, enforce = true): Promise<MockHarness> {
  const all = await loadFixtureDir(fixturesDir);
  const selected = all.filter((f) => JSON.stringify(f).includes("sessions"));
  const h = await createMockHarness(selected, { port: 0, pairToken: token, enforcePairing: enforce });
  await h.start();
  harnesses.push(h);
  return h;
}

function post(base: string, path: string, body: unknown, token?: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
}

describe("mock-harness pairing fence", () => {
  it("rejects unauthenticated API calls when pairToken is configured", async () => {
    const h = await pairingHarness("pair-tok-1");
    const res = await post(h.url, "/api/host.describe", { rpcId: "a", method: "host.describe", payload: {} });
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ rpcId: "a", ok: false, error: { code: "UNAUTHORIZED" } });
  });

  it("rejects wrong tokens", async () => {
    const h = await pairingHarness("pair-tok-1");
    const res = await post(h.url, "/api/host.describe", { rpcId: "a", method: "host.describe", payload: {} }, "wrong");
    expect(((await res.json()) as Record<string, unknown>).ok).toBe(false);
  });

  it("accepts the correct token", async () => {
    const h = await pairingHarness("pair-tok-1");
    const res = await post(h.url, "/api/host.describe", { rpcId: "a", method: "host.describe", payload: {} }, "pair-tok-1");
    expect(((await res.json()) as Record<string, unknown>).ok).toBe(true);
  });

  it("rejects WS upgrades without the pairToken query", async () => {
    const h = await pairingHarness("pair-tok-1");
    const ws = new WebSocket(`${h.url.replace(/^http/, "ws")}/api/events.mux`);
    const opened = await new Promise<boolean>((resolve) => {
      ws.onopen = () => resolve(true);
      ws.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 2000);
    });
    expect(opened).toBe(false);
  });

  it("accepts WS upgrades with the pairToken query", async () => {
    const h = await pairingHarness("pair-tok-1");
    const ws = new WebSocket(`${h.url.replace(/^http/, "ws")}/api/events.mux?pairToken=pair-tok-1`);
    const opened = await new Promise<boolean>((resolve) => {
      ws.onopen = () => resolve(true);
      ws.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 2000);
    });
    expect(opened).toBe(true);
    ws.close();
  });

  it("exempts loopback requests (trust fence preserved)", async () => {
    // enforce=false（默认语义）：回环连接无需 token
    const h = await pairingHarness("pair-tok-1", false);
    const res = await post(h.url, "/api/host.describe", { rpcId: "a", method: "host.describe", payload: {} });
    expect(((await res.json()) as Record<string, unknown>).ok).toBe(true);

    const ws = new WebSocket(`${h.url.replace(/^http/, "ws")}/api/events.mux`);
    const opened = await new Promise<boolean>((resolve) => {
      ws.onopen = () => resolve(true);
      ws.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 2000);
    });
    expect(opened).toBe(true);
    ws.close();
  });

  it("does not enforce pairing when pairToken is unset", async () => {
    const all = await loadFixtureDir(fixturesDir);
    const h = await createMockHarness(all, { port: 0 });
    await h.start();
    harnesses.push(h);
    const res = await post(h.url, "/api/host.describe", { rpcId: "a", method: "host.describe", payload: {} });
    expect(((await res.json()) as Record<string, unknown>).ok).toBe(true);
  });

  it("answers CORS preflight and adds CORS headers", async () => {
    const all = await loadFixtureDir(fixturesDir);
    const h = await createMockHarness(all, { port: 0 });
    await h.start();
    harnesses.push(h);
    const pre = await fetch(h.url, { method: "OPTIONS" });
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("*");
    const res = await post(h.url, "/api/host.describe", { rpcId: "a", method: "host.describe", payload: {} });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
