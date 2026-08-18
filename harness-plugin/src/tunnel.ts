/**
 * tunnel.ts — cloudflared quick tunnel 管理。
 *
 * 目标：把本地 relay（127.0.0.1:<port>）暴露成 `https://xxx.trycloudflare.com`。
 * - 零账号、零服务器：用户电脑上只需有 cloudflared 二进制（找不到则自动下载）。
 * - URL 每次重启轮换，是天然的一次性公网入口；真正的门禁仍是 relay 的
 *   6 位配对码 + E2E 加密。
 *
 * 纯函数（parseTunnelUrl / cloudflaredAsset / candidateBinPaths）便于单测；
 * spawn/fetch 均可注入，避免单测真的去下载或起隧道。
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir, platform as nodePlatform, arch as nodeArch } from "node:os";
import { delimiter as pathDelimiter, join } from "node:path";

export interface TunnelHandle {
  /** 公网访问 URL（https://xxx.trycloudflare.com，不带路径）。 */
  publicUrl: string;
  /** 关闭隧道并结束 cloudflared 子进程。 */
  stop(): Promise<void>;
}

export interface TunnelOptions {
  /** 本地 relay 监听端口。 */
  localPort: number;
  /** 显式指定 cloudflared 二进制路径（跳过查找/下载）。 */
  binPath?: string;
  /** 二进制存放目录（下载用）。默认 $DSH_HOME/dsh-harness-remote/bin。 */
  binDir?: string;
  /** 等待公网 URL 的超时（毫秒）。默认 30s。 */
  timeoutMs?: number;
  /** 注入 fetch（下载二进制用，测试可换 fake）。 */
  fetchImpl?: typeof fetch;
  /** 注入 spawn（测试可换 fake child）。 */
  spawnImpl?: (cmd: string, args: string[]) => ChildProcess;
  logger?: (line: string) => void;
}

/** 从 cloudflared 的 stdout 里解析 quick tunnel URL。 */
export function parseTunnelUrl(line: string): string | null {
  const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return m ? m[0] : null;
}

/** 各平台 cloudflared 官方下载资产。 */
export function cloudflaredAsset(
  platform: string = nodePlatform(),
  arch: string = nodeArch(),
): { name: string; url: string; extract: "none" | "tgz" } | null {
  const base = "https://github.com/cloudflare/cloudflared/releases/latest/download";
  if (platform === "win32") {
    if (arch === "x64") return { name: "cloudflared.exe", url: `${base}/cloudflared-windows-amd64.exe`, extract: "none" };
    if (arch === "arm64") return { name: "cloudflared.exe", url: `${base}/cloudflared-windows-arm64.exe`, extract: "none" };
    return null;
  }
  if (platform === "darwin") {
    if (arch === "x64") return { name: "cloudflared.tgz", url: `${base}/cloudflared-darwin-amd64.tgz`, extract: "tgz" };
    if (arch === "arm64") return { name: "cloudflared.tgz", url: `${base}/cloudflared-darwin-arm64.tgz`, extract: "tgz" };
    return null;
  }
  if (platform === "linux") {
    if (arch === "x64") return { name: "cloudflared", url: `${base}/cloudflared-linux-amd64`, extract: "none" };
    if (arch === "arm64") return { name: "cloudflared", url: `${base}/cloudflared-linux-arm64`, extract: "none" };
    return null;
  }
  return null;
}

/** 候选二进制路径（先 PATH，再插件目录）。 */
export function candidateBinPaths(
  home: string = process.env.DSH_HOME ?? join(homedir(), ".dsh"),
  platform: string = nodePlatform(),
  envPath: string | undefined = process.env.PATH,
  delimiter: string = pathDelimiter,
): string[] {
  const names = platform === "win32" ? ["cloudflared.exe"] : ["cloudflared"];
  const dirs = (envPath ?? "").split(delimiter).filter(Boolean);
  const candidates: string[] = [];
  for (const dir of dirs) {
    for (const n of names) candidates.push(join(dir, n));
  }
  for (const n of names) {
    candidates.push(join(home, "dsh-harness-remote", "bin", n));
  }
  return candidates;
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find((p) => existsSync(p));
}

async function downloadBin(
  asset: { name: string; url: string; extract: "none" | "tgz" },
  binDir: string,
  fetchImpl: typeof fetch,
  logger?: (line: string) => void,
): Promise<string> {
  await mkdir(binDir, { recursive: true });
  const target = join(binDir, asset.name);
  logger?.(`正在下载 cloudflared：${asset.url}`);
  const res = await fetchImpl(asset.url);
  if (!res.ok) throw new Error(`cloudflared 下载失败：HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(target, buf);
  if (asset.extract === "none") {
    await chmod(target, 0o755).catch(() => {});
    return target;
  }
  // macOS 资产是 tgz，解包后得到同名二进制文件。
  const { spawn: spawnTar } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawnTar("tar", ["-xzf", target, "-C", binDir]);
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`tar 解包失败：exit ${code}`))));
  });
  const binPath = join(binDir, "cloudflared");
  await chmod(binPath, 0o755).catch(() => {});
  return binPath;
}

/** 确保 cloudflared 可用：优先已存在/可下载；返回可执行路径。 */
export async function ensureCloudflared(
  opts: {
    binPath?: string;
    binDir?: string;
    home?: string;
    fetchImpl?: typeof fetch;
    logger?: (line: string) => void;
  } = {},
): Promise<string> {
  const explicit = opts.binPath ?? process.env.CLOUDFLARED_PATH;
  if (explicit && existsSync(explicit)) return explicit;

  const found = firstExisting(candidateBinPaths(opts.home, nodePlatform()));
  if (found) return found;

  const asset = cloudflaredAsset();
  if (!asset) throw new Error(`当前平台（${nodePlatform()}/${nodeArch()}）没有 cloudflared 官方构建，请手动安装后设置 CLOUDFLARED_PATH`);

  const binDir = opts.binDir ?? join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "dsh-harness-remote", "bin");
  return downloadBin(asset, binDir, opts.fetchImpl ?? fetch, opts.logger);
}

/**
 * 启动 cloudflared quick tunnel，把本地端口暴露成 trycloudflare.com 公网 URL。
 * 直到解析出公网 URL 才 resolve；超时/进程退出/启动失败 reject。
 */
export async function startCloudflaredTunnel(opts: TunnelOptions): Promise<TunnelHandle> {
  const logger = opts.logger ?? (() => {});
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const spawnImpl = opts.spawnImpl ?? spawn;

  const binPath = await ensureCloudflared({
    binPath: opts.binPath,
    binDir: opts.binDir,
    fetchImpl: opts.fetchImpl,
    logger,
  });

  const args = ["tunnel", "--url", `http://127.0.0.1:${opts.localPort}`, "--no-autoupdate"];
  logger(`cloudflared tunnel --url http://127.0.0.1:${opts.localPort}`);

  const child = spawnImpl(binPath, args);
  let settled = false;

  const cleanup = () => {
    if (child && !child.killed) {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }
  };

  return new Promise<TunnelHandle>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("公网隧道建立超时：请检查网络/代理后重试，或手动安装 cloudflared"));
      }
    }, timeoutMs);

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(err);
    };

    const onStdout = (chunk: Buffer | string) => {
      const text = String(chunk);
      for (const line of text.split(/\r?\n/)) {
        const url = parseTunnelUrl(line);
        if (url && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            publicUrl: url,
            stop: async () => {
              cleanup();
            },
          });
          return;
        }
      }
    };

    // cloudflared 的日志（含 trycloudflare URL 行）走 stderr；stdout 也可能有数据。
    // 两个流都同时用于解析 URL 和记录日志，避免只监听 stdout 导致 URL 被漏掉。
    child.stdout?.on("data", onStdout);
    child.stderr?.on("data", onStdout);
    child.once("error", (err) => fail(new Error(`cloudflared 启动失败：${err.message}`)));
    child.once("exit", (code) => {
      if (!settled) {
        fail(new Error(`cloudflared 已退出（exit ${code}）——公网隧道未建立`));
      }
    });
  });
}

/** 停止隧道（句柄的 stop 已实现，此函数保留为显式 API 的便捷入口）。 */
export async function stopTunnel(handle: TunnelHandle): Promise<void> {
  await handle.stop();
}
