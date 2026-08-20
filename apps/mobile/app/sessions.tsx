import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import { useConnection, STATE_LABEL } from "../src/transport/ConnectionProvider";
import { useI18n } from "../src/i18n";
import { useAppSettings } from "../src/data/appSettingsContext";
import { font, radius, space } from "../src/theme";
import { useTheme } from "../src/theme-context";
import { StatusChip } from "../src/ui/StatusChip";
import { SkeletonRow } from "../src/ui/SkeletonRow";
import { Field } from "../src/ui/Field";
import { EmptyState } from "../src/ui/EmptyState";
import { Button } from "../src/ui/Button";
import type { SessionSummary } from "../src/data/SessionStore";
import { filterSessions, formatSessionTime, groupByWorkspace, pressureTier } from "../src/data/sessionViews";

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
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
          fontSize: font.eyebrow,
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
  const { sessions, pending, state, refreshSessions, createSession, renameSession, forkSession, archiveSession, searchSessions, workspaceList } = useConnection();
  const { t } = useI18n();
  const { colors } = useTheme();
  const { scale } = useAppSettings();
  const styles = useMemo(() => createStyles(colors, scale), [colors, scale]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [menuSession, setMenuSession] = useState<SessionSummary | null>(null);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const autoRefreshed = useRef(false);
  const [, setTick] = useState(0);

  // 原生 session.search：输入停止后触发，结果合并到本地过滤中。
  const nativeSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [nativeResults, setNativeResults] = useState<Array<{ sessionId: string; snippet: string }> | null>(null);
  useEffect(() => {
    if (nativeSearchTimer.current) clearTimeout(nativeSearchTimer.current);
    if (!query.trim() || state !== "online") {
      setNativeResults(null);
      return;
    }
    nativeSearchTimer.current = setTimeout(() => {
      void searchSessions(query.trim()).then(setNativeResults).catch(() => setNativeResults(null));
    }, 300);
    return () => {
      if (nativeSearchTimer.current) clearTimeout(nativeSearchTimer.current);
    };
  }, [query, state, searchSessions]);

  // 原生 workspace.list：用于按工作区标题分组 + 过滤已归档会话。
  const [workspaceGroups, setWorkspaceGroups] = useState<Array<{ workspaceId: string; path: string; title: string; sessionIds: string[] }>>([]);
  const [archivedIds, setArchivedIds] = useState<string[]>([]);
  useEffect(() => {
    if (state !== "online") return;
    void workspaceList().then((list) => {
      if (!list) return;
      setWorkspaceGroups(list.items);
      setArchivedIds(list.archivedSessionIds);
    });
  }, [state, workspaceList]);

  const rows = useMemo<SessionRow[]>(() => {
    // 原生搜索优先：session.search 结果映射回本地 session 摘要。
    if (nativeResults !== null) {
      const ids = new Set(nativeResults.map((r) => r.sessionId));
      const matched = sessions.filter((s) => ids.has(s.id));
      return [
        { kind: "header", key: "search-header", workspace: `${t.sessions.searchResults} ${matched.length}`, count: matched.length },
        ...matched.map((session) => ({ kind: "session" as const, key: session.id, session })),
      ];
    }
    // 原生 workspace 分组：按 workspace.list 的 path → title 映射，同时过滤已归档会话。
    const pathToTitle = new Map(workspaceGroups.map((w) => [normalizePath(w.path), w.title]));
    const archived = new Set(archivedIds);
    const visible = archived.size > 0 ? sessions.filter((s) => !archived.has(s.id)) : sessions;
    const groupedSessions = visible.map((s) => ({
      ...s,
      workspace: (s.workspace ? pathToTitle.get(normalizePath(s.workspace)) : undefined) ?? s.workspace ?? t.common.other,
    }));
    const filtered = filterSessions(groupedSessions, query);
    return groupByWorkspace(filtered).flatMap<SessionRow>((g) => [
      { kind: "header", key: `header:${g.workspace}`, workspace: g.workspace, count: g.sessions.length },
      ...g.sessions.map((session) => ({ kind: "session" as const, key: session.id, session })),
    ]);
  }, [sessions, query, nativeResults, workspaceGroups, archivedIds]);
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (state === "offline") autoRefreshed.current = false;
    if (state === "online" && !autoRefreshed.current) {
      autoRefreshed.current = true;
      setRefreshError("");
      void refreshSessions().catch(() => setRefreshError(t.sessions.refreshFailed));
    }
  }, [state, refreshSessions]);

  const onRefresh = async () => {
    setRefreshing(true);
    setRefreshError("");
    try {
      await refreshSessions();
    } catch {
      setRefreshError(t.sessions.refreshFailed);
    } finally {
      setRefreshing(false);
    }
  };

  const openMenu = (session: SessionSummary) => {
    setMenuSession(session);
  };

  const doRename = async () => {
    if (!menuSession || !renameTitle.trim()) return;
    const ok = await renameSession(menuSession.id, renameTitle.trim());
    if (ok) {
      setRenameVisible(false);
      setMenuSession(null);
      void refreshSessions().catch(() => {});
    } else {
      setRefreshError(t.sessions.renameFailed);
    }
  };

  const doFork = async () => {
    if (!menuSession) return;
    const id = await forkSession(menuSession.id);
    if (id) {
      setMenuSession(null);
      void refreshSessions().catch(() => {});
      router.push(`/chat/${encodeURIComponent(id)}`);
    } else {
      setRefreshError(t.sessions.forkFailed);
    }
  };

  const doArchive = async () => {
    if (!menuSession) return;
    const ok = await archiveSession(menuSession.id);
    if (ok) {
      setMenuSession(null);
      void refreshSessions().catch(() => {});
    } else {
      setRefreshError(t.sessions.archiveFailed);
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
      setRefreshError(t.sessions.createFailed);
    }
  };

  return (
    <View style={styles.screen}>
      <FlashList
        style={styles.list}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.x2 }]}
        data={rows}
        keyExtractor={(row) => row.key}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.textMuted} colors={[colors.accent]} />
        }
      ListHeaderComponent={
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="返回连接页" style={styles.backRow}>
            <Text style={styles.backText}>{t.sessions.backToConnect}</Text>
          </Pressable>
          <View style={styles.headerRow}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{t.sessions.title}</Text>
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
                <Text style={styles.newChatText}>{t.sessions.newSession}</Text>
              </Pressable>
              <Pressable onPress={toggleSearch} hitSlop={8} accessibilityRole="button" accessibilityLabel={searchVisible ? t.sessions.doneSearch : t.common.search}>
                <Text style={styles.headerLink}>{searchVisible ? t.sessions.doneSearch : t.common.search}</Text>
              </Pressable>
              <Pressable onPress={() => router.push("/settings" as never)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.common.settings}>
                <Text style={styles.headerLink}>{t.common.settings}</Text>
              </Pressable>
            </View>
          </View>
          {searchVisible && (
            <Field
              label={t.common.search}
              placeholder={t.sessions.searchPlaceholder}
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
              accessibilityLabel={`${pending.length} ${t.sessions.pendingRequests}`}
            >
              <Text style={styles.pendingText}>{pending.length} {t.sessions.pendingRequests} ›</Text>
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
        ) : query.trim() ? (
          <EmptyState eyebrow="NO MATCH" text={t.sessions.noMatchText} />
        ) : state === "offline" ? (
          <EmptyState
            eyebrow="OFFLINE"
            text={t.sessions.offlineText}
            action={<Button label={t.common.goConnect} onPress={() => router.push("/")} full />}
          />
        ) : (
          <EmptyState
            eyebrow="EMPTY"
            text={t.sessions.emptyText}
            action={<Button label={t.sessions.newSession} onPress={() => void onCreate()} full />}
          />
        )
      }
      renderItem={({ item }) =>
        item.kind === "header" ? (
          <Text style={styles.groupHeader}>{item.workspace}</Text>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push(`/chat/${encodeURIComponent(item.session.id)}`)}
            onLongPress={() => openMenu(item.session)}
            delayLongPress={350}
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
                  {formatSessionTime(item.session.lastActiveAt)}
                </Text>
              )}
            </View>
            {item.session.lastMessage !== undefined && (
              <Text style={styles.rowPreview} numberOfLines={1}>
                {item.session.lastMessage}
              </Text>
            )}
          </Pressable>
        )
      }
      />

      {/* 会话操作菜单（长按触发） */}
      <Modal visible={menuSession !== null} transparent animationType="fade" onRequestClose={() => setMenuSession(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuSession(null)} accessibilityRole="button" accessibilityLabel="关闭会话菜单" />
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>{menuSession?.title ?? menuSession?.id ?? t.sessions.menuTitle}</Text>
            <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]} onPress={() => { setRenameTitle(menuSession?.title ?? ""); setRenameVisible(true); }} accessibilityRole="button" accessibilityLabel={t.sessions.menuRename}>
              <Text style={styles.menuItemText}>{t.sessions.menuRename}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]} onPress={() => void doFork()} accessibilityRole="button" accessibilityLabel={t.sessions.menuFork}>
              <Text style={styles.menuItemText}>{t.sessions.menuFork}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]} onPress={() => void doArchive()} accessibilityRole="button" accessibilityLabel={t.sessions.menuArchive}>
              <Text style={[styles.menuItemText, { color: colors.danger }]}>{t.sessions.menuArchive}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]} onPress={() => setMenuSession(null)} accessibilityRole="button" accessibilityLabel={t.common.cancel}>
              <Text style={[styles.menuItemText, { color: colors.textMuted }]}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 重命名弹窗 */}
      <Modal visible={renameVisible} transparent animationType="fade" onRequestClose={() => setRenameVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRenameVisible(false)} accessibilityRole="button" accessibilityLabel="关闭重命名" />
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>{t.sessions.renameTitle}</Text>
            <TextInput
              style={styles.renameInput}
              value={renameTitle}
              onChangeText={setRenameTitle}
              placeholder={t.sessions.renamePlaceholder}
              placeholderTextColor={colors.textDim}
              autoFocus
            />
            <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]} onPress={() => void doRename()} accessibilityRole="button" accessibilityLabel={t.sessions.renameConfirm}>
              <Text style={styles.menuItemText}>{t.sessions.renameConfirm}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]} onPress={() => setRenameVisible(false)} accessibilityRole="button" accessibilityLabel={t.common.cancel}>
              <Text style={[styles.menuItemText, { color: colors.textMuted }]}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"], scale: number) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    list: { flex: 1 },
    content: { padding: space.x5, gap: space.x3, paddingBottom: space.x7 },
    header: { gap: space.x2, marginBottom: space.x2 },
    backRow: { alignItems: "flex-start", paddingVertical: 2 },
    backText: { color: colors.accent, fontSize: font.body, fontWeight: "500" },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.x3, flexWrap: "wrap", rowGap: space.x2 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: space.x2, flexShrink: 1 },
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
    newChatText: { color: "#FFFFFF", fontSize: font.transcript, fontWeight: "600", letterSpacing: -0.1 },
    headerLink: { color: colors.accent, fontSize: font.transcript, fontWeight: "500" },
    pendingRow: { paddingVertical: 2 },
    pendingText: { color: colors.accent, fontSize: font.body, fontWeight: "500", letterSpacing: -0.1 },
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
    time: { color: colors.textDim, fontSize: font.eyebrow, fontFamily: font.mono },
    pressure: { fontSize: font.eyebrow, fontFamily: font.mono, letterSpacing: 0.2 },
    groupHeader: { color: colors.textMuted, fontSize: font.caption, fontWeight: "500", paddingTop: space.x2 },
    empty: { alignItems: "center", paddingTop: space.x7 * 2 },
    emptyText: { color: colors.textMuted, fontSize: font.caption, textAlign: "center" },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    menuPanel: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 16,
      paddingBottom: 28,
      gap: 8,
    },
    menuTitle: { color: colors.text, fontSize: font.section, fontWeight: "600", marginBottom: 6 },
    menuItem: {
      backgroundColor: colors.surface2,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    menuItemPressed: { opacity: 0.7 },
    menuItemText: { color: colors.text, fontSize: font.body, fontWeight: "500" },
    renameInput: {
      backgroundColor: colors.surface2,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      color: colors.text,
      fontSize: font.body,
      marginBottom: 4,
    },
  });
}
