import { StyleSheet, Text, View } from "react-native";
import { colors, font, space } from "../theme";
import { SectionLabel } from "./SectionLabel";

interface EmptyStateProps {
  eyebrow: string;
  text: string;
}

/** 空态：mono 眉标一行 + 正文一句；克制、无插画。 */
export function EmptyState({ eyebrow, text }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <SectionLabel>{eyebrow}</SectionLabel>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingTop: space.x7 * 2, gap: space.x2 },
  text: { color: colors.textMuted, fontSize: font.caption, textAlign: "center", lineHeight: 18 },
});
