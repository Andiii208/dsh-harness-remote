/**
 * draftStore — 连接草稿持久化（host/port 记忆，SecureStore）。
 */

import type { SecureStoreApi } from "../data/tokenStore";

export interface ConnectDraft {
  host: string;
  port: number;
}

export const DRAFT_KEY = "dsh-connect-draft";

export class DraftStore {
  constructor(private readonly api: SecureStoreApi) {}

  async get(): Promise<ConnectDraft | null> {
    try {
      const raw = await this.api.getItemAsync(DRAFT_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const o = parsed as Record<string, unknown>;
      if (typeof o.host !== "string" || typeof o.port !== "number") return null;
      return { host: o.host, port: o.port };
    } catch (err) {
      console.warn("[draft] read failed", err);
      return null;
    }
  }

  async set(host: string, port: number): Promise<void> {
    // port 0 表示 relay 模式草稿（R1 远程优先：地址自动补全 ws://…:4090）。
    if (!host || host.trim().length === 0 || !Number.isInteger(port) || port < 0 || port > 65535) {
      return; // 无效草稿不落盘
    }
    try {
      await this.api.setItemAsync(DRAFT_KEY, JSON.stringify({ host: host.trim(), port }));
    } catch (err) {
      console.warn("[draft] write failed", err);
    }
  }
}
