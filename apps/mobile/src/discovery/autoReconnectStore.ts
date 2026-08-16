/**
 * autoReconnectStore — 自动重连开关（SecureStore；用户断开后关闭，连接时打开）。
 */

import type { SecureStoreApi } from "../data/tokenStore";

export const AUTO_RECONNECT_KEY = "dsh-auto-reconnect";

export class AutoReconnectStore {
  constructor(private readonly api: SecureStoreApi) {}

  async enabled(): Promise<boolean> {
    try {
      const v = await this.api.getItemAsync(AUTO_RECONNECT_KEY);
      return v !== "0"; // 默认开启
    } catch (err) {
      console.warn("[auto-reconnect] read failed", err);
      return true;
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    try {
      if (enabled) await this.api.setItemAsync(AUTO_RECONNECT_KEY, "1");
      else await this.api.setItemAsync(AUTO_RECONNECT_KEY, "0");
    } catch (err) {
      console.warn("[auto-reconnect] write failed", err);
    }
  }
}
