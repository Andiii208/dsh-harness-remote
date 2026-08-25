import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
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
    <GestureHandlerRootView style={styles.root} onLayout={onLayout}>
      <SafeAreaProvider>
        <ThemeProvider>
          <I18nProvider>
            <AppSettingsProvider>
              <ConnectionProvider>
                <RootNavigator />
              </ConnectionProvider>
            </AppSettingsProvider>
          </I18nProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7F7FA" },
});
