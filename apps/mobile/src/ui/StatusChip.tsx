import { StyleSheet, Text, View } from "react-native";
import { colors, font, radius, space, stroke } from "../theme";

export type StatusTone = "success" | "warn" | "danger" | "neutral";

const DOT: Record<StatusTone, string> = {
  success: colors.success,
  warn: colors.warn,
  danger: colors.danger,
  neutral: colors.textDim,
};

/** 状态表达：色点 + 等宽文本（● ONLINE / ○ OFFLINE）。 */
export function StatusChip({ tone = "neutral", label }: { tone?: StatusTone; label: string }) {
  return (
    <View style={styles.chip}>
      <View style={[styles.dot, { backgroundColor: DOT[tone] }]} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.x2,
    backgroundColor: colors.surface,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.x3,
    paddingVertical: space.x1 + 2,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: colors.textMuted, fontFamily: font.monoBold, fontSize: font.eyebrow, fontWeight: "700" },
});
