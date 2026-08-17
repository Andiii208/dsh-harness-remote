import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { approvalHistoryStore } from "../../src/data/approvalHistoryStoreAdapter";
import type { ApprovalHistoryEntry } from "../../src/data/approvalHistoryStore";
import { font, radius, space, type ThemeColors } from "../../src/theme";
import { SectionLabel } from "../../src/ui/SectionLabel";
import { EmptyState } from "../../src/ui/EmptyState";
import { useTheme } from "../../src/theme-context";

function resultLabel(result: unknown): string {
  if (!result || typeof result !== "object") return String(result ?? "");
  const r = result as Record<string, unknown>;
  if (r.approved === true) return "已批准";
  if (r.approved === false) return "已拒绝";
  if (r.skipped === true) return "已跳过";
  if (typeof r.answer === "string") return `已回答：${r.answer}`;
  return JSON.stringify(result);
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HistoryRow({ entry, colors }: { entry: ApprovalHistoryEntry; colors: ThemeColors }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isApproval = entry.kind === "approval";
  return (
    <View style={[styles.card, { borderLeftColor: isApproval ? colors.warn : colors.accent }]}>
      <View style={styles.rowTop}>
        <SectionLabel tone={isApproval ? "muted" : "accent"}>
          {isApproval ? "Permission" : "Question"}
        </SectionLabel>
        <Text style={styles.time}>{formatTime(entry.respondedAt)}</Text>
      </View>
      <Text style={styles.prompt} numberOfLines={2}>{entry.prompt || "（无描述）"}</Text>
      <View style={styles.rowBottom}>
        <Text style={styles.result}>{resultLabel(entry.result)}</Text>
        <Text style={styles.rpcId}>{entry.rpcId}</Text>
      </View>
    </View>
  );
}

export default function ApprovalHistoryScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [entries, setEntries] = useState<ApprovalHistoryEntry[]>([]);

  useEffect(() => {
    void approvalHistoryStore.list().then(setEntries);
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        <SectionLabel>{`Approvals ${entries.length}`}</SectionLabel>
      </View>
      {entries.length === 0 ? (
        <EmptyState eyebrow="NO HISTORY" text="处理过的审批 / 提问会按时间倒序出现在这里" />
      ) : (
        <View style={styles.list}>
          {entries.map((e) => (
            <HistoryRow key={`${e.rpcId}-${e.respondedAt}`} entry={e} colors={colors} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.x5, gap: space.x3, paddingBottom: space.x7 },
    header: { gap: space.x1, marginBottom: space.x2 },
    title: {
      color: colors.text,
      fontFamily: font.display,
      fontSize: 34,
      fontWeight: "600",
      letterSpacing: -1,
    },
    list: { gap: space.x3 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderLeftWidth: 3,
      padding: space.x4,
      gap: space.x2,
    },
    rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.x3 },
    time: { color: colors.textDim, fontSize: font.eyebrow, fontFamily: font.mono },
    prompt: { color: colors.text, fontSize: font.body, lineHeight: 20 },
    rowBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.x3 },
    result: { color: colors.textMuted, fontSize: font.caption },
    rpcId: { color: colors.textDim, fontSize: font.eyebrow, fontFamily: font.mono, flexShrink: 1 },
  });
}
