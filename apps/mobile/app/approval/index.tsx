import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useConnection } from "../../src/transport/ConnectionProvider";
import { font, radius, space, type ThemeColors } from "../../src/theme";
import { SectionLabel } from "../../src/ui/SectionLabel";
import { Button } from "../../src/ui/Button";
import { EmptyState } from "../../src/ui/EmptyState";
import { useTheme } from "../../src/theme-context";
import { haptic } from "../../src/ui/haptics";

export default function ApprovalListScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { pending, respond } = useConnection();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    try {
      for (const p of items) {
        await respond(p.rpcId, result);
      }
      void haptic("success");
      setSelected(new Set());
    } catch (err) {
      console.warn("[approval] batch failed", err);
      setError("批量处理失败：连接异常");
      void haptic("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Approvals</Text>
          <SectionLabel>{`Pending ${pending.length}`}</SectionLabel>
        </View>

        {pending.length === 0 ? (
          <EmptyState eyebrow="ALL CLEAR" text="没有待处理的审批或提问" />
        ) : (
          <View style={styles.list}>
            {pending.map((p) => {
              const payload = (p.payload ?? {}) as Record<string, unknown>;
              const isApproval = p.kind === "approval";
              const checked = selected.has(p.rpcId);
              const prompt = String(payload.prompt ?? payload.question ?? payload.command ?? (isApproval ? "允许执行？" : "请回答"));
              return (
                <Pressable
                  key={p.rpcId}
                  style={({ pressed }) => [
                    styles.row,
                    { borderLeftColor: isApproval ? colors.warn : colors.accent },
                    checked && styles.rowChecked,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => toggle(p.rpcId)}
                  onLongPress={() => router.push(`/approval/${encodeURIComponent(p.rpcId)}`)}
                  delayLongPress={350}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={`${isApproval ? "审批" : "提问"} ${prompt}`}
                >
                  <View style={styles.check}>{checked && <Text style={styles.checkMark}>✓</Text>}</View>
                  <View style={styles.rowBody}>
                    <View style={styles.rowTop}>
                      <SectionLabel tone={isApproval ? "muted" : "accent"}>
                        {isApproval ? "Permission" : "Question"}
                      </SectionLabel>
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
      </ScrollView>

      {pending.length > 0 && (
        <View style={styles.actionBar}>
          <Button
            tone="danger"
            label={`拒绝所选 (${selectedApprovals.length})`}
            onPress={() => void runBatch(selectedApprovals, { approved: false })}
            disabled={busy || selectedApprovals.length === 0}
            full
          />
          <Button
            label={`批准所选 (${selectedApprovals.length})`}
            onPress={() => void runBatch(selectedApprovals, { approved: true })}
            disabled={busy || selectedApprovals.length === 0}
            full
          />
          <Button
            tone="ghost"
            label={`跳过所选提问 (${selectedQuestions.length})`}
            onPress={() => void runBatch(selectedQuestions, { skipped: true })}
            disabled={busy || selectedQuestions.length === 0}
            full
          />
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
      fontSize: 34,
      fontWeight: "600",
      letterSpacing: -1,
    },
    list: { gap: space.x3 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.x3,
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderLeftWidth: 3,
      padding: space.x4,
    },
    rowChecked: { backgroundColor: colors.accentSoft },
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
    prompt: { color: colors.text, fontSize: font.body, lineHeight: 20 },
    rpcId: { color: colors.textDim, fontSize: font.eyebrow, fontFamily: font.mono },
    actionBar: {
      padding: space.x4,
      gap: space.x2,
      borderTopWidth: 1,
      borderTopColor: colors.separator,
      backgroundColor: colors.bg,
    },
    error: { color: colors.danger, fontSize: font.caption, fontFamily: font.mono },
  });
}
