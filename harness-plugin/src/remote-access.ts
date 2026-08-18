/**
 * remote-access.ts — P1a 宿主侧「开启/关闭远程访问」可复用逻辑。
 *
 * 供 DSH 宿主命令/面板直接调用：启动内置 relay → 注册 console →
 * 取一次性 6 位配对码 → 返回地址/码/二维码载荷；关闭时统一清理。
 * CLI（`dsh-remote remote`）与 Windows 双击 bat 作为后备路径复用本模块，
 * 不弹终端的面板实现只需 import 本模块。
 */

import { networkInterfaces } from "node:os";
import { createRelayServer } from "relay";
import { buildRemotePairPayload } from "@dsh-remote/protocol";
import { RelayClient } from "./relay-client.js";

export interface RemoteAccessOptions {
  /** 手机可达的展示地址；缺省自动选择局域网 IPv4，找不到时回退 127.0.0.1。 */
  host?: string;
  /** 首选 relay 端口；默认 4090，被占用自动选空闲端口。 */
  port?: number;
  /** 配对成功回调（宿主面板可弹提示）。 */
  onPaired?: (info: { deviceId: string }) => void;
}

export interface RemoteAccessHandle {
  /** 展示给手机填写的地址（不含 ws:// 前缀，如 192.168.1.13）。 */
  host: string;
  /** 实际 relay 监听端口。 */
  port: number;
  /** 手机可填写的完整 relay URL（ws://<host>:<port>）。 */
  url: string;
  /** 一次性 6 位配对码。 */
  code: string;
  /** 扫码连接载荷（dshremote://remote?addr=...&code=...）。 */
  qrPayload: string;
  /** 关闭远程访问并释放 relay/console 资源。 */
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
  const relay = createRelayServer({ host: "0.0.0.0" });
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

  const host = opts.host ?? lanIp() ?? "127.0.0.1";
  const clientId = `console-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const client = new RelayClient({
    url: `ws://127.0.0.1:${port}`,
    clientId,
    kind: "console",
    onPaired: (info) => opts.onPaired?.({ deviceId: info.deviceId }),
  });

  try {
    await client.connect();
    const code = await client.requestPairCode();
    const url = `ws://${host}:${port}`;
    const qrPayload = buildRemotePairPayload({ addr: host, code });
    return {
      host,
      port,
      url,
      code,
      qrPayload,
      stop: async () => {
        client.close();
        await relay.stop();
      },
    };
  } catch (err) {
    client.close();
    await relay.stop();
    throw err;
  }
}
