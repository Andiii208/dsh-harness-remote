import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { colors, font, radius, space, stroke } from "../src/theme";
import { WhaleMark } from "../src/ui/WhaleMark";
import { WhaleWatermark } from "../src/ui/WhaleWatermark";
import { useEntering } from "../src/ui/anim";
import { SectionLabel } from "../src/ui/SectionLabel";
import { Button } from "../src/ui/Button";
import { onboardingStore } from "../src/discovery/onboardingStoreAdapter";

const STEPS = [
  {
    title: "远程控制 DeepSeek Harness",
    body: "harness remote 让你的手机成为 DSH 的终端视口：查看会话、流式聊天、审批与提问、暂停 goal。",
  },
  {
    title: "在电脑上安装配对插件",
    body: "在运行 DSH 的电脑上安装 dsh-remote 插件并生成配对码——二维码会显示在终端里，15 分钟内有效。",
  },
  {
    title: "扫码或自动发现",
    body: "用手机扫电脑上的二维码即可一键连接；同一局域网内也可以自动发现主机。之后每次打开都会自动重连最近的主机。",
  },
] as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const entering = useEntering(10, 220);
  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;

  const finish = async () => {
    await onboardingStore.markSeen();
    router.replace("/");
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.x7, paddingBottom: insets.bottom + space.x5 }]}>
      <WhaleWatermark size={300} style={styles.watermark} />

      <View style={styles.brand}>
        <WhaleMark size={44} />
        <SectionLabel>harness remote</SectionLabel>
      </View>

      <Animated.View key={step} entering={entering} style={styles.stepCard}>
        <SectionLabel tone="accent">{`Step ${step + 1} / ${STEPS.length}`}</SectionLabel>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.body}>{current.body}</Text>
        {step === 2 && (
          <View style={styles.codeBox}>
            <Text style={styles.code}>dshremote://pair?host=192.168.1.5&port=3080&token=…</Text>
          </View>
        )}
        <View style={styles.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>
      </Animated.View>

      <View style={styles.actions}>
        {step > 0 && <Button tone="ghost" label="上一步" onPress={() => setStep((s) => s - 1)} style={styles.flex} />}
        <Button
          label={last ? "开始使用" : "下一步"}
          onPress={() => (last ? void finish() : setStep((s) => s + 1))}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.x5, justifyContent: "space-between" },
  watermark: { position: "absolute", top: space.x6, right: -space.x7 },
  brand: { alignItems: "center", gap: space.x2 },
  stepCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    padding: space.x6,
    gap: space.x3,
  },
  title: { color: colors.text, fontSize: font.title, fontWeight: "600", letterSpacing: -0.2, lineHeight: 28 },
  body: { color: colors.textMuted, fontSize: font.body, lineHeight: 21 },
  codeBox: {
    backgroundColor: colors.surface3,
    borderRadius: radius.control,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    padding: space.x3,
  },
  code: { color: colors.textMuted, fontFamily: font.mono, fontSize: font.transcript - 1, lineHeight: 20 },
  dots: { flexDirection: "row", gap: space.x2, justifyContent: "center", paddingTop: space.x2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.surface3 },
  dotActive: { width: 18, backgroundColor: colors.accent },
  actions: { flexDirection: "row", gap: space.x3 },
  flex: { flex: 1 },
});
