import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { font, radius, space } from "../theme";
import { useTheme } from "../theme-context";

export type StatusTone = "success" | "warn" | "danger" | "neutral";

/** 状态表达 v7：色点 + 等宽文本（● ONLINE / ○ OFFLINE），surface2 胶囊无边框。 */
export function StatusChip({ tone = "neutral", label }: { tone?: StatusTone; label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const DOT: Record<StatusTone, string> = {
    success: colors.success,
    warn: colors.warn,
    danger: colors.danger,
    neutral: colors.textDim,
  };
  return (
    <View style={styles.chip}>
      <View style={[styles.dot, { backgroundColor: DOT[tone] }]} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.x2,
      backgroundColor: colors.surface2,
      borderRadius: radius.pill,
      paddingHorizontal: 11,
      paddingVertical: 4,
    },
    dot: { width: 7, height: 7, borderRadius: 4 },
    label: { color: colors.textMuted, fontFamily: font.monoBold, fontSize: font.eyebrow, fontWeight: "500" },
  });
}
