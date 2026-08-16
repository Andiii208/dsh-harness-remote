/**
 * notificationPrefsStore — 本地通知开关（SecureStore，默认开）。
 */

import type { SecureStoreApi } from "../data/tokenStore";

export const NOTIFY_KEY = "dsh-notifications-enabled";

export class NotificationPrefsStore {
  constructor(private readonly api: SecureStoreApi) {}

  async enabled(): Promise<boolean> {
    try {
      const v = await this.api.getItemAsync(NOTIFY_KEY);
      return v !== "0"; // 默认开启
    } catch (err) {
      console.warn("[notify-prefs] read failed", err);
      return true;
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    try {
      await this.api.setItemAsync(NOTIFY_KEY, enabled ? "1" : "0");
    } catch (err) {
      console.warn("[notify-prefs] write failed", err);
    }
  }
}
