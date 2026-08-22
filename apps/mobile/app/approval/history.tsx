import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { approvalHistoryStore } from "../../src/data/approvalHistoryStoreAdapter";
import type { ApprovalHistoryEntry } from "../../src/data/approvalHistoryStore";
import { useI18n } from "../../src/i18n";
import { font, radius, space, type ThemeColors } from "../../src/theme";
import { useTheme } from "../../src/theme-context";

function resultLabel(result: unknown, t: { approved: string; rejected: string; skipped: string; answered: string }): string {
  if (!result || typeof result !== "object") return String(result ?? "");
  const r = result as Record<string, unknown>;
  if (r.approved === true) return t.approved;
  if (r.approved === false) return t.rejected;
  if (r.skipped === true) return t.skipped;
  if (typeof r.answer === "string") return `${t.answered}：${r.answer}`;
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

function HistoryRow({ entry, colors, t }: { entry: ApprovalHistoryEntry; colors: ThemeColors; t: { approvalKind: string; questionKind: string; noDescription: string; approved: string; rejected: string; skipped: string; answered: string } }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isApproval = entry.kind === "approval";
  return (
    <View style={styles.card}>
      <View style={styles.rowTop}>
        <View style={styles.kindWrap}>
          <View style={[styles.kindDot, { backgroundColor: isApproval ? colors.warn : colors.accent }]} />
          <Text style={[styles.kindTag, { color: isApproval ? colors.warn : colors.accent }]}>
            {isApproval ? t.approvalKind : t.questionKind}
          </Text>
        </View>
        <Text style={styles.time}>{formatTime(entry.respondedAt)}</Text>
      </View>
      <Text style={styles.prompt} numberOfLines={2}>{entry.prompt || t.noDescription}</Text>
      <View style={styles.rowBottom}>
        <Text style={styles.result}>{resultLabel(entry.result, t)}</Text>
        <Text style={styles.rpcId}>{entry.rpcId}</Text>
      </View>
    </View>
  );
}

export default function ApprovalHistoryScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [entries, setEntries] = useState<ApprovalHistoryEntry[]>([]);

  useEffect(() => {
    void approvalHistoryStore.list().then(setEntries);
  }, []);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{t.approval.historyTitle}</Text>
        <Text style={styles.subtitle}>{entries.length} {t.approval.entries}</Text>
      </View>
      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t.approval.noHistory}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {entries.map((e) => (
            <HistoryRow key={`${e.rpcId}-${e.respondedAt}`} entry={e} colors={colors} t={t.approval} />
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
      fontSize: 28,
      fontWeight: "600",
      letterSpacing: -0.5,
    },
    subtitle: { color: colors.textMuted, fontSize: font.caption },
    list: { gap: space.x3 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.separator,
      padding: space.x4,
      gap: space.x2,
    },
    rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.x3 },
    kindWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
    kindDot: { width: 4, height: 4, borderRadius: 2 },
    kindTag: { fontSize: font.caption, fontWeight: "600" },
    time: { color: colors.textDim, fontSize: font.eyebrow, fontFamily: font.mono },
    prompt: { color: colors.text, fontSize: font.body, lineHeight: 20 },
    rowBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.x3 },
    result: { color: colors.textMuted, fontSize: font.caption },
    rpcId: { color: colors.textDim, fontSize: font.eyebrow, fontFamily: font.mono, flexShrink: 1 },
    empty: { alignItems: "center", paddingTop: space.x7 * 2 },
    emptyText: { color: colors.textMuted, fontSize: font.caption, textAlign: "center" },
  });
}
