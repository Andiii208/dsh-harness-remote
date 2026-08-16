/**
 * hostStore — 最近主机持久化（P2）。
 * SecureStore（Keychain/Keystore）里存 JSON 列表，上限 5 条，按最近连接排序。
 * 纯逻辑可注入存储实现，便于单测；App 运行时用 hostStoreAdapter。
 */

import type { SecureStoreApi } from "../data/tokenStore";

export interface RecentHost {
  host: string;
  port: number;
  name?: string;
  /** 该主机的配对 token（扫码配对时写入；自动重连优先使用，回退全局 token）。 */
  token?: string;
  lastConnectedAt: number;
}

export const HOSTS_KEY = "dsh-recent-hosts";
export const MAX_RECENT_HOSTS = 5;

export class HostStore {
  constructor(private readonly api: SecureStoreApi) {}

  async list(): Promise<RecentHost[]> {
    try {
      const raw = await this.api.getItemAsync(HOSTS_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isRecentHost).sort((a, b) => b.lastConnectedAt - a.lastConnectedAt);
    } catch (err) {
      console.warn("[hosts] read failed", err);
      return [];
    }
  }

  async latest(): Promise<RecentHost | null> {
    const list = await this.list();
    return list[0] ?? null;
  }

  /** 插入/更新最近主机并持久化；返回新列表。失败时返回旧列表（不抛错）。 */
  async add(host: string, port: number, name?: string, token?: string): Promise<RecentHost[]> {
    const list = await this.list();
    const prev = list.find((h) => h.host === host && h.port === port);
    // 未提供名称/token 时保留旧值（自动重连不覆盖已记住的配对）。
    const nextName = name && name.length > 0 ? name : prev?.name;
    const nextToken = token && token.length > 0 ? token : prev?.token;
    const next = list.filter((h) => !(h.host === host && h.port === port));
    next.unshift({ host, port, name: nextName, token: nextToken, lastConnectedAt: Date.now() });
    const capped = next.slice(0, MAX_RECENT_HOSTS);
    try {
      await this.api.setItemAsync(HOSTS_KEY, JSON.stringify(capped));
    } catch (err) {
      console.warn("[hosts] write failed", err);
      return list; // 持久化失败：返回旧列表，避免内存/磁盘不一致
    }
    return capped;
  }

  async remove(host: string, port: number): Promise<void> {
    const list = await this.list();
    const next = list.filter((h) => !(h.host === host && h.port === port));
    try {
      if (next.length === 0) await this.api.deleteItemAsync(HOSTS_KEY);
      else await this.api.setItemAsync(HOSTS_KEY, JSON.stringify(next));
    } catch (err) {
      console.warn("[hosts] remove failed", err);
    }
  }
}

function isRecentHost(v: unknown): v is RecentHost {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.host === "string" && typeof o.port === "number" && typeof o.lastConnectedAt === "number" && (o.token === undefined || typeof o.token === "string");
}
