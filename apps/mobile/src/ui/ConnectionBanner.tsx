/**
 * ConnectionBanner — 连接状态横幅。
 * 迁移自 Cindy 的 ConnectionBanner 结构：
 * - 普通断线 1.2s 静默窗口后再显示，避免快速重连时闪一下。
 * - 有错误分类（lastError）时立即显示标题 + 一句原因 + 动作按钮。
 */

import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useConnection } from "../transport/ConnectionProvider";
import { radius, space } from "../theme";
import { useTheme } from "../theme-context";
import { AppText } from "./AppText";

const OFFLINE_DELAY_MS = 1_200;

export function ConnectionBanner() {
  const { state, lastError, givenUp, retry, stopRetrying } = useConnection();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [offlineLongEnough, setOfflineLongEnough] = useState(false);

  const offline = state !== "online";
  useEffect(() => {
    if (!offline) {
      setOfflineLongEnough(false);
      return;
    }
    const t = setTimeout(() => setOfflineLongEnough(true), OFFLINE_DELAY_MS);
    return () => clearTimeout(t);
  }, [offline]);

  const visible =
    lastError !== null ||
    state === "connecting" ||
    (offline && offlineLongEnough) ||
    givenUp;

  if (!visible) return null;

  const tone = lastError || givenUp ? "danger" : state === "connecting" || state === "backoff" ? "warn" : "neutral";
  const dotColor = tone === "danger" ? colors.danger : tone === "warn" ? colors.warn : colors.textDim;

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
    title = "未连接";
  }

  return (
    <View style={styles.banner}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <View style={styles.body}>
        <AppText variant="caption" style={styles.title}>{title}</AppText>
        {hint ? <AppText variant="caption" tone="muted" style={styles.hint}>{hint}</AppText> : null}
      </View>
      {state === "backoff" && (
        <Pressable onPress={() => void stopRetrying()} hitSlop={8} accessibilityRole="button" accessibilityLabel="停止重试">
          <AppText variant="caption" tone="accent" style={styles.action}>停止</AppText>
        </Pressable>
      )}
      {givenUp && (
        <Pressable onPress={() => retry()} hitSlop={8} accessibilityRole="button" accessibilityLabel="重试连接">
          <AppText variant="caption" tone="accent" style={styles.action}>重试</AppText>
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
    dot: { width: 7, height: 7, borderRadius: 4 },
    body: { flex: 1, gap: 2 },
    title: { fontWeight: "600" },
    hint: { lineHeight: 17 },
    action: { fontWeight: "600", paddingVertical: 2 },
  });
}
