import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { FlashList } from "@shopify/flash-list";
import { useConnection, STATE_LABEL } from "../src/transport/ConnectionProvider";
import { font, radius, space } from "../src/theme";
import { useTheme } from "../src/theme-context";
import { SectionLabel } from "../src/ui/SectionLabel";
import { StatusChip } from "../src/ui/StatusChip";
import { EmptyState } from "../src/ui/EmptyState";
import { SkeletonRow } from "../src/ui/SkeletonRow";
import { useEntering } from "../src/ui/anim";

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function GoalPill({ status, colors }: { status?: string; colors: ReturnType<typeof useTheme>["colors"] }) {
  if (!status) return null;
  const done = status === "complete";
  return (
    <Text style={[
      { color: colors.warn, backgroundColor: "rgba(217,130,11,0.08)", fontFamily: font.monoBold, fontSize: 9, fontWeight: "500", letterSpacing: 0.5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
      done && { color: colors.success, backgroundColor: "rgba(46,158,91,0.08)" },
    ]}>
      {status.toUpperCase()}
    </Text>
  );
}

export default function SessionsScreen() {
  const { sessions, pending, state, refreshSessions } = useConnection();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const entering = useEntering();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const autoRefreshed = useRef(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (state === "offline") autoRefreshed.current = false;
    if (state === "online" && !autoRefreshed.current) {
      autoRefreshed.current = true;
      setRefreshError("");
      void refreshSessions().catch(() => setRefreshError("刷新失败：连接异常"));
    }
  }, [state, refreshSessions]);

  const onRefresh = async () => {
    setRefreshing(true);
    setRefreshError("");
    try {
      await refreshSessions();
    } catch {
      setRefreshError("刷新失败：连接异常");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <FlashList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={sessions}
      keyExtractor={(s) => s.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.textMuted} colors={[colors.accent]} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Sessions</Text>
              <SectionLabel>{`Sessions ${sessions.length}`}</SectionLabel>
            </View>
            <View style={styles.headerActions}>
              <Pressable onPress={() => router.push("/settings" as never)} hitSlop={8}>
                <Text style={styles.settingsLink}>设置</Text>
              </Pressable>
              <StatusChip tone={state === "online" ? "success" : state === "offline" ? "danger" : "warn"} label={STATE_LABEL[state] ?? state} />
            </View>
          </View>
          {refreshError.length > 0 && <Text style={styles.refreshError}>{refreshError}</Text>}
          {pending.length > 0 && (
            <Pressable
              style={styles.pendingBanner}
              onPress={() => router.push("/approval" as never)}
              accessibilityRole="button"
              accessibilityLabel={`${pending.length} 个待处理请求`}
            >
              <Text style={styles.pendingText}>
                {pending.length} 个待处理请求（审批 / 提问）›
              </Text>
            </Pressable>
          )}
        </View>
      }
      ListEmptyComponent={
        state === "connecting" || state === "backoff" ? (
          <View style={styles.skeletonStack}>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        ) : (
          <EmptyState eyebrow="NO SESSIONS" text="等待注册表 / 投影帧推送（可先连接 mock-harness）" />
        )
      }
      renderItem={({ item: s }) => (
        <Animated.View entering={entering}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push(`/chat/${encodeURIComponent(s.id)}`)}
            accessibilityRole="button"
            accessibilityLabel={s.title ?? s.id}
          >
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {s.title ?? s.id}
              </Text>
              <GoalPill status={s.goalStatus} colors={colors} />
              <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">›</Text>
            </View>
            {s.lastMessage !== undefined && (
              <Text style={styles.rowPreview} numberOfLines={1}>
                {s.lastMessage}
              </Text>
            )}
            <View style={styles.rowMeta}>
              {s.workspace !== undefined && (
                <Text style={styles.metaText} numberOfLines={1}>
                  {s.workspace}
                </Text>
              )}
              {s.tokenUsageTotal !== undefined && (
                <Text style={styles.metaText}>{s.tokenUsageTotal.toLocaleString()} tok</Text>
              )}
              {s.lastActiveAt !== undefined && (
                <Text style={[styles.metaText, styles.metaTime]}>{formatRelative(s.lastActiveAt)}</Text>
              )}
              {s.contextPercent !== undefined && (
                <View style={styles.miniBar}>
                  <View
                    style={[
                      styles.miniBarFill,
                      { width: `${Math.min(100, s.contextPercent)}%` },
                      s.contextPercent >= 80 && { backgroundColor: colors.warn },
                    ]}
                  />
                </View>
              )}
            </View>
          </Pressable>
        </Animated.View>
      )}
    />
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.x5, gap: space.x3, paddingBottom: space.x7 },
    header: { gap: space.x3, marginBottom: space.x2 },
    headerRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.x3 },
    headerText: { gap: space.x1 },
    title: {
      color: colors.text,
      fontFamily: font.display,
      fontSize: 34,
      fontWeight: "600",
      letterSpacing: -1,
    },
    headerActions: { flexDirection: "row", alignItems: "center", gap: space.x3 },
    settingsLink: { color: colors.accent, fontSize: 13, fontWeight: "500" },
    pendingBanner: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.accentSoft,
      borderRadius: radius.card,
      paddingVertical: 13,
      paddingHorizontal: space.x5,
    },
    pendingText: { color: colors.accent, fontSize: 14, fontWeight: "500", letterSpacing: -0.1, flex: 1 },
    refreshError: { color: colors.danger, fontSize: font.caption, fontFamily: font.mono },
    row: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      padding: space.x5,
      gap: 9,
    },
    rowPressed: { backgroundColor: colors.surface2 },
    skeletonStack: { gap: space.x3 },
    rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.x2 },
    rowTitle: { color: colors.text, fontSize: font.section + 1, fontWeight: "500", letterSpacing: -0.2, flex: 1 },
    chevron: { color: colors.textDim, fontSize: 18, fontWeight: "300", fontFamily: font.mono },
    rowPreview: { color: colors.textMuted, fontSize: font.caption, lineHeight: 18, letterSpacing: 0.1 },
    rowMeta: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 7 },
    metaText: { color: colors.textMuted, fontSize: 10, fontFamily: font.mono, letterSpacing: 0.2, flexShrink: 1 },
    miniBar: {
      flex: 1,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.surface2,
      overflow: "hidden",
      maxWidth: 80,
    },
    miniBarFill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
    metaTime: { marginLeft: "auto" },
  });
}
