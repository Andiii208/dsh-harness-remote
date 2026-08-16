import { useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useConnection } from "../src/transport/ConnectionProvider";
import { colors, font, radius, space, stroke } from "../src/theme";

function GoalBar({ percent }: { percent?: number }) {
  if (percent === undefined) return null;
  return (
    <View style={styles.miniBar}>
      <View style={[styles.miniBarFill, { width: `${Math.min(100, percent)}%` }]} />
    </View>
  );
}

export default function SessionsScreen() {
  const { sessions } = useConnection();
  const router = useRouter();

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={{ padding: space.x4, gap: space.x3 }}
      data={sessions}
      keyExtractor={(s) => s.id}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>没有会话</Text>
          <Text style={styles.emptyText}>等待注册表 / 投影帧推送（可先连接 mock-harness）</Text>
        </View>
      }
      renderItem={({ item: s }) => (
        <Pressable
          style={styles.row}
          onPress={() => router.push(`/chat/${encodeURIComponent(s.id)}`)}
        >
          <View style={styles.rowHeader}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {s.title ?? s.id}
            </Text>
            {s.goalStatus && (
              <Text style={[styles.goal, s.goalStatus === "complete" && styles.goalDone]}>
                {s.goalStatus}
              </Text>
            )}
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
            <GoalBar percent={s.contextPercent} />
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  empty: { alignItems: "center", paddingTop: space.x6 * 2, gap: space.x2 },
  emptyTitle: { color: colors.text, fontSize: font.section, fontWeight: "600" },
  emptyText: { color: colors.textMuted, fontSize: font.body - 3, textAlign: "center" },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    padding: space.x4,
    gap: space.x2,
  },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.x2 },
  rowTitle: { color: colors.text, fontSize: font.body, fontWeight: "600", flex: 1 },
  goal: {
    color: colors.warn,
    fontSize: font.body - 3,
    fontFamily: font.mono,
    backgroundColor: colors.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: space.x2,
    paddingVertical: 2,
    overflow: "hidden",
  },
  goalDone: { color: colors.success },
  rowPreview: { color: colors.textMuted, fontSize: font.body - 3 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: space.x3 },
  metaText: { color: colors.textMuted, fontSize: font.body - 4, fontFamily: font.mono },
  miniBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.surface2,
    overflow: "hidden",
  },
  miniBarFill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
});
