import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ConnectionProvider } from "../src/transport/ConnectionProvider";
import { colors } from "../src/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ConnectionProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: "600" },
            contentStyle: { backgroundColor: colors.bg },
            headerShadowVisible: false,
          }}
        >
          <Stack.Screen name="index" options={{ title: "dsh-remote" }} />
          <Stack.Screen name="sessions" options={{ title: "Sessions" }} />
          <Stack.Screen name="chat/[sessionId]" options={{ title: "Session" }} />
          <Stack.Screen name="approval/[rpcId]" options={{ title: "请求" }} />
        </Stack>
      </ConnectionProvider>
    </SafeAreaProvider>
  );
}
