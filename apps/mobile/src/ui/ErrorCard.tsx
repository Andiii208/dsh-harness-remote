/**
 * ErrorCard — 统一错误态（审计 B9：此前错误分散为一行 mono/danger/warn
 * 三种口径、无重试按钮）。规格对齐 UI-SYSTEM v9 §5.1：主色 8% 底 +
 * 18% 描边 + 图标 + 重试按钮。
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme-context";
import { font, space } from "../theme";
import { AppIcon } from "./icons";

export type ErrorTone = "danger" | "warn";

export function ErrorCard({
  message,
  onRetry,
  retryLabel,
  tone = "danger",
}: {
  message: string;
  /** 提供则渲染重试按钮。 */
  onRetry?: () => void;
  retryLabel?: string;
  tone?: ErrorTone;
}) {
  const { colors } = useTheme();
  const tint = tone === "warn" ? colors.warn : colors.danger;
  return (
    <View style={[styles.card, { backgroundColor: `${tint}14`, borderColor: `${tint}2E` }]}>
      <View style={styles.row}>
        <AppIcon name="banned" size={15} color={tint} />
        <Text style={[styles.message, { color: colors.text }]} numberOfLines={3}>
          {message}
        </Text>
      </View>
      {onRetry !== undefined && (
        <Pressable
          style={({ pressed }) => [styles.retryBtn, { backgroundColor: tint }, pressed && styles.pressed]}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={retryLabel ?? "重试"}
        >
          <Text style={styles.retryText}>{retryLabel ?? "重试"}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: space.x3,
    gap: space.x2,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.x2,
  },
  message: {
    flexShrink: 1,
    fontSize: font.caption,
    lineHeight: 18,
    fontWeight: "500",
  },
  retryBtn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  pressed: { opacity: 0.85 },
  retryText: { color: "#FFFFFF", fontSize: font.caption, fontWeight: "600" },
});
