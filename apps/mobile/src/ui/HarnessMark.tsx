import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { font, type ThemeColors } from "../theme";
import { useTheme } from "../theme-context";
import { WhaleMark } from "./WhaleMark";

/**
 * HarnessMark — 品牌锁：官方鲸鱼 + "deepseek" + HARNESS 描边徽章。
 * 参考 Clarklevis1995/dsh-mobile 的 HarnessMark（SwiftUI），RN 等价实现。
 * 品牌画布上默认白色（tone="hero"）；阅读画布可用 ink。
 */
export function HarnessMark({
  size = 28,
  tone = "hero",
}: {
  size?: number;
  tone?: "hero" | "ink";
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, tone), [colors, tone]);
  return (
    <View style={styles.row} accessibilityLabel="deepseek harness">
      <WhaleMark size={size} fill={tone === "hero" ? colors.heroText : colors.text} />
      <Text style={styles.word}>deepseek</Text>
      <Text style={styles.badge}>HARNESS</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors, tone: "hero" | "ink") {
  const ink = tone === "ink";
  const fg = ink ? colors.text : colors.heroText;
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: 7 },
    word: {
      color: fg,
      fontFamily: font.display,
      fontSize: 20,
      fontWeight: "600",
      letterSpacing: -0.4,
      lineHeight: 26,
    },
    badge: {
      color: fg,
      fontFamily: font.monoBold,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.8,
      paddingHorizontal: 5,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: ink ? colors.textDim : "rgba(255,255,255,0.55)",
      borderRadius: 3,
      overflow: "hidden",
      lineHeight: 11,
    },
  });
}
