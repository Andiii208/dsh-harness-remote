import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
  useFonts,
} from "@expo-google-fonts/jetbrains-mono";
import {
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { ConnectionProvider } from "../src/transport/ConnectionProvider";
import { AppSettingsProvider } from "../src/data/appSettingsContext";
import { notificationService } from "../src/notify/expoAdapter";
import { registerNotificationDeepLink } from "../src/notify/deeplink";
import { ThemeProvider, useTheme } from "../src/theme-context";
import { useReduceMotion } from "../src/ui/anim";
import { I18nProvider } from "../src/i18n";

void SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { colors, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "600", fontSize: 15 },
          contentStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerBackTitle: "返回",
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="sessions" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[sessionId]" options={{ title: "对话" }} />
        <Stack.Screen name="approval/[rpcId]" options={{ title: "请求" }} />
        <Stack.Screen name="settings" options={{ title: "设置" }} />
        <Stack.Screen name="plugins" options={{ title: "插件", headerBackTitle: "设置" }} />
        <Stack.Screen name="scan" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

/**
 * 主题切换背景交叉淡出（1.9）：切换浅/深时旧底色作为一次性叠层淡出，
 * 消除整树瞬时跳变的割裂感。尊重系统「减弱动态」。
 */
function ThemeCrossfade() {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  const [overlay, setOverlay] = useState<string | null>(null);
  const prevBg = useRef(colors.bg);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (prevBg.current === colors.bg) return;
    const oldBg = prevBg.current;
    prevBg.current = colors.bg;
    if (reduced) return;
    setOverlay(oldBg);
  }, [colors.bg, reduced]);

  useEffect(() => {
    if (!overlay) return;
    fade.setValue(1);
    const anim = Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true });
    anim.start(({ finished }) => {
      if (finished) setOverlay(null);
    });
    return () => anim.stop();
  }, [overlay, fade]);

  if (!overlay) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.crossfade, { backgroundColor: overlay, opacity: fade }]}
    />
  );
}

/** 主题内层壳：让手势根视图的底色跟随主题，深色冷启动不再闪白。 */
function ThemedRootShell({
  onLayout,
  children,
}: {
  onLayout: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: colors.bg }]} onLayout={onLayout}>
      {children}
      <ThemeCrossfade />
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  // 兜底：字体 6s 内未就绪（离线/受限网络）则用系统字体继续渲染，避免白屏
  const [fontFallback, setFontFallback] = useState(false);
  useEffect(() => {
    if (fontsLoaded) return;
    const t = setTimeout(() => setFontFallback(true), 6000);
    return () => clearTimeout(t);
  }, [fontsLoaded]);
  const ready = fontsLoaded || fontFallback;

  // 使用 onLayout 隐藏 splash，确保内容已渲染，避免闪白
  const splashHidden = useRef(false);
  const onLayout = useCallback(() => {
    if (!splashHidden.current) {
      splashHidden.current = true;
      void SplashScreen.hideAsync();
    }
  }, []);

  useEffect(() => {
    registerNotificationDeepLink();
    void notificationService.configure();
    notificationService.setForegroundHandler();
    void notificationService.ensurePermissions();
  }, []);

  if (!ready) return null;

  return (
    <ThemeProvider>
      <ThemedRootShell onLayout={onLayout}>
        <SafeAreaProvider>
          <I18nProvider>
            <AppSettingsProvider>
              <ConnectionProvider>
                <RootNavigator />
              </ConnectionProvider>
            </AppSettingsProvider>
          </I18nProvider>
        </SafeAreaProvider>
      </ThemedRootShell>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  crossfade: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const,
});
