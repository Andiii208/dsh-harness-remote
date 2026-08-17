import { useMemo } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { font, tracking } from "../theme";
import { useTheme } from "../theme-context";

/** mono 眉标 v7：区块标签 / 状态行 / 数据前缀（SESSIONS · TARGET · OFFLINE）。 */
export function SectionLabel({
  children,
  tone = "muted",
  style,
}: {
  children: string;
  tone?: "muted" | "accent" | "danger" | "success";
  style?: StyleProp<TextStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Text style={[styles.label, tone !== "muted" && { color: colors[tone] }, style]}>
      {children}
    </Text>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    label: {
      color: colors.textMuted,
      fontFamily: font.monoBold,
      fontSize: font.eyebrow,
      fontWeight: "500",
      letterSpacing: tracking.eyebrow,
      textTransform: "uppercase",
    },
  });
}
