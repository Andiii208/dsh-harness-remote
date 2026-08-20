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
  startRemoteAccess,
  type RemoteAccessHandle,
  type RemoteAccessMode,
  type RemoteAccessOptions,
} from "./remote-access.js";

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
  error: string | null;
  lastLogs: string[];
}

export interface RemoteAccessService {
  start(mode?: RemoteAccessMode, dshBaseUrl?: string): Promise<RemoteStatus>;
  stop(): Promise<RemoteStatus>;
  status(): RemoteStatus;
}

export interface RemoteAccessServiceOptions {
  autoDetectDsh?: boolean;
  onStatus?: (line: string) => void;
  /** 注入 startRemoteAccess（测试用）。 */
  startImpl?: (opts: RemoteAccessOptions) => Promise<RemoteAccessHandle>;
  /** 注入二维码生成（测试用）。 */
  qrDataUrlImpl?: (payload: string) => Promise<string>;
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
          await handle.attachDsh(baseUrl);
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
        const h = await startImpl({
          mode,
          dshBaseUrl: dshBaseUrl ?? null,
          autoDetectDsh: options.autoDetectDsh ?? true,
          onStatus: pushLog,
          onPaired: (info) => {
            status = { ...status, pairedDeviceId: info.deviceId };
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

  async function stop(): Promise<RemoteStatus> {
    if (dshRetryTimer) {
      clearTimeout(dshRetryTimer);
      dshRetryTimer = null;
    }
    if (handle) {
      const h = handle;
      handle = null;
      await h.stop().catch(() => {});
    }
    status = { ...status, running: false, starting: false, code: null, qrPayload: null, qrDataUrl: null, pairedDeviceId: null, dshUrl: null, dshDetected: false };
    return status;
  }

  return { start, stop, status: () => status };
}
