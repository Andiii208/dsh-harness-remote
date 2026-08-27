/**
 * remote-service.ts — 远程访问服务（供 DSH 设置页 RPC 与 CLI 共用）。
 *
 * 把「开启/停止远程访问」封装成一个带状态快照的服务：
 * - start(mode)：tunnel（默认，cloudflared 公网）或 lan（局域网直连）。
 * - stop()：释放 relay/tunnel/console/DSH 桥接。
 * - status()：返回可序列化给设置页的状态（含二维码 data URL）。
 */

import QRCode from "qrcode";
import {
  generateRelayKeyPair,
} from "@dsh-remote/protocol";
import {
  startRemoteAccess,
  type RemoteAccessHandle,
  type RemoteAccessMode,
  type RemoteAccessOptions,
} from "./remote-access.js";
import type { RemotePersistedConfig } from "./persist.js";

export interface RemoteStatus {
  running: boolean;
  starting: boolean;
  mode: RemoteAccessMode | null;
  /** 展示地址：tunnel 为 https://xxx.trycloudflare.com；lan 为裸 IP。 */
  host: string | null;
  port: number | null;
  /** 手机端连接 URL：tunnel 为 wss://…；lan 为 ws://…。 */
  url: string | null;
  /** 一次性 6 位配对码（仅 loopback RPC 可读，设置页展示）。 */
  code: string | null;
  qrPayload: string | null;
  /** 二维码 PNG data URL（宿主生成，设置页直接 <img> 渲染）。 */
  qrDataUrl: string | null;
  dshUrl: string | null;
  dshDetected: boolean;
  pairedDeviceId: string | null;
  /** console→relay 控制面在线状态（A3 自动重连语义下的真实健康度）。 */
  relayOnline?: boolean;
  error: string | null;
  lastLogs: string[];
}

export interface RemoteAccessService {
  start(mode?: RemoteAccessMode, dshBaseUrl?: string): Promise<RemoteStatus>;
  /** 用户显式停止：释放资源，并把持久化开关写回 enabled=false。 */
  stop(): Promise<RemoteStatus>;
  /**
   * 宿主/插件卸载时的清理（审计 2026-08-27 A1）：只释放资源，绝不动持久化配置。
   * 之前 cleanup 走 stop() 会把用户「保持开启」的意愿抹成 enabled=false，
   * 导致 DSH Desktop 优雅退出后远程永不自启（只有崩溃才意外保住）。
   */
  dispose(): Promise<RemoteStatus>;
  status(): RemoteStatus;
}

export interface RemoteAccessServiceOptions {
  autoDetectDsh?: boolean;
  onStatus?: (line: string) => void;
  /** 注入 startRemoteAccess（测试用）。 */
  startImpl?: (opts: RemoteAccessOptions) => Promise<RemoteAccessHandle>;
  /** 注入二维码生成（测试用）。 */
  qrDataUrlImpl?: (payload: string) => Promise<string>;
  /**
   * 开关持久化（审计 2026-08-23 P0-1）：start 成功写 {enabled:true,mode}，
   * stop 写 {enabled:false}。缺省不持久化（CLI/测试路径零影响）；
   * DSH 插件入口（apply.ts）显式注入文件实现。
   */
  persist?: {
    read(): RemotePersistedConfig | null;
    write(config: RemotePersistedConfig): void;
  };
  /** 注入 consoleId 生成器（测试用）；缺省用时间戳+随机后缀。 */
  generateConsoleId?: () => string;
  /** 注入 ECDH 私钥生成（测试用）；返回 null 表示不持久化密钥。 */
  generateEcdhPrivateJwk?: () => Promise<JsonWebKey | null>;
}

const EMPTY_STATUS: RemoteStatus = {
  running: false,
  starting: false,
  mode: null,
  host: null,
  port: null,
  url: null,
  code: null,
  qrPayload: null,
  qrDataUrl: null,
  dshUrl: null,
  dshDetected: false,
  pairedDeviceId: null,
  error: null,
  lastLogs: [],
};

export function createRemoteAccessService(options: RemoteAccessServiceOptions = {}): RemoteAccessService {
  const startImpl = options.startImpl ?? startRemoteAccess;
  const qrDataUrlImpl = options.qrDataUrlImpl ?? ((payload: string) => QRCode.toDataURL(payload, { width: 512, margin: 1 }));

  let handle: RemoteAccessHandle | null = null;
  let status: RemoteStatus = { ...EMPTY_STATUS };
  let startPromise: Promise<RemoteStatus> | null = null;
  let dshRetryTimer: ReturnType<typeof setTimeout> | null = null;

  const pushLog = (line: string): void => {
    status = { ...status, lastLogs: [...status.lastLogs.slice(-9), line] };
    options.onStatus?.(line);
  };

  /** 合并写入持久化配置：只覆盖 patch 字段，保留 consoleId/密钥等其余内容。 */
  const mergePersisted = (patch: Partial<RemotePersistedConfig>): void => {
    const persist = options.persist;
    if (!persist) return;
    try {
      persist.write({ ...(persist.read() ?? {}), ...patch });
    } catch {
      /* 持久化失败仅降级为「重启后需手动处理」 */
    }
  };

  /** 解析本次启动身份：持久化的 consoleId/ECDH 私钥优先，没有则生成。 */
  const resolveBootIdentity = async (): Promise<{
    consoleId: string;
    ecdhPrivateJwk?: JsonWebKey;
  }> => {
    const persisted = options.persist?.read?.() ?? {};
    const consoleId =
      persisted.consoleId ?? options.generateConsoleId?.() ?? `console-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    if (persisted.ecdhPrivateJwk) return { consoleId, ecdhPrivateJwk: persisted.ecdhPrivateJwk };
    const generated = options.generateEcdhPrivateJwk
      ? await options.generateEcdhPrivateJwk()
      : await generateEphemeralEcdh();
    return generated ? { consoleId, ecdhPrivateJwk: generated } : { consoleId };
  };

  /** 缺省 ECDH 私钥生成（审计 A2）：无 WebCrypto 时返回 null 走旧行为。 */
  const generateEphemeralEcdh = async (): Promise<JsonWebKey | null> => {
    try {
      if (typeof globalThis.crypto === "undefined") return null;
      const pair = await generateRelayKeyPair(globalThis.crypto);
      return pair.privateKeyJwk;
    } catch {
      return null;
    }
  };

  /** 配对时捕获对端公钥落盘，下次启动直接派生会话密钥免等 pair.ack。 */
  const rememberPeerPublicKey = (peerPublicKey: unknown): void => {
    if (!handle || typeof peerPublicKey !== "object" || peerPublicKey === null) return;
    const kty = (peerPublicKey as { kty?: unknown }).kty;
    if (typeof kty !== "string") return;
    mergePersisted({ ecdhPeerPublicJwk: peerPublicKey as JsonWebKey });
  };

  /** 定期重试 DSH API 探测（启动时未检测到 DSH 时的后备机制）。 */
  const scheduleDshRetry = () => {
    if (dshRetryTimer) clearTimeout(dshRetryTimer);
    dshRetryTimer = setTimeout(async () => {
      if (!handle) return;
      // 如果已有明确 baseUrl 或已检测到，跳过
      if (status.dshDetected || status.dshUrl) return;
      try {
        const { detectDshApiUrl } = await import("./dsh-bridge.js");
        const baseUrl = await detectDshApiUrl(undefined, pushLog);
        if (baseUrl && handle) {
          pushLog(`延迟检测到 DSH API：${baseUrl}，正在建立桥接…`);
          await handle.attachDsh?.(baseUrl);
          status = { ...status, dshUrl: baseUrl, dshDetected: true };
          pushLog(`已建立 DSH 桥接：${baseUrl}`);
        } else {
          // 仍未检测到，继续重试
          scheduleDshRetry();
        }
      } catch {
        scheduleDshRetry();
      }
    }, 5000);
  };

  async function start(mode: RemoteAccessMode = "tunnel", dshBaseUrl?: string): Promise<RemoteStatus> {
    if (startPromise) return startPromise;
    // 幂等：已按同模式运行则直接返回当前状态。
    if (status.running && status.mode === mode) return status;

    startPromise = (async () => {
      // 先停掉旧会话（不会递归回到 start）。
      if (handle) {
        await handle.stop().catch(() => {});
        handle = null;
      }
      status = { ...status, starting: true, running: false, error: null, pairedDeviceId: null, code: null, qrPayload: null, qrDataUrl: null };
      try {
        const bootIdentity = await resolveBootIdentity();
        const h = await startImpl({
          mode,
          dshBaseUrl: dshBaseUrl ?? null,
          autoDetectDsh: options.autoDetectDsh ?? true,
          consoleId: bootIdentity.consoleId,
          ...(bootIdentity.ecdhPrivateJwk ? { ecdhPrivateJwk: bootIdentity.ecdhPrivateJwk } : {}),
          onStatus: pushLog,
          onRelayState: (online) => {
            status = { ...status, relayOnline: online };
            pushLog(online ? "relay 控制面已连接" : "与 relay 的控制面已断开（自动重连中）…");
          },
          onPaired: (info) => {
            status = { ...status, pairedDeviceId: info.deviceId };
            rememberPeerPublicKey(info.peerPublicKey);
          },
        });
        handle = h;
        const qrDataUrl = await qrDataUrlImpl(h.qrPayload);
        status = {
          ...status,
          running: true,
          starting: false,
          mode: h.mode,
          host: h.host,
          port: h.port,
          url: h.url,
          code: h.code,
          qrPayload: h.qrPayload,
          qrDataUrl,
          dshUrl: h.dshUrl,
          dshDetected: h.dshUrl !== null,
          error: null,
        };
        // 如果未检测到 DSH API，启动定期重试
        if (!h.dshUrl && !dshBaseUrl) {
          scheduleDshRetry();
        }
        // P0-1/A2：持久化用户意愿与本次身份（consoleId/ECDH 私钥），
        // DSH 重启后按此自启且配对身份不变（合并写，不覆盖其他字段）。
        mergePersisted({
          enabled: true,
          mode: h.mode,
          consoleId: bootIdentity.consoleId,
          ...(bootIdentity.ecdhPrivateJwk ? { ecdhPrivateJwk: bootIdentity.ecdhPrivateJwk } : {}),
        });
        return status;
      } catch (err) {
        status = {
          ...status,
          running: false,
          starting: false,
          mode,
          host: null,
          port: null,
          url: null,
          code: null,
          qrPayload: null,
          qrDataUrl: null,
          dshUrl: null,
          dshDetected: false,
          error: err instanceof Error ? err.message : String(err),
        };
        throw err;
      } finally {
        startPromise = null;
      }
    })();
    return startPromise;
  }

  /** 停止并释放底层资源（relay/tunnel/console/桥接），不动持久化。 */
  const releaseResources = async (): Promise<RemoteStatus> => {
    if (dshRetryTimer) {
      clearTimeout(dshRetryTimer);
      dshRetryTimer = null;
    }
    if (handle) {
      const h = handle;
      handle = null;
      await h.stop().catch(() => {});
    }
    status = { ...status, running: false, starting: false, code: null, qrPayload: null, qrDataUrl: null, pairedDeviceId: null, dshUrl: null, dshDetected: false, relayOnline: false };
    return status;
  };

  async function stop(): Promise<RemoteStatus> {
    const next = await releaseResources();
    // P0-1：用户显式停止才落盘 enabled=false；合并写保留 consoleId/ECDH
    // 密钥与最后模式，下次开启/自启复用同一身份（审计 A2）。
    mergePersisted({ enabled: false, ...(status.mode ? { mode: status.mode } : {}) });
    return next;
  }

  async function dispose(): Promise<RemoteStatus> {
    // 宿主关闭/插件卸载：保留持久化配置，重启后按用户意愿自启（审计 2026-08-27 A1）。
    return releaseResources();
  }

  return { start, stop, dispose, status: () => status };
}
