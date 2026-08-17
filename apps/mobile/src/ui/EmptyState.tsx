import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { font, space } from "../theme";
import { useTheme } from "../theme-context";
import { SectionLabel } from "./SectionLabel";

interface EmptyStateProps {
  eyebrow: string;
  text: string;
}

/** 空态 v7：mono 眉标一行 + 正文一句；克制、无插画。 */
export function EmptyState({ eyebrow, text }: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <SectionLabel>{eyebrow}</SectionLabel>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    wrap: { alignItems: "center", paddingTop: space.x7 * 2, gap: space.x2 },
    text: { color: colors.textMuted, fontSize: font.caption, textAlign: "center", lineHeight: 18 },
  });
}
