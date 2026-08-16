import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConnectionProvider } from "../src/transport/ConnectionProvider";
import { notificationService } from "../src/notify/expoAdapter";
import { registerNotificationDeepLink } from "../src/notify/deeplink";
import { colors } from "../src/theme";

export default function RootLayout() {
  useEffect(() => {
    registerNotificationDeepLink();
    void notificationService.configure();
    notificationService.setForegroundHandler();
    void notificationService.ensurePermissions();
  }, []);

  return (
    <SafeAreaProvider>
      <ConnectionProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "600", fontSize: 15 },
            contentStyle: { backgroundColor: colors.bg },
            headerShadowVisible: false,
            headerBackTitle: "返回",
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="sessions" options={{ title: "Sessions", headerBackTitle: "连接" }} />
          <Stack.Screen name="chat/[sessionId]" options={{ title: "Session" }} />
          <Stack.Screen name="approval/[rpcId]" options={{ title: "请求" }} />
          <Stack.Screen name="settings" options={{ title: "设置" }} />
          <Stack.Screen name="scan" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack>
      </ConnectionProvider>
    </SafeAreaProvider>
  );
}
