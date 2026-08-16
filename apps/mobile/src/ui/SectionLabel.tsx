import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { colors, font, tracking } from "../theme";

/** mono 眉标：区块标签 / 状态行 / 数据前缀（SESSIONS · TARGET · OFFLINE）。 */
export function SectionLabel({
  children,
  tone = "muted",
  style,
}: {
  children: string;
  tone?: "muted" | "accent" | "danger" | "success";
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={[styles.label, tone !== "muted" && { color: colors[tone] }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.textMuted,
    fontFamily: font.mono,
    fontSize: font.eyebrow,
    fontWeight: "700",
    letterSpacing: tracking.eyebrow,
    textTransform: "uppercase",
  },
});
