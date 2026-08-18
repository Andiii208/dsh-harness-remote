/**
 * remote-access.ts — P1a 宿主侧「开启/关闭远程访问」可复用逻辑。
 *
 * 供 DSH 宿主命令/面板直接调用：启动内置 relay → 注册 console →
 * 取一次性 6 位配对码 → 返回地址/码/二维码载荷；关闭时统一清理。
 * CLI（`dsh-remote remote`）与 Windows 双击 bat 作为后备路径复用本模块，
 * 不弹终端的面板实现只需 import 本模块。
 */

import type { ChildProcess } from "node:child_process";
import { networkInterfaces } from "node:os";
import { createRelayServer } from "relay";
import { buildRemotePairPayload } from "@dsh-remote/protocol";
import { RelayClient } from "./relay-client.js";
import { DshBridge, detectDshApiUrl } from "./dsh-bridge.js";
import { startCloudflaredTunnel, type TunnelHandle } from "./tunnel.js";

export type RemoteAccessMode = "tunnel" | "lan";

export interface RemoteAccessOptions {
  /** 连接模式。默认 `tunnel`（公网，cloudflared quick tunnel）；`lan` = 局域网直连。 */
  mode?: RemoteAccessMode;
  /** 手机可达的展示地址（LAN 模式）；缺省自动选择局域网 IPv4，找不到时回退 127.0.0.1。 */
  host?: string;
  /** 首选 relay 端口；默认 4090，被占用自动选空闲端口。 */
  port?: number;
  /** 配对成功回调（宿主面板可弹提示）。 */
  onPaired?: (info: { deviceId: string }) => void;
  /** 显式指定 DSH API baseUrl（如 http://127.0.0.1:56734）。 */
  dshBaseUrl?: string | null;
  /** 未显式指定 baseUrl 时，是否自动探测 DSH_WEB_URL / 默认端口。CLI 默认开启。 */
  autoDetectDsh?: boolean;
  /** DSH 桥接状态日志（CLI/设置页日志用）。 */
  onStatus?: (line: string) => void;
  /** cloudflared 二进制路径（测试/离线注入用）。 */
  cloudflaredBin?: string;
  /** cloudflared 下载目录（缺省 $DSH_HOME/dsh-harness-remote/bin）。 */
  cloudflaredBinDir?: string;
  /** 隧道建立超时（毫秒），默认 30s。 */
  tunnelTimeoutMs?: number;
  /** 注入 cloudflared spawn（测试用）。 */
  tunnelSpawnImpl?: (cmd: string, args: string[]) => ChildProcess;
}

export interface RemoteAccessHandle {
  /** 展示给手机填写的地址：LAN 模式为裸 IP（如 192.168.1.13），tunnel 模式为 https://xxx.trycloudflare.com。 */
  host: string;
  /** 实际 relay 监听端口。 */
  port: number;
  /** 手机可填写的完整 relay URL（LAN：ws://<host>:<port>；tunnel：wss://xxx.trycloudflare.com）。 */
  url: string;
  /** 一次性 6 位配对码。 */
  code: string;
  /** 扫码连接载荷（dshremote://remote?addr=...&code=...&port=...）。 */
  qrPayload: string;
  /** 已连接的 DSH API baseUrl；未连接为 null。 */
  dshUrl: string | null;
  /** 连接模式。 */
  mode: RemoteAccessMode;
  /** tunnel 模式下的公网访问 URL（https://xxx.trycloudflare.com）；LAN 模式为 null。 */
  publicUrl: string | null;
  /** 关闭远程访问并释放 tunnel/relay/console/DSH 桥接资源。 */
  stop(): Promise<void>;
}

/** 选取一个适合手机访问的局域网 IPv4 地址（与 CLI 同策略）。 */
export function lanIp(): string | undefined {
  const interfaces = networkInterfaces();
  const candidates: Array<{ addr: string; score: number }> = [];
  for (const [name, nets] of Object.entries(interfaces)) {
    const lower = name.toLowerCase();
    // 跳过虚拟/容器网卡，避免把 Docker/WSL/Hyper-V 的地址打印给手机。
    if (/(docker|vethernet|hyper-v|virtualbox|vmware|wsl|loopback|bluetooth)/.test(lower)) continue;
    for (const net of nets ?? []) {
      if (net.family !== "IPv4" || net.internal) continue;
      const a = net.address;
      let score = 0;
      if (a.startsWith("192.168.")) score = 4;
      else if (a.startsWith("10.")) score = 3;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a)) score = 2;
      else score = 1;
      if (/(wi-fi|wlan|ethernet|以太)/.test(lower)) score += 1;
      candidates.push({ addr: a, score });
    }
  }
  candidates.sort((x, y) => y.score - x.score);
  return candidates[0]?.addr;
}

/**
 * 开启远程访问：启动 relay + console + 取 6 位码。
 * 返回句柄；调用方负责在面板关闭时调用 `stop()`。
 */
export async function startRemoteAccess(
  opts: RemoteAccessOptions = {},
): Promise<RemoteAccessHandle> {
  const mode = opts.mode ?? "tunnel";
  // tunnel 模式只监听回环（公网入口由 cloudflared 承担）；LAN 模式监听所有网卡。
  const relayHost = mode === "tunnel" ? "127.0.0.1" : "0.0.0.0";
  const relay = createRelayServer({ host: relayHost });
  let port = opts.port ?? 4090;
  try {
    await relay.start(port);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
      await relay.start(0);
    } else {
      throw err;
    }
  }
  // 实际监听端口（port 0 / 被占用自动分配后以 relay.port 为准）。
  if (relay.port > 0) port = relay.port;

  const clientId = `console-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  let peerId: string | undefined;
  const client = new RelayClient({
    url: `ws://127.0.0.1:${port}`,
    clientId,
    kind: "console",
    onPaired: (info) => {
      peerId = info.deviceId;
      opts.onPaired?.({ deviceId: info.deviceId });
    },
  });

  let bridge: DshBridge | null = null;
  let tunnel: TunnelHandle | null = null;
  try {
    await client.connect();
    const code = await client.requestPairCode();

    // 计算手机侧地址/二维码载荷。
    let host: string;
    let url: string;
    let publicUrl: string | null = null;
    if (mode === "tunnel") {
      opts.onStatus?.("正在开启公网隧道…");
      tunnel = await startCloudflaredTunnel({
        localPort: port,
        binPath: opts.cloudflaredBin,
        binDir: opts.cloudflaredBinDir,
        timeoutMs: opts.tunnelTimeoutMs,
        spawnImpl: opts.tunnelSpawnImpl,
        logger: (line) => opts.onStatus?.(line),
      });
      publicUrl = tunnel.publicUrl;
      host = publicUrl;
      url = publicUrl.replace(/^https:/, "wss:");
      opts.onStatus?.(`公网隧道已开启：${publicUrl}`);
    } else {
      host = opts.host ?? lanIp() ?? "127.0.0.1";
      url = `ws://${host}:${port}`;
    }
    const qrPayload = buildRemotePairPayload({ addr: url, code, ...(mode === "lan" ? { port } : {}) });

    // DSH API 桥接：显式 baseUrl 优先；否则按选项自动探测。
    const baseUrl = opts.dshBaseUrl ?? (opts.autoDetectDsh ? await detectDshApiUrl(undefined, opts.onStatus) : null);
    if (baseUrl) {
      bridge = new DshBridge({
        baseUrl,
        relay: client,
        getPeerId: () => peerId,
        onStatus: opts.onStatus,
        onError: (err) => opts.onStatus?.(`DSH 桥接错误：${err instanceof Error ? err.message : String(err)}`),
      });
      await bridge.start();
    } else if (opts.autoDetectDsh) {
      opts.onStatus?.("未检测到 DSH API：会话列表将为空，手机端只能连接但看不到会话。");
    }

    return {
      host,
      port,
      url,
      code,
      qrPayload,
      dshUrl: baseUrl,
      mode,
      publicUrl,
      stop: async () => {
        bridge?.stop();
        client.close();
        if (tunnel) {
          try {
            await tunnel.stop();
          } catch {
            /* ignore */
          }
        }
        await relay.stop();
      },
    };
  } catch (err) {
    bridge?.stop();
    client.close();
    if (tunnel) {
      try {
        await tunnel.stop();
      } catch {
        /* ignore */
      }
    }
    await relay.stop();
    throw err;
  }
}
