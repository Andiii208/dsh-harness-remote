/**
 * apply.ts — DSH bundle 插件入口（host 侧）。
 *
 * 行为（对齐 dsh-pocket）：
 * - 插件加载后**默认不自动开启公网隧道**（安全默认）；用户可在 DSH 设置页
 *   「手机远程」手动开启公网/局域网访问。
 * - 注册 loopback RPC 通道 `dsh-harness-remote`，设置页由此读取状态/启停。
 * - ctx.effect 注册清理：插件卸载时关闭 relay/tunnel/console/DSH 桥接。
 *
 * 注意：设置页 UI 在 `client/`（web 侧注入）；本文件只负责 host 侧能力。
 */

import type { RemoteAccessMode } from "./remote-access.js";
import {
  createRemoteAccessService,
  type RemoteAccessService,
} from "./remote-service.js";
import { installRemoteRpc } from "./web-rpc.js";

export const name = "dsh-harness-remote";
/** host 侧需要的 Cordis 上下文注入：connection（loopback RPC）。 */
export const inject = ["connection"];

export interface DshRemoteApplyContext {
  logger?: (name: string) => { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };
  connection?: {
    rpc?: {
      handle?: (
        channel: string,
        handler: (endpoint: string, payload: Record<string, unknown>, signal?: { aborted?: boolean }) => Promise<unknown>,
        opts?: { authority?: string },
      ) => () => void;
    };
  };
  effect?: (dispose: () => (() => void | Promise<void>) | void | Promise<(() => void | Promise<void>) | void>, label?: string) => void;
}

export interface DshRemoteApplyOptions {
  /** 启动模式：tunnel（默认公网）/ lan（局域网直连）。 */
  mode?: RemoteAccessMode;
  /** 是否自动探测并桥接本机 DSH API。默认 true。 */
  autoDetectDsh?: boolean;
}

export interface DshRemoteInternals {
  service?: RemoteAccessService;
  installRpc?: typeof installRemoteRpc;
  /** 测试时把自动启动关掉，避免真实起 relay/tunnel。 */
  autoStart?: boolean;
}

export function apply(
  ctx: DshRemoteApplyContext,
  config: DshRemoteApplyOptions = {},
  internals: DshRemoteInternals = {},
): () => void {
  const logger = ctx.logger?.("dsh-harness-remote") ?? console;
  const service =
    internals.service ??
    createRemoteAccessService({
      autoDetectDsh: config.autoDetectDsh ?? true,
      onStatus: (line) => logger.info?.(line),
    });

  const disposeRpc = (internals.installRpc ?? installRemoteRpc)(ctx, service, logger);

  // 安全默认：插件加载不自动开公网隧道；只有显式 autoStart:true（或测试注入）才自动启动。
  // 用户可在 DSH 设置页「手机远程」手动开启公网/局域网访问。
  if (internals.autoStart === true) {
    void service.start(config.mode ?? "tunnel").catch((err: unknown) => {
      logger.warn?.(`dsh-harness-remote: 自动开启远程失败：${err instanceof Error ? err.message : String(err)}`);
    });
  }

  ctx.effect?.(() => async () => {
    disposeRpc();
    await service.stop();
  }, "dsh-harness-remote: stop remote access");

  // 返回 dispose 供不支持 ctx.effect 的宿主显式调用。
  return () => {
    disposeRpc();
    void service.stop();
  };
}
