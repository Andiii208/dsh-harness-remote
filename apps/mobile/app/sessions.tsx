import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FlashList } from "@shopify/flash-list";
import Svg, { Path } from "react-native-svg";
import { StatusBar } from "expo-status-bar";
import { useConnection } from "../src/transport/ConnectionProvider";
import { useI18n } from "../src/i18n";
import { useAppSettings } from "../src/data/appSettingsContext";
import { font, radius, space } from "../src/theme";
import { useTheme } from "../src/theme-context";
import { StatusChip } from "../src/ui/StatusChip";
import { EmptyState } from "../src/ui/EmptyState";
import { SkeletonRow } from "../src/ui/SkeletonRow";
import { Field } from "../src/ui/Field";
import { Button } from "../src/ui/Button";
import { HarnessMark } from "../src/ui/HarnessMark";
import { DeepOceanBackground } from "../src/ui/DeepOceanBackground";
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

function FolderIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function GoalPill({ status, colors, onHero }: { status?: string; colors: ReturnType<typeof useTheme>["colors"]; onHero?: boolean }) {
  if (!status) return null;
  const done = status === "complete" || status === "completed";
  return (
    <Text
      style={[
        {
          fontFamily: font.monoMedium,
          fontSize: font.eyebrow,
          fontWeight: "500",
          borderRadius: radius.pill,
          paddingHorizontal: 7,
          paddingVertical: 2,
          overflow: "hidden",
        },
        onHero
          ? {
              color: colors.mist,
              backgroundColor: colors.heroCard,
              borderWidth: 1,
              borderColor: colors.heroStroke,
            }
          : { color: colors.textMuted, backgroundColor: colors.surface2 },
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
  const stateLabel = (s: typeof state) =>
    s === "online" ? t.common.stateOnline
      : s === "offline" ? t.common.stateOffline
        : s === "backoff" ? t.common.stateBackoff
          : t.common.stateConnecting;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [menuSession, setMenuSession] = useState<SessionSummary | null>(null);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [workspaceSheetVisible, setWorkspaceSheetVisible] = useState(false);
  const [workspaceFilter, setWorkspaceFilter] = useState<string | null>(null);
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

  const pathToTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of workspaceGroups) m.set(normalizePath(w.path), w.title);
    return m;
  }, [workspaceGroups]);

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
    const archived = new Set(archivedIds);
    const visible = archived.size > 0 ? sessions.filter((s) => !archived.has(s.id)) : sessions;
    const scoped = workspaceFilter
      ? visible.filter((s) => normalizePath(s.workspace ?? "") === workspaceFilter)
      : visible;
    const groupedSessions = scoped.map((s) => ({
      ...s,
      workspace: (s.workspace ? pathToTitle.get(normalizePath(s.workspace)) : undefined) ?? s.workspace ?? t.common.other,
    }));
    const filtered = filterSessions(groupedSessions, query);
    return groupByWorkspace(filtered).flatMap<SessionRow>((g) => [
      { kind: "header", key: `header:${g.workspace}`, workspace: g.workspace, count: g.sessions.length },
      ...g.sessions.map((session) => ({ kind: "session" as const, key: session.id, session })),
    ]);
  }, [sessions, query, nativeResults, workspaceGroups, archivedIds, workspaceFilter, pathToTitle]);

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

  const activeWorkspaceTitle = workspaceFilter ? pathToTitle.get(workspaceFilter) ?? workspaceFilter : null;
  const workspaceCardTitle = activeWorkspaceTitle ?? (workspaceGroups.length > 0 ? "全部工作区" : "DeepseekHarnessProject");
  const workspaceCardPath = workspaceFilter ?? (workspaceGroups.length > 0 ? `${workspaceGroups.length} 个工作区` : "通过 Mobile Gateway 连接");

  const renderEmpty = () => {
    if (state === "connecting" || state === "backoff") {
      return (
        <View style={styles.emptyWrap}>
          <SkeletonRow variant="hero" />
          <SkeletonRow variant="hero" />
        </View>
      );
    }
    if (query.trim()) {
      return <EmptyState variant="hero" eyebrow="NO MATCH" text={t.sessions.noMatchText} />;
    }
    if (state === "offline") {
      return (
        <EmptyState
          variant="hero"
          eyebrow="OFFLINE"
          text={t.sessions.offlineText}
          action={<Button label={t.common.goConnect} onPress={() => router.push("/")} full />}
        />
      );
    }
    return (
      <EmptyState
        variant="hero"
        eyebrow="EMPTY"
        text={t.sessions.emptyText}
        action={<Button label={t.sessions.newSession} onPress={() => void onCreate()} full />}
      />
    );
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <DeepOceanBackground whaleTop={Math.max(insets.top + 170, 170)} whaleSize={190} whaleOpacity={0.34} />

      <FlashList
        style={styles.list}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.x3 }]}
        data={rows}
        keyExtractor={(row) => row.key}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.mist} colors={[colors.accent]} progressBackgroundColor={colors.navyRaised} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <HarnessMark size={27} />
              <View style={styles.headerRight}>
                <StatusChip tone={state === "online" ? "success" : state === "offline" ? "danger" : "warn"} label={stateLabel(state)} variant="hero" />
                <Pressable
                  onPress={() => router.push("/settings" as never)}
                  hitSlop={8}
                  style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerIconBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={t.common.settings}
                >
                  <Text style={styles.headerIconText}>⚙</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>{t.sessions.heroTitle}</Text>
              <Text style={styles.heroSubtitle}>{t.sessions.heroSubtitle}</Text>
            </View>

            {/* 工作区选择卡 */}
            <Pressable
              style={({ pressed }) => [styles.workspaceCard, pressed && styles.workspaceCardPressed]}
              onPress={() => setWorkspaceSheetVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="选择工作区"
            >
              <View style={styles.workspaceIconWrap}>
                <FolderIcon color={colors.mist} />
              </View>
              <View style={styles.workspaceBody}>
                <Text style={styles.workspaceTitle} numberOfLines={1}>{workspaceCardTitle}</Text>
                <Text style={styles.workspacePath} numberOfLines={1}>{workspaceCardPath}</Text>
              </View>
              <View style={[styles.workspaceDot, { backgroundColor: state === "online" ? colors.success : colors.heroTextDim }]} />
              <Text style={styles.workspaceChevron}>⌄</Text>
            </Pressable>

            {/* 新建会话 */}
            <Pressable
              style={({ pressed }) => [styles.newSession, pressed && styles.newSessionPressed]}
              onPress={() => void onCreate()}
              disabled={state !== "online"}
              accessibilityRole="button"
              accessibilityLabel={t.sessions.newSession}
            >
              <Text style={styles.newSessionPlusText}>＋</Text>
              <Text style={styles.newSessionText}>{t.sessions.newSession}</Text>
            </Pressable>

            <View style={styles.sessionsHead}>
              <Text style={styles.sessionsTitle}>{t.sessions.title}</Text>
              <Pressable onPress={toggleSearch} hitSlop={8} accessibilityRole="button" accessibilityLabel={searchVisible ? t.sessions.doneSearch : t.common.search}>
                <Text style={styles.searchToggle}>{searchVisible ? t.sessions.doneSearch : t.common.search}</Text>
              </Pressable>
            </View>

            {searchVisible && (
              <Field
                label={t.common.search}
                placeholder={t.sessions.searchPlaceholder}
                value={query}
                onChangeText={onChangeQuery}
                autoFocus
                variant="hero"
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
                <View style={styles.pendingDot} />
                <Text style={styles.pendingText}>{pending.length} {t.sessions.pendingRequests} ›</Text>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={renderEmpty()}
        renderItem={({ item }) =>
          item.kind === "header" ? (
            <View style={styles.groupHeaderRow}>
              <Text style={styles.groupHeader}>{item.workspace}</Text>
              <Text style={styles.groupCount}>{item.count}</Text>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => router.push(`/chat/${encodeURIComponent(item.session.id)}`)}
              onLongPress={() => openMenu(item.session)}
              delayLongPress={350}
              accessibilityRole="button"
              accessibilityLabel={item.session.title ?? item.session.id}
            >
              <View style={[styles.rowDot, { backgroundColor: item.session.running ? colors.success : "rgba(255,255,255,0.35)" }]} />
              <View style={styles.rowBody}>
                <View style={styles.rowHeader}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.session.title ?? item.session.id}
                  </Text>
                  <GoalPill status={item.session.goalStatus} colors={colors} onHero />
                  {item.session.contextPercent !== undefined && item.session.contextPercent >= 70 && (
                    <Text
                      style={[
                        styles.pressure,
                        pressureTier(item.session.contextPercent) === "warn" && { color: colors.amber },
                        pressureTier(item.session.contextPercent) === "danger" && { color: colors.danger },
                      ]}
                    >
                      {item.session.contextPercent}%
                    </Text>
                  )}
                </View>
                <View style={styles.rowMeta}>
                  <Text style={styles.rowId} numberOfLines={1}>{String(item.session.id).slice(0, 16)}</Text>
                  {item.session.lastActiveAt !== undefined && (
                    <Text style={styles.time} numberOfLines={1}>
                      {item.session.running ? t.chat.goalRunning : formatSessionTime(item.session.lastActiveAt, Date.now(), t.common.weekdays, t.common.yesterday)}
                    </Text>
                  )}
                </View>
                {item.session.lastMessage !== undefined && (
                  <Text style={styles.rowPreview} numberOfLines={1}>
                    {item.session.lastMessage}
                  </Text>
                )}
              </View>
              <Text style={styles.rowArrow}>›</Text>
            </Pressable>
          )
        }
      />

      {/* 工作区选择 Sheet */}
      <Modal visible={workspaceSheetVisible} transparent animationType="fade" onRequestClose={() => setWorkspaceSheetVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setWorkspaceSheetVisible(false)} accessibilityRole="button" accessibilityLabel="关闭工作区选择" />
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>选择工作区</Text>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => { setWorkspaceFilter(null); setWorkspaceSheetVisible(false); }}
              accessibilityRole="button"
              accessibilityLabel="全部工作区"
            >
              <Text style={styles.menuItemText}>全部工作区</Text>
              {workspaceFilter === null && <Text style={styles.menuItemTick}>✓</Text>}
            </Pressable>
            {workspaceGroups.map((w) => (
              <Pressable
                key={w.workspaceId}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={() => { setWorkspaceFilter(normalizePath(w.path)); setWorkspaceSheetVisible(false); }}
                accessibilityRole="button"
                accessibilityLabel={w.title}
              >
                <View style={styles.menuItemBody}>
                  <Text style={styles.menuItemText} numberOfLines={1}>{w.title}</Text>
                  <Text style={styles.menuItemSub} numberOfLines={1}>{w.path}</Text>
                </View>
                {workspaceFilter === normalizePath(w.path) && <Text style={styles.menuItemTick}>✓</Text>}
              </Pressable>
            ))}
            <Text style={styles.menuItemHint}>当前宿主未提供目录浏览能力，仅支持按已列出的工作区筛选。</Text>
            <Pressable style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]} onPress={() => setWorkspaceSheetVisible(false)} accessibilityRole="button" accessibilityLabel={t.common.cancel}>
              <Text style={[styles.menuItemText, { color: colors.textMuted }]}>{t.common.cancel}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
    screen: { flex: 1, backgroundColor: colors.navy },
    list: { flex: 1 },
    content: { paddingHorizontal: 20, paddingBottom: space.x7, gap: 12 },
    header: { gap: space.x4, marginBottom: space.x2 },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", rowGap: space.x2 },
    headerRight: { flexDirection: "row", alignItems: "center", gap: space.x3, flexShrink: 1 },
    headerIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.heroCard,
      borderWidth: 1,
      borderColor: colors.heroStroke,
      alignItems: "center",
      justifyContent: "center",
    },
    headerIconBtnPressed: { opacity: 0.7 },
    headerIconText: { color: colors.heroText, fontSize: 17, fontWeight: "600" },
    heroCopy: { gap: 7, paddingTop: space.x3 },
    heroTitle: {
      color: colors.heroText,
      fontFamily: font.displayBold,
      fontSize: 32,
      fontWeight: "700",
      letterSpacing: -0.8,
      lineHeight: 38,
    },
    heroSubtitle: { color: colors.heroTextDim, fontSize: 17, lineHeight: 22 },
    workspaceCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.heroCard,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.heroStroke,
      padding: 16,
    },
    workspaceCardPressed: { backgroundColor: "rgba(255,255,255,0.09)" },
    workspaceIcon: { fontSize: 20 },
    workspaceIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.08)",
      borderWidth: 1,
      borderColor: colors.heroStroke,
      alignItems: "center",
      justifyContent: "center",
    },
    workspaceBody: { flex: 1, gap: 2 },
    workspaceTitle: { color: colors.heroText, fontSize: 16, fontWeight: "600", letterSpacing: -0.2 },
    workspacePath: { color: colors.heroTextDim, fontSize: 12, fontFamily: font.mono },
    workspaceDot: { width: 7, height: 7, borderRadius: 4 },
    workspaceChevron: { color: colors.heroTextDim, fontSize: 13, fontWeight: "600" },
    newSession: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.ocean,
      borderRadius: 14,
      height: 48,
      shadowColor: colors.ocean,
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    newSessionPressed: { opacity: 0.85 },
    newSessionPlusText: { color: "#FFFFFF", fontSize: 18, fontWeight: "600", lineHeight: 20 },
    newSessionText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
    sessionsHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: space.x3,
    },
    sessionsTitle: { color: colors.heroText, fontSize: 17, fontWeight: "600" },
    searchToggle: { color: colors.mist, fontSize: 13, fontWeight: "500" },
    pendingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.x2,
      backgroundColor: colors.heroCard,
      borderWidth: 1,
      borderColor: colors.heroStroke,
      borderRadius: radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
      alignSelf: "flex-start",
    },
    pendingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.amber },
    pendingText: { color: colors.mist, fontSize: 13, fontWeight: "500", letterSpacing: -0.1 },
    refreshError: { color: colors.danger, fontSize: font.caption, fontFamily: font.mono },
    groupHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: space.x3,
      paddingBottom: space.x2,
      paddingHorizontal: 2,
    },
    groupHeader: { color: colors.mist, fontFamily: font.monoBold, fontSize: font.eyebrow, letterSpacing: 1.4, textTransform: "uppercase" },
    groupCount: { color: colors.heroTextDim, fontSize: font.eyebrow, fontFamily: font.mono },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.heroCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.heroStroke,
      paddingVertical: 13,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    rowPressed: { backgroundColor: "rgba(255,255,255,0.09)" },
    rowDot: { width: 8, height: 8, borderRadius: 4 },
    rowBody: { flex: 1, gap: 3 },
    rowHeader: { flexDirection: "row", alignItems: "center", gap: space.x2 },
    rowTitle: { color: colors.heroText, fontSize: 16 * scale, fontWeight: "600", letterSpacing: -0.2, flexShrink: 1 },
    rowMeta: { flexDirection: "row", alignItems: "center", gap: space.x2 },
    rowId: { color: "rgba(242,246,255,0.40)", fontSize: 11, fontFamily: font.mono, flexShrink: 1 },
    rowPreview: { color: colors.heroTextDim, fontSize: font.caption * scale, lineHeight: 18 * scale, letterSpacing: 0.1 },
    time: { color: "rgba(242,246,255,0.48)", fontSize: 11, fontFamily: font.mono },
    pressure: { fontSize: font.eyebrow, fontFamily: font.mono, letterSpacing: 0.2 },
    rowArrow: { color: colors.heroTextDim, fontSize: 18, fontWeight: "300" },
    emptyWrap: { alignItems: "center", paddingTop: space.x7 * 2, gap: space.x2, paddingHorizontal: space.x4 },
    emptyEyebrow: { color: colors.mist, fontFamily: font.monoBold, fontSize: font.eyebrow, letterSpacing: 1.6, textTransform: "uppercase" },
    emptyText: { color: colors.heroTextDim, fontSize: font.caption, textAlign: "center" },
    emptyAction: { marginTop: space.x2, minWidth: 160, alignSelf: "center" },
    skeletonBar: { height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.08)" },
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
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    menuItemBody: { flex: 1, gap: 2 },
    menuItemSub: { color: colors.textMuted, fontSize: font.caption, fontFamily: font.mono },
    menuItemHint: { color: colors.textDim, fontSize: font.caption, lineHeight: 18, paddingHorizontal: 2, paddingBottom: 4 },
    menuItemPressed: { opacity: 0.7 },
    menuItemText: { color: colors.text, fontSize: font.body, fontWeight: "500" },
    menuItemTick: { color: colors.accent, fontSize: font.body, fontWeight: "600" },
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
