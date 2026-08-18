/**
 * themePreferenceStore — 主题偏好持久化（浅色 / 深色 / 跟随系统）。
 * 默认「浅色」：用户要求 App 默认浅色背景，深浅色只作为可选切换。
 * 读失败/损坏时回退 light；写失败静默（主题切换不阻塞 UI）。
 */

import type { SecureStoreApi } from "./tokenStore";

export type ThemePreference = "light" | "dark" | "system";

export const THEME_PREFERENCE_KEY = "dsh-theme-preference";

export function isThemePreference(v: unknown): v is ThemePreference {
  return v === "light" || v === "dark" || v === "system";
}

export class ThemePreferenceStore {
  constructor(private readonly api: SecureStoreApi) {}

  async get(): Promise<ThemePreference> {
    try {
      const raw = await this.api.getItemAsync(THEME_PREFERENCE_KEY);
      if (!raw) return "light";
      const parsed: unknown = JSON.parse(raw);
      const pref = (parsed as { preference?: unknown } | null)?.preference;
      return isThemePreference(pref) ? pref : "light";
    } catch (err) {
      console.warn("[theme-preference] read failed", err);
      return "light";
    }
  }

  async set(preference: ThemePreference): Promise<void> {
    try {
      await this.api.setItemAsync(THEME_PREFERENCE_KEY, JSON.stringify({ preference }));
    } catch (err) {
      console.warn("[theme-preference] write failed", err);
    }
  }
}
