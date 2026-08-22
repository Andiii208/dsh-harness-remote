import { useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { space } from "../theme";
import { useTheme } from "../theme-context";
import { AppText } from "./AppText";
import { SectionLabel } from "./SectionLabel";

interface EmptyStateProps {
  eyebrow: string;
  text: string;
  /** 可选行动按钮（如「去连接」「新建会话」）。 */
  action?: ReactNode;
  /** paper = 阅读画布；hero = 品牌画布（深蓝底，浅色文字）。 */
  variant?: "paper" | "hero";
}

/** 空态：mono 眉标一行 + 正文一句 + 可选行动点；克制、无插画。 */
export function EmptyState({ eyebrow, text, action, variant = "paper" }: EmptyStateProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const hero = variant === "hero";
  return (
    <View style={styles.wrap}>
      <SectionLabel tone={hero ? "mist" : "muted"}>{eyebrow}</SectionLabel>
      <AppText variant="caption" tone={hero ? "dim" : "muted"} style={[styles.text, hero && styles.heroText]}>
        {text}
      </AppText>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    wrap: { alignItems: "center", paddingTop: space.x7 * 2, gap: space.x2, paddingHorizontal: space.x4 },
    text: { textAlign: "center" },
    heroText: { color: colors.heroTextDim },
    action: { marginTop: space.x2, minWidth: 160 },
  });
}
