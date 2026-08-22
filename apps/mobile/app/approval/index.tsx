import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useConnection } from "../../src/transport/ConnectionProvider";
import { useI18n } from "../../src/i18n";
import { font, radius, space, type ThemeColors } from "../../src/theme";
import { Button } from "../../src/ui/Button";
import { EmptyState } from "../../src/ui/EmptyState";
import { useTheme } from "../../src/theme-context";
import { haptic } from "../../src/ui/haptics";

export default function ApprovalListScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { pending, respond } = useConnection();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const selectedApprovals = pending.filter((p) => selected.has(p.rpcId) && p.kind === "approval");
  const selectedQuestions = pending.filter((p) => selected.has(p.rpcId) && p.kind === "question");

  const toggle = (rpcId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rpcId)) next.delete(rpcId);
      else next.add(rpcId);
      return next;
    });
  };

  const runBatch = async (items: typeof pending, result: unknown) => {
    if (busy || items.length === 0) return;
    setBusy(true);
    setError("");
    setDone("");
    try {
      for (const p of items) {
        await respond(p.rpcId, result);
      }
      const approved = (result as { approved?: boolean })?.approved === true;
      const skipped = (result as { skipped?: boolean })?.skipped === true;
      setDone(skipped ? `${t.approval.batchSkipped} ${items.length} ${t.approval.items}` : approved ? `${t.approval.batchApproved} ${items.length} ${t.approval.items}` : `${t.approval.batchRejected} ${items.length} ${t.approval.items}`);
      void haptic("success");
      setSelected(new Set());
    } catch (err) {
      console.warn("[approval] batch failed", err);
      setError(t.approval.batchFailed);
      void haptic("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{t.approval.pendingTitle}</Text>
          <Text style={styles.subtitle}>{pending.length} {t.approval.items}</Text>
        </View>

        {pending.length === 0 ? (
          <EmptyState eyebrow={t.approval.allClearTitle} text={t.approval.noPending} />
        ) : (
          <View style={styles.list}>
            {pending.map((p) => {
              const payload = (p.payload ?? {}) as Record<string, unknown>;
              const isApproval = p.kind === "approval";
              const checked = selected.has(p.rpcId);
              const prompt = String(payload.prompt ?? payload.question ?? payload.command ?? (isApproval ? t.approval.allowExec : t.approval.pleaseAnswer));
              return (
                <Pressable
                  key={p.rpcId}
                  style={({ pressed }) => [
                    styles.row,
                    checked && styles.rowChecked,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => toggle(p.rpcId)}
                  onLongPress={() => router.push(`/approval/${encodeURIComponent(p.rpcId)}`)}
                  delayLongPress={350}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={`${isApproval ? t.approval.approvalKind : t.approval.questionKind} ${prompt}`}
                >
                  <View style={styles.check}>{checked && <Text style={styles.checkMark}>✓</Text>}</View>
                  <View style={styles.rowBody}>
                    <View style={styles.rowTop}>
                      <View style={styles.kindWrap}>
                        <View style={[styles.kindDot, { backgroundColor: isApproval ? colors.warn : colors.accent }]} />
                        <Text style={[styles.kindTag, { color: isApproval ? colors.warn : colors.accent }]}>
                          {isApproval ? t.approval.approvalKind : t.approval.questionKind}
                        </Text>
                      </View>
                      <Text style={styles.rpcId}>{p.rpcId}</Text>
                    </View>
                    <Text style={styles.prompt} numberOfLines={2}>{prompt}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        {error.length > 0 && <Text style={styles.error}>{error}</Text>}
        {done.length > 0 && <Text style={styles.done}>{done}</Text>}
      </ScrollView>

      {pending.length > 0 && (
        <View style={styles.actionBar}>
          <Pressable
            onPress={() => void runBatch(selectedQuestions, { skipped: true })}
            disabled={busy || selectedQuestions.length === 0}
            hitSlop={6}
            style={({ pressed }) => [
              styles.skipLink,
              (busy || selectedQuestions.length === 0) && styles.disabled,
              pressed && styles.pressedText,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${t.approval.skipSelected} ${selectedQuestions.length}`}
          >
            <Text style={styles.skipText}>{t.approval.skipSelected} ({selectedQuestions.length})</Text>
          </Pressable>
          <View style={styles.buttonRow}>
            <Button
              label={`${t.approval.approveSelected} (${selectedApprovals.length})`}
              loading={busy}
              onPress={() => void runBatch(selectedApprovals, { approved: true })}
              disabled={busy || selectedApprovals.length === 0}
              style={styles.flex}
            />
            <Button
              tone="danger"
              label={`${t.approval.rejectSelected} (${selectedApprovals.length})`}
              loading={busy}
              onPress={() => void runBatch(selectedApprovals, { approved: false })}
              disabled={busy || selectedApprovals.length === 0}
              style={styles.flex}
            />
          </View>
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space.x5, gap: space.x3, paddingBottom: space.x6 },
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
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.x3,
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.separator,
      padding: space.x4,
    },
    rowChecked: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    rowPressed: { opacity: 0.85 },
    check: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor: colors.textDim,
      alignItems: "center",
      justifyContent: "center",
    },
    checkMark: { color: colors.accent, fontSize: 13, fontWeight: "700" },
    rowBody: { flex: 1, gap: 6 },
    rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.x3 },
    kindWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
    kindDot: { width: 4, height: 4, borderRadius: 2 },
    kindTag: { fontSize: font.caption, fontWeight: "600" },
    prompt: { color: colors.text, fontSize: font.body, lineHeight: 20 },
    rpcId: { color: colors.textDim, fontSize: font.eyebrow, fontFamily: font.mono },
    empty: { alignItems: "center", paddingTop: space.x7 * 2 },
    emptyText: { color: colors.textMuted, fontSize: font.caption, textAlign: "center" },
    actionBar: {
      padding: space.x4,
      gap: space.x3,
      borderTopWidth: 1,
      borderTopColor: colors.separator,
      backgroundColor: colors.surface,
    },
    skipLink: { alignSelf: "center", paddingVertical: 2 },
    skipText: { color: colors.accent, fontSize: font.caption, fontWeight: "500" },
    disabled: { opacity: 0.4 },
    pressedText: { opacity: 0.6 },
    buttonRow: { flexDirection: "row", gap: space.x3 },
    flex: { flex: 1 },
    error: { color: colors.danger, fontSize: font.caption, fontFamily: font.mono },
    done: { color: colors.success, fontSize: font.caption, textAlign: "center", fontFamily: font.mono },
  });
}
