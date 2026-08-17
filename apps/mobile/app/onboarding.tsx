import { useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { font, space, type ThemeColors } from "../src/theme";
import { useTheme } from "../src/theme-context";
import { WhaleMark } from "../src/ui/WhaleMark";
import { useEntering } from "../src/ui/anim";
import { Button } from "../src/ui/Button";
import { onboardingStore } from "../src/discovery/onboardingStoreAdapter";

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const entering = useEntering(10, 220);

  const finish = async () => {
    await onboardingStore.markSeen();
    router.replace("/");
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.x7, paddingBottom: insets.bottom + space.x5 }]}>
      <Animated.View entering={entering} style={styles.body}>
        <View style={styles.brand}>
          <WhaleMark size={44} />
          <Text style={styles.brandText}>harness remote</Text>
        </View>
        <Text style={styles.copy}>
          手机是 DeepSeek Harness 的视口：查看会话、审批请求、继续对话。
        </Text>
      </Animated.View>

      <Button label="开始使用" onPress={() => void finish()} full />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.x6, justifyContent: "space-between" },
    body: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.x5 },
    brand: { alignItems: "center", gap: space.x3 },
    brandText: {
      color: colors.text,
      fontFamily: font.display,
      fontSize: 26,
      fontWeight: "600",
      letterSpacing: -0.6,
      lineHeight: 30,
    },
    copy: {
      color: colors.textMuted,
      fontSize: font.body + 1,
      lineHeight: 23,
      textAlign: "center",
      maxWidth: 280,
    },
  });
}
