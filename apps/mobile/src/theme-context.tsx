/**
 * 主题上下文 v7：ThemeProvider（跟随系统深浅色）+ useTheme()。
 * 令牌数据与类型在 ./theme.ts；本文件只做 context 与 hook（单向依赖 theme.ts，避免循环）。
 * 本文件因含 JSX 用 .tsx 扩展名。
 */

import { createContext, useContext } from "react";
import { useColorScheme } from "react-native";
import type { PropsWithChildren } from "react";
import { createTheme, type ThemeColors, type ThemeScheme, type ThemeValue } from "./theme";

export type { ThemeColors, ThemeScheme, ThemeValue } from "./theme";

const ThemeContext = createContext<ThemeValue>({
  colors: createTheme("light"),
  scheme: "light",
  isDark: false,
});

/** 挂在 app 根部；无 Provider 时回退浅色（不崩溃） */
export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme() ?? "light";
  const scheme: ThemeScheme = system === "dark" ? "dark" : "light";
  return (
    <ThemeContext.Provider value={{ colors: createTheme(scheme), scheme, isDark: scheme === "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
