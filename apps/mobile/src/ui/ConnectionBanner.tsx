/**
 * ConnectionBanner — 连接状态横幅。
 * - 只在 连接中 / 重试中 / 已放弃 / 有错误 时出现；普通离线不显示（避免与 header 状态重复）。
 * - v9：双画布变体（paper / hero）。
 */

import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useConnection } from "../transport/ConnectionProvider";
import { radius, space } from "../theme";
import { useTheme } from "../theme-context";
import { AppText } from "./AppText";

export function ConnectionBanner({ variant = "paper" }: { variant?: "paper" | "hero" }) {
  const { state, lastError, givenUp, retry, stopRetrying } = useConnection();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const visible = lastError !== null || state === "connecting" || state === "backoff" || givenUp;
  if (!visible) return null;

  const hero = variant === "hero";
  const tone = lastError || givenUp ? "danger" : "warn";
  const dotColor = tone === "danger" ? colors.danger : colors.warn;

  let title: string;
  let hint: string | null = null;
  if (lastError) {
    title = lastError.title;
    hint = lastError.hint;
  } else if (givenUp) {
    title = "连接失败，已停止重试";
    hint = "请检查后点「重试」，或回电脑端重新扫码。";
  } else if (state === "connecting") {
    title = "正在连接…";
  } else if (state === "backoff") {
    title = "连接断开，正在重试…";
  } else {
    return null;
  }

  const heroTint =
    hero && tone === "danger"
      ? { backgroundColor: "rgba(229,72,77,0.08)", borderColor: "rgba(229,72,77,0.18)" }
      : hero && tone === "warn"
        ? { backgroundColor: "rgba(255,173,31,0.08)", borderColor: "rgba(255,173,31,0.18)" }
        : null;

  return (
    <View style={[styles.banner, hero && styles.bannerHero, heroTint]}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <View style={styles.body}>
        <AppText variant="caption" style={[styles.title, hero && { color: colors.heroText }]}>{title}</AppText>
        {hint ? (
          <AppText variant="caption" tone="muted" style={[styles.hint, hero && { color: colors.heroTextDim }]}>{hint}</AppText>
        ) : null}
      </View>
      {state === "backoff" && (
        <Pressable onPress={() => void stopRetrying()} hitSlop={8} accessibilityRole="button" accessibilityLabel="停止重试">
          <AppText variant="caption" tone="accent" style={[styles.action, hero && { color: colors.mist }]}>停止</AppText>
        </Pressable>
      )}
      {givenUp && (
        <Pressable onPress={() => retry()} hitSlop={8} accessibilityRole="button" accessibilityLabel="重试连接">
          <AppText variant="caption" tone="accent" style={[styles.action, hero && { color: colors.mist }]}>重试</AppText>
        </Pressable>
      )}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.x3,
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      paddingHorizontal: space.x4,
      paddingVertical: space.x3,
    },
    bannerHero: {
      backgroundColor: colors.heroCard,
      borderWidth: 1,
      borderColor: colors.heroStroke,
    },
    dot: { width: 7, height: 7, borderRadius: 4 },
    body: { flex: 1, gap: 2 },
    title: { fontWeight: "600" },
    hint: { lineHeight: 17 },
    action: { fontWeight: "600", paddingVertical: 2 },
  });
}
