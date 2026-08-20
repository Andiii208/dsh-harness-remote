import { useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { font, radius, space, type ThemeColors } from "../src/theme";
import { useTheme } from "../src/theme-context";
import { WhaleMark } from "../src/ui/WhaleMark";
import { Button } from "../src/ui/Button";
import { onboardingStore } from "../src/discovery/onboardingStoreAdapter";
import { useI18n } from "../src/i18n";

export default function OnboardingScreen() {
  const { t } = useI18n();
  const STEPS = [
    { title: t.onboarding.step1Title, body: t.onboarding.step1Body },
    { title: t.onboarding.step2Title, body: t.onboarding.step2Body },
    { title: t.onboarding.step3Title, body: t.onboarding.step3Body },
  ];
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const finish = async () => {
    await onboardingStore.markSeen();
    router.replace("/");
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.x7, paddingBottom: insets.bottom + space.x5 }]}>
      <View style={styles.body}>
        <View style={styles.brand}>
          <WhaleMark size={44} fill={colors.heroText} />
          <Text style={styles.brandText}>harness remote</Text>
        </View>
        <Text style={styles.copy}>{t.onboarding.tagline}</Text>

        <View style={styles.steps}>
          {STEPS.map((step, i) => (
            <View key={step.title} style={styles.stepRow}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{i + 1}</Text>
              </View>
              <View style={styles.stepBody}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepText}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <Button label={t.onboarding.start} onPress={() => void finish()} full />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.navy, paddingHorizontal: space.x6, justifyContent: "space-between" },
    body: { flex: 1, justifyContent: "center", gap: space.x6 },
    brand: { alignItems: "center", gap: space.x3 },
    brandText: {
      color: colors.heroText,
      fontFamily: font.display,
      fontSize: 26,
      fontWeight: "600",
      letterSpacing: -0.6,
      lineHeight: 30,
    },
    copy: {
      color: colors.heroTextDim,
      fontSize: font.body + 1,
      lineHeight: 23,
      textAlign: "center",
      alignSelf: "center",
      maxWidth: 300,
    },
    steps: {
      gap: space.x3,
      marginTop: space.x3,
    },
    stepRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: space.x3,
      backgroundColor: colors.heroCard,
      borderWidth: 1,
      borderColor: colors.heroStroke,
      borderRadius: radius.card,
      padding: space.x4,
    },
    stepBadge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.ocean,
      alignItems: "center",
      justifyContent: "center",
    },
    stepBadgeText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "600",
    },
    stepBody: { flex: 1, gap: 4 },
    stepTitle: { color: colors.heroText, fontSize: font.body + 1, fontWeight: "600" },
    stepText: { color: colors.heroTextDim, fontSize: font.caption, lineHeight: 18 },
  });
}
