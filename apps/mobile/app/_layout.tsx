import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
  useFonts,
} from "@expo-google-fonts/jetbrains-mono";
import { ConnectionProvider } from "../src/transport/ConnectionProvider";
import { notificationService } from "../src/notify/expoAdapter";
import { registerNotificationDeepLink } from "../src/notify/deeplink";
import { colors, font } from "../src/theme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    registerNotificationDeepLink();
    void notificationService.configure();
    notificationService.setForegroundHandler();
    void notificationService.ensurePermissions();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ConnectionProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
              headerTitleStyle: { fontWeight: "600", fontSize: 15, fontFamily: font.monoBold },
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
