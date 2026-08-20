import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { font, radius, space } from "../theme";
import { useTheme } from "../theme-context";

export type StatusTone = "success" | "warn" | "danger" | "neutral";

/** 状态表达 v9：色点（带同色光晕）+ 等宽文本；paper = surface2 胶囊，hero = 品牌画布半透明胶囊。 */
export function StatusChip({
  tone = "neutral",
  label,
  variant = "paper",
}: {
  tone?: StatusTone;
  label: string;
  variant?: "paper" | "hero";
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const DOT: Record<StatusTone, string> = {
    success: colors.success,
    warn: colors.warn,
    danger: colors.danger,
    neutral: colors.textDim,
  };
  const dotColor = DOT[tone];
  return (
    <View style={[styles.chip, variant === "hero" && styles.chipHero]}>
      <View style={[styles.dot, { backgroundColor: dotColor, shadowColor: dotColor }]} />
      <Text style={[styles.label, variant === "hero" && styles.labelHero]}>{label}</Text>
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
    chipHero: {
      backgroundColor: colors.heroCard,
      borderWidth: 1,
      borderColor: colors.heroStroke,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      shadowOpacity: 0.65,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 0 },
      elevation: 2,
    },
    label: { color: colors.textMuted, fontFamily: font.monoBold, fontSize: font.eyebrow, fontWeight: "500", lineHeight: 14 },
    labelHero: { color: colors.mist },
  });
}
