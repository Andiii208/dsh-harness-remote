/**
 * AppSettingsContext — App 本地设置（字体大小）的 React 上下文。
 * Provider 挂在根布局；useAppSettings() 读取 { fontSize, setFontSize, scale }。
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { appSettingsStore } from "./appSettingsAdapter";
import { fontSizeScale, type FontSize } from "./appSettingsStore";

export interface AppSettingsValue {
  fontSize: FontSize;
  scale: number;
  setFontSize(size: FontSize): void;
}

const AppSettingsContext = createContext<AppSettingsValue>({
  fontSize: "standard",
  scale: 1,
  setFontSize: () => {},
});

export function AppSettingsProvider({ children }: PropsWithChildren) {
  const [fontSize, setFontSizeState] = useState<FontSize>("standard");

  useEffect(() => {
    void appSettingsStore.get().then((s) => setFontSizeState(s.fontSize));
  }, []);

  const setFontSize = useCallback((size: FontSize) => {
    setFontSizeState(size);
    void appSettingsStore.setFontSize(size);
  }, []);

  const value = useMemo<AppSettingsValue>(
    () => ({ fontSize, scale: fontSizeScale(fontSize), setFontSize }),
    [fontSize, setFontSize],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings(): AppSettingsValue {
  return useContext(AppSettingsContext);
}
