/**
 * appSettingsStore — App 本地设置（R3）。
 * 当前只有字体大小（small / standard / large），影响聊天正文与列表正文，
 * 不缩放 UI 框架。持久化到 SecureStore，读失败/损坏时回退 standard。
 */

import type { SecureStoreApi } from "./tokenStore";

export type FontSize = "small" | "standard" | "large";

export interface AppSettings {
  fontSize: FontSize;
}

export const APP_SETTINGS_KEY = "dsh-app-settings";

export const FONT_SCALE: Record<FontSize, number> = {
  small: 0.92,
  standard: 1,
  large: 1.12,
};

export function fontSizeScale(size: FontSize): number {
  return FONT_SCALE[size] ?? 1;
}

export class AppSettingsStore {
  constructor(private readonly api: SecureStoreApi) {}

  async get(): Promise<AppSettings> {
    try {
      const raw = await this.api.getItemAsync(APP_SETTINGS_KEY);
      if (!raw) return { fontSize: "standard" };
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return { fontSize: "standard" };
      const fontSize = (parsed as { fontSize?: unknown }).fontSize;
      if (fontSize === "small" || fontSize === "large") return { fontSize };
      return { fontSize: "standard" };
    } catch (err) {
      console.warn("[app-settings] read failed", err);
      return { fontSize: "standard" };
    }
  }

  async setFontSize(fontSize: FontSize): Promise<void> {
    try {
      await this.api.setItemAsync(APP_SETTINGS_KEY, JSON.stringify({ fontSize }));
    } catch (err) {
      console.warn("[app-settings] write failed", err);
    }
  }
}
