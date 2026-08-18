/**
 * languagePreferenceStore — 语言偏好持久化（zh-CN / en）。
 * 默认 zh-CN；读失败/损坏回退 zh-CN；写失败静默。
 */

import type { SecureStoreApi } from "../data/tokenStore";
import type { Locale } from "./translations";

export const LANGUAGE_PREFERENCE_KEY = "dsh-language-preference";

export function isLocale(v: unknown): v is Locale {
  return v === "zh-CN" || v === "en";
}

export class LanguagePreferenceStore {
  constructor(private readonly api: SecureStoreApi) {}

  async get(): Promise<Locale> {
    try {
      const raw = await this.api.getItemAsync(LANGUAGE_PREFERENCE_KEY);
      if (!raw) return "zh-CN";
      const parsed: unknown = JSON.parse(raw);
      const pref = (parsed as { locale?: unknown } | null)?.locale;
      return isLocale(pref) ? pref : "zh-CN";
    } catch (err) {
      console.warn("[language-preference] read failed", err);
      return "zh-CN";
    }
  }

  async set(locale: Locale): Promise<void> {
    try {
      await this.api.setItemAsync(LANGUAGE_PREFERENCE_KEY, JSON.stringify({ locale }));
    } catch (err) {
      console.warn("[language-preference] write failed", err);
    }
  }
}
