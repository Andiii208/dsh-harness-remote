/**
 * persist.ts — 远程开关的持久化（审计 2026-08-23 P0-1）。
 *
 * 之前「开启远程」只改内存状态，DSH Desktop 每次重启后远程必然归零，
 * 手机端每天都要人肉重新开启 + 重新扫码。现在把用户的意愿落到
 * `<DSH_HOME>/dsh-harness-remote/config.json`：
 * - 设置页 start/stop 同步写盘；
 * - 插件加载（apply）时读取，enabled=true 则按上次模式自启。
 *
 * 审计 2026-08-27 A2 扩展：consoleId 与 console 端 ECDH 密钥也落盘。
 * 重启后复用同一 console 身份与同一把私钥（配合 device 端已持久化的
 * 公钥），LAN 模式下手机回连无需重新扫码即可恢复加密数据面。
 *
 * 安全默认不变：从未开启过的安装不会有配置文件 → 不会自动开隧道。
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { RemoteAccessMode } from "./remote-access.js";

export interface RemotePersistedConfig {
  /** 用户是否开启了远程访问（stop 时写 false，start 成功后写 true）。 */
  enabled?: boolean;
  /** 上次使用的模式（tunnel / lan），重启自启时复用。 */
  mode?: RemoteAccessMode;
  /** 稳定的 console clientId：跨重启不变，relay 配对绑定不因重启失效。 */
  consoleId?: string;
  /** console 端 ECDH P-256 私钥 JWK：跨重启解密能力不断档。 */
  ecdhPrivateJwk?: JsonWebKey;
  /** 已配对 device 的公钥 JWK：pair.ack 时捕获，下次启动直接派生会话密钥。 */
  ecdhPeerPublicJwk?: JsonWebKey;
}

function isPlausiblePublicJwk(v: unknown): v is JsonWebKey {
  return (
    typeof v === "object" && v !== null && !Array.isArray(v) &&
    typeof (v as { kty?: unknown }).kty === "string"
  );
}

/** 配置文件默认路径：<DSH_HOME>/dsh-harness-remote/config.json。 */
export function defaultConfigPath(): string {
  return join(
    process.env.DSH_HOME ?? join(homedir(), ".dsh"),
    "dsh-harness-remote",
    "config.json",
  );
}

/** 读取持久化配置；文件缺失/损坏/字段非法时返回 null（宽容降级，绝不抛错）。 */
export function readPersistedConfig(path: string = defaultConfigPath()): RemotePersistedConfig | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const rec = parsed as Record<string, unknown>;
    const out: RemotePersistedConfig = {};
    if (typeof rec.enabled === "boolean") out.enabled = rec.enabled;
    if (rec.mode === "tunnel" || rec.mode === "lan") out.mode = rec.mode;
    if (typeof rec.consoleId === "string" && rec.consoleId.length > 0) out.consoleId = rec.consoleId;
    if (isPlausiblePublicJwk(rec.ecdhPrivateJwk)) out.ecdhPrivateJwk = rec.ecdhPrivateJwk;
    if (isPlausiblePublicJwk(rec.ecdhPeerPublicJwk)) out.ecdhPeerPublicJwk = rec.ecdhPeerPublicJwk;
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

/** 原子写入持久化配置（tmp + rename）；目录不存在自动创建。 */
export function writePersistedConfig(config: RemotePersistedConfig, path: string = defaultConfigPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}
