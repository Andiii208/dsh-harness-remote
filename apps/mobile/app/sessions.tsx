import { useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useConnection, STATE_LABEL } from "../src/transport/ConnectionProvider";
import { colors, font, radius, space, stroke } from "../src/theme";
import { SectionLabel } from "../src/ui/SectionLabel";
import { StatusChip } from "../src/ui/StatusChip";
import { EmptyState } from "../src/ui/EmptyState";

function GoalPill({ status }: { status?: string }) {
  if (!status) return null;
  const done = status === "complete";
  return (
    <Text style={[styles.goalPill, done && styles.goalPillDone]}>
      {status.toUpperCase()}
    </Text>
  );
}

export default function SessionsScreen() {
  const { sessions, pending, state } = useConnection();
  const router = useRouter();

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={sessions}
      keyExtractor={(s) => s.id}
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
          {pending.length > 0 && (
            <Pressable
              style={styles.pendingBanner}
              onPress={() =>
                pending[0] && router.push(`/approval/${encodeURIComponent(pending[0].rpcId)}`)
              }
            >
              <View style={[styles.pendingRail, { backgroundColor: colors.warn }]} />
              <Text style={styles.pendingText}>
                {pending.length} 个待处理请求（审批 / 提问）→
              </Text>
            </Pressable>
          )}
        </View>
      }
      ListEmptyComponent={
        <EmptyState eyebrow="NO SESSIONS" text="等待注册表 / 投影帧推送（可先连接 mock-harness）" />
      }
      renderItem={({ item: s }) => (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push(`/chat/${encodeURIComponent(s.id)}`)}
        >
          <View style={styles.rowHeader}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {s.title ?? s.id}
            </Text>
            <GoalPill status={s.goalStatus} />
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
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.x5, gap: space.x3, paddingBottom: space.x7 },
  header: { gap: space.x3, marginBottom: space.x2 },
  headerRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.x3 },
  headerText: { gap: space.x1 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: space.x3 },
  settingsLink: { color: colors.textMuted, fontSize: font.caption, fontFamily: font.mono },
  title: { color: colors.text, fontSize: font.title, fontWeight: "600", letterSpacing: -0.2 },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.x3,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    paddingVertical: space.x3,
    paddingRight: space.x4,
    overflow: "hidden",
  },
  pendingRail: { width: 3, alignSelf: "stretch", borderRadius: 2 },
  pendingText: { color: "#FCD34D", fontSize: font.body - 1, fontWeight: "600", flex: 1 },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    padding: space.x4,
    gap: space.x2,
  },
  rowPressed: { backgroundColor: colors.surface2 },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.x2 },
  rowTitle: { color: colors.text, fontSize: font.section, fontWeight: "600", flex: 1 },
  goalPill: {
    color: "#0A0C10",
    fontSize: font.eyebrow - 1,
    fontFamily: font.mono,
    fontWeight: "700",
    backgroundColor: colors.warn,
    borderRadius: radius.pill,
    paddingHorizontal: space.x2,
    paddingVertical: 2,
    overflow: "hidden",
  },
  goalPillDone: { backgroundColor: colors.success },
  rowPreview: { color: colors.textMuted, fontSize: font.caption, lineHeight: 18 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: space.x3 },
  metaText: { color: colors.textDim, fontSize: font.eyebrow, fontFamily: font.mono, flexShrink: 1 },
  miniBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.surface2,
    overflow: "hidden",
  },
  miniBarFill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
});
