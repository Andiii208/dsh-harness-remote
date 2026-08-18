/**
 * 插件入口（DSH 宿主侧）——接线骨架。
 *
 * ⚠️ 重要：DSH 为 developer preview（基线 0.1.0-rc.5），插件接缝细节以
 * 真实 harness 的插件文档为准；本文件提供自洽的接线契约（token 签发/
 * 校验/访问决策），并标注了与宿主挂接的假设点，真机校准后修正。
 *
 * 安装（user patch 层，设计 §9：不改宿主源码）：
 *   1. 构建本包（pnpm --filter dsh-harness-remote build）
 *   2. 在 <harness-home>/profiles/<profile>/cordis.patch.yml 中按宿主插件
 *      约定声明本插件入口（见 README.md 详细步骤）
 *   3. 重启 DSH；插件对外暴露两个宿主命令：
 *      - 生成配对 token（返回一次性 token，15 分钟过期）
 *      - 吊销配对
 */

import { PairingTokenStore, type PairingToken } from "./token.js";
import { decideAccess, extractToken, type AccessDecision } from "./gate.js";
import { buildPairPayload } from "@dsh-remote/protocol";

export interface PairingPlugin {
  issueToken(): PairingToken;
  /** 签发新 token 并构造配对深链（dshremote://pair?host&port&token），宿主可打印为 QR。 */
  pairingUrl(host: string, port: number): string;
  revoke(): void;
  /** 对一次 /api 请求做访问决策（宿主中间件调用）。 */
  authorize(req: { isLoopback: boolean; headers: Record<string, string | undefined> }): AccessDecision;
  /** 从请求头提取 token（宿主中间件用）。 */
  extractToken(headers: Record<string, string | undefined>): string | undefined;
  store: PairingTokenStore;
}

export interface PairingPluginOptions {
  ttlMs?: number;
  now?: () => number;
  rand?: () => string;
}

export function createPairingPlugin(opts: PairingPluginOptions = {}): PairingPlugin {
  const store = new PairingTokenStore(opts.now, opts.ttlMs, opts.rand);
  return {
    store,
    issueToken: () => store.issue(),
    pairingUrl: (host, port) => buildPairPayload({ host, port, token: store.issue().token }),
    revoke: () => store.revoke(),
    extractToken: (headers) => extractToken(headers),
    authorize: (req) => decideAccess(req, store),
  };
}
