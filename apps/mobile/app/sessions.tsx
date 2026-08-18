import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { FlashList } from "@shopify/flash-list";
import { useConnection, STATE_LABEL } from "../src/transport/ConnectionProvider";
import { useAppSettings } from "../src/data/appSettingsContext";
import { font, radius, space } from "../src/theme";
import { useTheme } from "../src/theme-context";
import { StatusChip } from "../src/ui/StatusChip";
import { SkeletonRow } from "../src/ui/SkeletonRow";
import { Field } from "../src/ui/Field";
import { useEntering } from "../src/ui/anim";
import type { SessionSummary } from "../src/data/SessionStore";
import { filterSessions, groupByWorkspace, pressureTier } from "../src/data/sessionViews";

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function goalLabel(status?: string): string {
  switch (status) {
    case "active":
      return "进行中";
    case "paused":
      return "已暂停";
    case "complete":
    case "completed":
      return "已完成";
    default:
      return status ?? "";
  }
}

function GoalPill({ status, colors }: { status?: string; colors: ReturnType<typeof useTheme>["colors"] }) {
  if (!status) return null;
  const done = status === "complete" || status === "completed";
  return (
    <Text
      style={[
        {
          color: colors.textMuted,
          backgroundColor: colors.surface2,
          fontFamily: font.monoMedium,
          fontSize: 9,
          fontWeight: "500",
          borderRadius: radius.pill,
          paddingHorizontal: 7,
          paddingVertical: 2,
          overflow: "hidden",
        },
        done && { color: colors.success, backgroundColor: "rgba(46,158,91,0.08)" },
      ]}
    >
      {goalLabel(status)}
    </Text>
  );
}

type SessionRow =
  | { kind: "header"; key: string; workspace: string; count: number }
  | { kind: "session"; key: string; session: SessionSummary };

export default function SessionsScreen() {
  const { sessions, pending, state, refreshSessions, createSession } = useConnection();
  const { colors } = useTheme();
  const { scale } = useAppSettings();
  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);
  const router = useRouter();
  const entering = useEntering();
  const [query, setQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const autoRefreshed = useRef(false);
  const [, setTick] = useState(0);

  const rows = useMemo<SessionRow[]>(() => {
    const filtered = filterSessions(sessions, query);
    return groupByWorkspace(filtered).flatMap<SessionRow>((g) => [
      { kind: "header", key: `header:${g.workspace}`, workspace: g.workspace, count: g.sessions.length },
      ...g.sessions.map((session) => ({ kind: "session" as const, key: session.id, session })),
    ]);
  }, [sessions, query]);
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

  const toggleSearch = () => {
    if (searchVisible) {
      setQuery("");
      setSearchVisible(false);
    } else {
      setSearchVisible(true);
    }
  };

  const onChangeQuery = (text: string) => {
    setQuery(text);
    if (text.trim() === "") setSearchVisible(false);
  };

  const onCreate = async () => {
    if (state !== "online") return;
    const id = await createSession();
    if (id) {
      void refreshSessions().catch(() => {});
      router.push(`/chat/${encodeURIComponent(id)}`);
    } else {
      setRefreshError("新建会话失败：请确认 DSH 已开启会话能力");
    }
  };

  return (
    <FlashList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={rows}
      keyExtractor={(row) => row.key}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.textMuted} colors={[colors.accent]} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>会话</Text>
              <StatusChip tone={state === "online" ? "success" : state === "offline" ? "danger" : "warn"} label={STATE_LABEL[state] ?? state} />
            </View>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => void onCreate()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="新建会话"
                style={({ pressed }) => [styles.newChatButton, pressed && styles.rowPressed]}
                disabled={state !== "online"}
              >
                <Text style={styles.newChatText}>＋ 新会话</Text>
              </Pressable>
              <Pressable onPress={toggleSearch} hitSlop={8} accessibilityRole="button" accessibilityLabel={searchVisible ? "完成搜索" : "搜索"}>
                <Text style={styles.headerLink}>{searchVisible ? "完成" : "搜索"}</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/settings" as never)} hitSlop={8} accessibilityRole="button" accessibilityLabel="设置">
                <Text style={styles.headerLink}>设置</Text>
              </Pressable>
            </View>
          </View>
          {searchVisible && (
            <Field
              label="搜索"
              placeholder="搜索标题 / workspace / 最近消息"
              value={query}
              onChangeText={onChangeQuery}
              autoFocus
            />
          )}
          {refreshError.length > 0 && <Text style={styles.refreshError}>{refreshError}</Text>}
          {pending.length > 0 && (
            <Pressable
              style={styles.pendingRow}
              onPress={() => router.push("/approval" as never)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`${pending.length} 个待处理请求`}
            >
              <Text style={styles.pendingText}>{pending.length} 个待处理请求 ›</Text>
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
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{query.trim() ? "没有匹配的会话" : "还没有会话"}</Text>
          </View>
        )
      }
      renderItem={({ item }) =>
        item.kind === "header" ? (
          <Text style={styles.groupHeader}>{item.workspace}</Text>
        ) : (
          <Animated.View entering={entering}>
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => router.push(`/chat/${encodeURIComponent(item.session.id)}`)}
              accessibilityRole="button"
              accessibilityLabel={item.session.title ?? item.session.id}
            >
              <View style={styles.rowHeader}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.session.title ?? item.session.id}
                </Text>
                <GoalPill status={item.session.goalStatus} colors={colors} />
                {item.session.contextPercent !== undefined && item.session.contextPercent >= 70 && (
                  <Text
                    style={[
                      styles.pressure,
                      pressureTier(item.session.contextPercent) === "warn" && { color: colors.warn },
                      pressureTier(item.session.contextPercent) === "danger" && { color: colors.danger },
                    ]}
                  >
                    {item.session.contextPercent}%
                  </Text>
                )}
                {item.session.lastActiveAt !== undefined && (
                  <Text style={styles.time} numberOfLines={1}>
                    {formatRelative(item.session.lastActiveAt)}
                  </Text>
                )}
              </View>
              {item.session.lastMessage !== undefined && (
                <Text style={styles.rowPreview} numberOfLines={1}>
                  {item.session.lastMessage}
                </Text>
              )}
            </Pressable>
          </Animated.View>
        )
      }
    />
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"], scale: number) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.x5, gap: space.x3, paddingBottom: space.x7 },
    header: { gap: space.x2, marginBottom: space.x2 },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.x3 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: space.x2 },
    title: {
      color: colors.text,
      fontFamily: font.display,
      fontSize: 28,
      fontWeight: "600",
      letterSpacing: -0.5,
    },
    headerActions: { flexDirection: "row", alignItems: "center", gap: space.x4 },
    newChatButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    newChatText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600", letterSpacing: -0.1 },
    headerLink: { color: colors.accent, fontSize: 13, fontWeight: "500" },
    pendingRow: { paddingVertical: 2 },
    pendingText: { color: colors.accent, fontSize: 14, fontWeight: "500", letterSpacing: -0.1 },
    refreshError: { color: colors.danger, fontSize: font.caption, fontFamily: font.mono },
    row: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      padding: space.x4,
      gap: 8,
    },
    rowPressed: { backgroundColor: colors.surface2 },
    skeletonStack: { gap: space.x3 },
    rowHeader: { flexDirection: "row", alignItems: "center", gap: space.x2 },
    rowTitle: { color: colors.text, fontSize: (font.section + 1) * scale, fontWeight: "500", letterSpacing: -0.2, flex: 1 },
    rowPreview: { color: colors.textMuted, fontSize: font.caption * scale, lineHeight: 18 * scale, letterSpacing: 0.1 },
    time: { color: colors.textDim, fontSize: 10, fontFamily: font.mono },
    pressure: { fontSize: 10, fontFamily: font.mono, letterSpacing: 0.2 },
    groupHeader: { color: colors.textMuted, fontSize: font.caption, fontWeight: "500", paddingTop: space.x2 },
    empty: { alignItems: "center", paddingTop: space.x7 * 2 },
    emptyText: { color: colors.textMuted, fontSize: font.caption, textAlign: "center" },
  });
}
