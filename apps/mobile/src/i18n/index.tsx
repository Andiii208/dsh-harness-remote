/**
 * i18n — 轻量双语（zh-CN / en）。
 * 默认 zh-CN；语言偏好持久化到 SecureStore（languagePreferenceStore）。
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { en, zhCN, type Locale, type TranslationKey } from "./translations";
import { languagePreferenceStore } from "./languagePreferenceStoreAdapter";

export type { Locale };

export interface I18nValue {
  locale: Locale;
  t: TranslationKey;
  setLocale(locale: Locale): void;
}

const I18nContext = createContext<I18nValue>({
  locale: "zh-CN",
  t: zhCN,
  setLocale: () => {},
});

export function I18nProvider({ children }: PropsWithChildren) {
  const [locale, setLocaleState] = useState<Locale>("zh-CN");

  useEffect(() => {
    void languagePreferenceStore.get().then((v) => setLocaleState(v));
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    void languagePreferenceStore.set(next);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ locale, t: locale === "en" ? en : zhCN, setLocale }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
