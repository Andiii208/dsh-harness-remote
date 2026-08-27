import { EventEmitter } from "node:events";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ChildProcess } from "node:child_process";
import {
  candidateBinPaths,
  cloudflaredAsset,
  killTunnelProcess,
  parseTunnelUrl,
  startCloudflaredTunnel,
} from "../src/tunnel.js";

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  kill(): boolean {
    this.killed = true;
    return true;
  }
}

function fakeSpawn(): FakeChild {
  return new FakeChild();
}

const asChildProcess = (child: FakeChild): ChildProcess => child as unknown as ChildProcess;

describe("parseTunnelUrl", () => {
  it("extracts trycloudflare URLs from cloudflared stdout", () => {
    expect(parseTunnelUrl("2026-08-18T00:00:00Z INF  |  https://abc-123.trycloudflare.com")).toBe(
      "https://abc-123.trycloudflare.com",
    );
    expect(parseTunnelUrl("no url here")).toBeNull();
  });
});

describe("cloudflaredAsset", () => {
  it("returns known assets for supported platforms", () => {
    expect(cloudflaredAsset("win32", "x64")?.extract).toBe("none");
    expect(cloudflaredAsset("darwin", "arm64")?.extract).toBe("tgz");
    expect(cloudflaredAsset("linux", "x64")?.extract).toBe("none");
    expect(cloudflaredAsset("freebsd", "x64")).toBeNull();
  });
});

describe("candidateBinPaths", () => {
  it("searches PATH then plugin bin dir", () => {
    const paths = candidateBinPaths("C:\\Users\\me\\.dsh", "win32", "C:\\bin;D:\\tools", ";");
    // 实现用 node:path.join 拼接，Windows/Linux 的路径分隔符不同；用同一个 join 生成期望值。
    expect(paths[0]).toBe(join("C:\\bin", "cloudflared.exe"));
    expect(paths.some((p) => p.includes(join("dsh-harness-remote", "bin", "cloudflared.exe")))).toBe(true);
  });
});

describe("startCloudflaredTunnel", () => {
  it("resolves with public URL from stdout and stops child", async () => {
    const child = fakeSpawn();
    const promise = startCloudflaredTunnel({
      localPort: 4090,
      binPath: process.execPath,
      timeoutMs: 1000,
      spawnImpl: () => asChildProcess(child),
    });
    // 先启动，再模拟 stdout 输出公网 URL。
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from("INF |  https://hello-42.trycloudflare.com\n"));
    });
    const handle = await promise;
    expect(handle.publicUrl).toBe("https://hello-42.trycloudflare.com");
    await handle.stop();
    expect(child.killed).toBe(true);
  });

  it("rejects when child exits before URL appears", async () => {
    const child = fakeSpawn();
    const promise = startCloudflaredTunnel({
      localPort: 4090,
      binPath: process.execPath,
      timeoutMs: 5000,
      spawnImpl: () => asChildProcess(child),
    });
    queueMicrotask(() => child.emit("exit", 1));
    await expect(promise).rejects.toThrow(/cloudflared 已退出/);
  });

  it("rejects on timeout", async () => {
    const child = fakeSpawn();
    const promise = startCloudflaredTunnel({
      localPort: 4090,
      binPath: process.execPath,
      timeoutMs: 10,
      spawnImpl: () => asChildProcess(child),
    });
    await expect(promise).rejects.toThrow(/超时/);
  });

  it("restarts the child with backoff after crash once URL was established (A4)", async () => {
    const spawned: FakeChild[] = [];
    const logs: string[] = [];
    const urlUpdates: string[] = [];
    const promise = startCloudflaredTunnel({
      localPort: 4090,
      binPath: process.execPath,
      timeoutMs: 5000,
      restartDelayMs: 10,
      maxRestarts: 2,
      spawnImpl: () => {
        const c = fakeSpawn();
        spawned.push(c);
        return asChildProcess(c);
      },
      logger: (l) => logs.push(l),
      onUrlUpdate: (u) => urlUpdates.push(u),
    });
    await queueMicrotask(() => {});
    const first = spawned[0]!;
    first.stdout.emit("data", Buffer.from("INF |  https://first.trycloudflare.com\n"));
    const handle = await promise;
    expect(handle.publicUrl).toBe("https://first.trycloudflare.com");

    // 崩溃 → 自动重启出新 child，并从新 child 的 stdout 解析到新 URL。
    first.emit("exit", 1);
    await waitFor(() => expect(spawned.length).toBe(2));
    const second = spawned[1]!;
    expect(second.killed).toBe(false);
    second.stdout.emit("data", Buffer.from("INF |  https://second-abc.trycloudflare.com\n"));
    await waitFor(() => expect(urlUpdates).toEqual(["https://second-abc.trycloudflare.com"]));
    expect(logs.some((l) => /自动重启隧道/.test(l))).toBe(true);

    await handle.stop();
    expect(second.killed).toBe(true);
  });

  it("reports fatal after exhausting bounded retries instead of dying silently", async () => {
    const spawned: FakeChild[] = [];
    const fatals: string[] = [];
    const promise = startCloudflaredTunnel({
      localPort: 4090,
      binPath: process.execPath,
      timeoutMs: 5000,
      restartDelayMs: 5,
      maxRestarts: 2,
      spawnImpl: () => {
        const c = fakeSpawn();
        spawned.push(c);
        return asChildProcess(c);
      },
      onFatal: (err) => fatals.push(err.message),
    });
    await queueMicrotask(() => {});
    spawned[0]!.stdout.emit("data", Buffer.from("INF |  https://doomed.trycloudflare.com\n"));
    const handle = await promise;

    for (let round = 0; round < 3; round += 1) {
      await waitFor(() => expect(spawned.length).toBeGreaterThanOrEqual(round + 1));
      spawned[round]!.emit("exit", 2);
    }
    await waitFor(() => expect(fatals).toHaveLength(1));
    expect(fatals[0]).toMatch(/已自动重启 2 次仍失败/);
    await handle.stop();
  });

  it("killTunnelProcess uses taskkill tree-kill on Windows", async () => {
    const child = new FakeChild() as unknown as ChildProcess & { pid?: number };
    child.pid = 4242;
    const calls: Array<{ cmd: string; args: string[] }> = [];
    killTunnelProcess(child, "win32", (cmd, args, onDone) => {
      calls.push({ cmd, args });
      onDone();
    });
    expect(child.killed).toBe(false); // Windows 不走 child.kill，走 taskkill 树杀
    expect(calls).toEqual([{ cmd: "taskkill", args: ["/pid", "4242", "/T", "/F"] }]);
  });
});

async function waitFor(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  assertion();
}
