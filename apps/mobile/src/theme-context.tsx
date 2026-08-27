/**
 * 主题上下文 v8：ThemeProvider（偏好驱动）+ useTheme()。
 * 默认「浅色」；用户可在设置里切换 浅色 / 深色 / 跟随系统。
 * 令牌数据与类型在 ./theme.ts；本文件只做 context 与 hook。
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import type { PropsWithChildren } from "react";
import { createTheme, type ThemePreference, type ThemeScheme, type ThemeValue } from "./theme";
import { themePreferenceStore } from "./data/themePreferenceStoreAdapter";

export type { ThemeColors, ThemeScheme, ThemeValue, ThemePreference } from "./theme";
export { themePreferenceStore } from "./data/themePreferenceStoreAdapter";

const ThemeContext = createContext<ThemeValue>({
  colors: createTheme("light"),
  scheme: "light",
  isDark: false,
  preference: "light",
  setPreference: () => {},
});

function resolveScheme(pref: ThemePreference, system: string | null | undefined): ThemeScheme {
  if (pref === "system") return system === "dark" ? "dark" : "light";
  return pref;
}

/** 挂在 app 根部；无 Provider 时回退浅色（不崩溃）。 */
export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("light");

  useEffect(() => {
    let alive = true;
    void themePreferenceStore.get().then((pref) => {
      if (alive) setPreferenceState(pref);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setPreference = useCallback((pref: ThemePreference) => {
    setPreferenceState(pref);
    void themePreferenceStore.set(pref);
  }, []);

  const scheme = resolveScheme(preference, system);
  const value = useMemo<ThemeValue>(
    () => ({
      colors: createTheme(scheme),
      scheme,
      isDark: scheme === "dark",
      preference,
      setPreference,
    }),
    [scheme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
