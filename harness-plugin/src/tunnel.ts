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
import { execFile as nodeExecFile } from "node:child_process";
import { createHash } from "node:crypto";
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
  /**
   * 审计 A4：cloudflared 中途崩溃的有界自愈。
   * 默认最多重启 5 次（间隔 3s）；重试期间拿到新 URL 经 onUrlUpdate 上报；
   * 重试耗尽经 onFatal 上报（此前是静默死亡、UI 一直显示运行中）。
   */
  maxRestarts?: number;
  restartDelayMs?: number;
  onUrlUpdate?: (publicUrl: string) => void;
  onFatal?: (err: Error) => void;
}

/** cloudflared 进程退出后的处置决策（纯函数，便于单测）。 */
export type TunnelExitDecision =
  | { action: "ignore" }
  | { action: "reject"; error: Error }
  | { action: "retry"; delayMs: number; attempt: number }
  | { action: "fatal"; error: Error };

export function decideOnTunnelExit(input: {
  stopping: boolean;
  hasPublicUrl: boolean;
  restarts: number;
  maxRestarts: number;
  restartDelayMs: number;
  reason: string;
}): TunnelExitDecision {
  if (input.stopping) return { action: "ignore" };
  const error = new Error(`${input.reason}——公网隧道未建立`);
  if (!input.hasPublicUrl) return { action: "reject", error };
  if (input.restarts >= input.maxRestarts) {
    return {
      action: "fatal",
      error: new Error(`${input.reason}，已自动重启 ${input.restarts} 次仍失败`),
    };
  }
  return { action: "retry", delayMs: input.restartDelayMs, attempt: input.restarts + 1 };
}

type ExecCallback = () => void;
type ExecImpl = (cmd: string, args: string[], onDone: ExecCallback) => void;

const defaultExec: ExecImpl = (cmd, args, onDone) => {
  nodeExecFile(cmd, args, { windowsHide: true }, () => onDone());
};

/**
 * 终止 cloudflared 进程（审计 A5）：Windows 用 taskkill 杀整棵进程树，
 * 避免留下孤儿进程继续占着旧隧道；其他平台直接 kill。
 */
export function killTunnelProcess(
  child: ChildProcess,
  platform: string = nodePlatform(),
  execImpl: ExecImpl = defaultExec,
): void {
  if (platform === "win32" && typeof child.pid === "number") {
    execImpl("taskkill", ["/pid", String(child.pid), "/T", "/F"], () => {});
    return;
  }
  try {
    child.kill();
  } catch {
    /* ignore */
  }
}

/** 从 cloudflared 的 stdout 里解析 quick tunnel URL。 */
export function parseTunnelUrl(line: string): string | null {
  const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return m ? m[0] : null;
}

/**
 * 默认钉住的 cloudflared 版本（审计 C6）。
 * 钉版本让下载物不可变，避免 latest 漂移带来供应链面；可用
 * CLOUDFLARED_VERSION 环境变量覆盖。
 */
export const DEFAULT_CLOUDFLARED_VERSION = "2026.8.2";

function releaseBaseUrl(): string {
  const version = process.env.CLOUDFLARED_VERSION?.trim() || DEFAULT_CLOUDFLARED_VERSION;
  return `https://github.com/cloudflare/cloudflared/releases/download/${version}`;
}

/** 十六进制小写 sha256（C6 校验用）。 */
export function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * 可选完整性校验：上游 GitHub Release 不提供 per-file sha 资产，
 * 因此默认跳过；当用户设置 CLOUDFLARED_SHA256（来自可信渠道）时
 * 强校验，不匹配即拒绝写入二进制（fail closed）。
 */
function assertChecksumIfConfigured(buf: Buffer, logger?: (line: string) => void): void {
  const expected = process.env.CLOUDFLARED_SHA256?.trim().toLowerCase();
  if (!expected) return;
  const actual = sha256Hex(buf);
  if (actual !== expected) {
    throw new Error(`cloudflared 校验失败：实际 ${actual}，期望 ${expected}（拒绝写入二进制）`);
  }
  logger?.(`cloudflared sha256 校验通过：${actual}`);
}

/** 各平台 cloudflared 官方下载资产。 */
export function cloudflaredAsset(
  platform: string = nodePlatform(),
  arch: string = nodeArch(),
  baseUrl: string = releaseBaseUrl(),
): { name: string; url: string; extract: "none" | "tgz" } | null {
  if (platform === "win32") {
    if (arch === "x64") return { name: "cloudflared.exe", url: `${baseUrl}/cloudflared-windows-amd64.exe`, extract: "none" };
    if (arch === "arm64") return { name: "cloudflared.exe", url: `${baseUrl}/cloudflared-windows-arm64.exe`, extract: "none" };
    return null;
  }
  if (platform === "darwin") {
    if (arch === "x64") return { name: "cloudflared.tgz", url: `${baseUrl}/cloudflared-darwin-amd64.tgz`, extract: "tgz" };
    if (arch === "arm64") return { name: "cloudflared.tgz", url: `${baseUrl}/cloudflared-darwin-arm64.tgz`, extract: "tgz" };
    return null;
  }
  if (platform === "linux") {
    if (arch === "x64") return { name: "cloudflared", url: `${baseUrl}/cloudflared-linux-amd64`, extract: "none" };
    if (arch === "arm64") return { name: "cloudflared", url: `${baseUrl}/cloudflared-linux-arm64`, extract: "none" };
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
  assertChecksumIfConfigured(buf, logger);
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
 * 直到解析出公网 URL 才 resolve；超时/启动失败 reject。
 * URL 解析出来之后进程崩溃进入有界自愈：自动重启（默认 ≤5 次、间隔 3s），
 * 新 URL 经 onUrlUpdate 上报；重试耗尽经 onFatal 上报（不再静默死亡）。
 */
export async function startCloudflaredTunnel(opts: TunnelOptions): Promise<TunnelHandle> {
  const logger = opts.logger ?? (() => {});
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const spawnImpl = opts.spawnImpl ?? spawn;
  const maxRestarts = opts.maxRestarts ?? 5;
  const restartDelayMs = opts.restartDelayMs ?? 3_000;

  const binPath = await ensureCloudflared({
    binPath: opts.binPath,
    binDir: opts.binDir,
    fetchImpl: opts.fetchImpl,
    logger,
  });

  const args = ["tunnel", "--url", `http://127.0.0.1:${opts.localPort}`, "--no-autoupdate"];
  logger(`cloudflared tunnel --url http://127.0.0.1:${opts.localPort}`);

  let stopping = false;
  let activeChild: ChildProcess | null = null;
  let publicUrlValue: string | null = null;
  let restarts = 0;

  const stop = async (): Promise<void> => {
    stopping = true;
    if (activeChild && !activeChild.killed) killTunnelProcess(activeChild);
  };

  return new Promise<TunnelHandle>((resolveStartup, rejectStartup) => {
    const startupTimer = setTimeout(() => {
      if (!publicUrlValue) {
        stopping = true;
        if (activeChild && !activeChild.killed) killTunnelProcess(activeChild);
        rejectStartup(new Error("公网隧道建立超时：请检查网络/代理后重试，或手动安装 cloudflared"));
      }
    }, timeoutMs);

    /** 处理子进程退出：未建立→reject；已建立→有界重启/上报致命错误。 */
    const handleExit = (reason: string): void => {
      if (publicUrlValue) {
        const decision = decideOnTunnelExit({
          stopping,
          hasPublicUrl: true,
          restarts,
          maxRestarts,
          restartDelayMs,
          reason,
        });
        if (decision.action === "retry") {
          restarts = decision.attempt;
          logger(`${reason}，${decision.delayMs}ms 后自动重启隧道（第 ${decision.attempt}/${maxRestarts} 次重试）…`);
          setTimeout(() => {
            if (!stopping) wireChild();
          }, decision.delayMs);
        } else if (decision.action === "fatal") {
          logger(decision.error.message);
          opts.onFatal?.(decision.error);
        }
      } else if (!stopping) {
        clearTimeout(startupTimer);
        stopping = true;
        rejectStartup(new Error(`${reason}——公网隧道未建立`));
      }
    };

    const wireChild = (): ChildProcess => {
      const child = spawnImpl(binPath, args);
      activeChild = child;
      // cloudflared 的日志（含 trycloudflare URL 行）走 stderr；两个流都解析。
      const onStdout = (chunk: Buffer | string) => {
        for (const line of String(chunk).split(/\r?\n/)) {
          const url = parseTunnelUrl(line);
          if (!url || stopping) continue;
          if (!publicUrlValue) {
            publicUrlValue = url;
            clearTimeout(startupTimer);
            resolveStartup({ publicUrl: url, stop });
          } else if (url !== publicUrlValue) {
            publicUrlValue = url;
            logger(`公网隧道地址已变更：${url}（手机端需重新扫码或更新地址）`);
            opts.onUrlUpdate?.(url);
          }
        }
      };
      child.stdout?.on("data", onStdout);
      child.stderr?.on("data", onStdout);
      child.once("error", (err) => handleExit(`cloudflared 启动失败：${err.message}`));
      child.once("exit", (code) => handleExit(`cloudflared 已退出（exit ${code}）`));
      return child;
    };

    wireChild();
  });
}

/** 停止隧道（句柄的 stop 已实现，此函数保留为显式 API 的便捷入口）。 */
export async function stopTunnel(handle: TunnelHandle): Promise<void> {
  await handle.stop();
}
