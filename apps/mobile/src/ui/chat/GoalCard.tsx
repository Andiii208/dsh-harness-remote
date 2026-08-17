/**
 * GoalCard — 会话页 goal 摘要卡（UI-SYSTEM v7：极简表面色卡 + 进度条 + 暂停/恢复）。
 */

import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useConnection } from "../../transport/ConnectionProvider";
import type { SessionSummary } from "../../data/SessionStore";
import { font, radius, space } from "../../theme";
import { useTheme } from "../../theme-context";
import { SectionLabel } from "../SectionLabel";
import { Button } from "../Button";
import { useEntering } from "../anim";

export function GoalCard({ summary }: { summary: SessionSummary | undefined }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { goals, sessions, setGoalStatus } = useConnection();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const entering = useEntering(8, 220);
  const current = sessions.find((s) => s.id === summary?.id) ?? summary;
  if (!current || (current.goalStatus === undefined && !current.todos && current.plan === undefined)) {
    return null;
  }
  const doneCount = current.todos?.filter((t) => t.status === "completed").length ?? 0;
  const status = current.goalStatus ?? "—";

  const toggle = async (next: "paused" | "active") => {
    if (!summary || busy) return;
    setBusy(true);
    setError("");
    try {
      const ok = next === "paused" ? await goals.pause(summary.id) : await goals.resume(summary.id);
      if (ok) {
        setGoalStatus(summary.id, next);
        setOpen(true);
      } else {
        setError("操作未被主机确认——请检查连接后重试");
      }
    } catch (err) {
      console.warn("[goal] toggle failed", err);
      setError("操作失败：连接异常");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Animated.View entering={entering} style={styles.card}>
      <Pressable
        style={styles.header}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? "收起 goal 详情" : "展开 goal 详情"}
      >
        <SectionLabel tone={status === "paused" ? "muted" : "accent"}>
          {`Goal · ${status}`}
        </SectionLabel>
        {current.todos && current.todos.length > 0 && (
          <Text style={styles.meta}>
            {doneCount}/{current.todos.length} done
          </Text>
        )}
      </Pressable>
      {error.length > 0 && !open && <Text style={styles.errorHeader}>{error}</Text>}
      {open && (
        <View style={styles.body}>
          {error.length > 0 && <Text style={styles.error}>{error}</Text>}
          {current.goalObjective !== undefined && (
            <Text style={styles.objective}>{current.goalObjective}</Text>
          )}
          {current.todos?.map((t, i) => (
            <View key={i} style={styles.todoRow}>
              <Text style={[styles.todoMark, t.status === "completed" && styles.todoDone]}>
                {t.status === "completed" ? "✓" : t.status === "in_progress" ? "●" : "○"}
              </Text>
              <Text style={[styles.todoText, t.status === "completed" && styles.todoTextDone]}>
                {t.content}
              </Text>
            </View>
          ))}
          {current.contextPercent !== undefined && (
            <View style={styles.bar}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.min(100, current.contextPercent)}%` },
                  current.contextPercent >= 80 && { backgroundColor: colors.warn },
                ]}
              />
            </View>
          )}
          <View style={styles.actions}>
            {status === "active" && (
              <Button tone="danger" label="暂停" onPress={() => toggle("paused")} disabled={busy} />
            )}
            {status === "paused" && (
              <Button label="恢复" onPress={() => toggle("active")} disabled={busy} />
            )}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      overflow: "hidden",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: space.x4,
    },
    meta: { color: colors.textMuted, fontSize: font.eyebrow, fontFamily: font.mono },
    body: { paddingHorizontal: space.x4, paddingBottom: space.x4, gap: space.x2 },
    objective: { color: colors.textMuted, fontSize: font.caption, lineHeight: 18 },
    todoRow: { flexDirection: "row", alignItems: "center", gap: space.x2 },
    todoMark: { color: colors.textMuted, fontSize: font.body - 2, width: 14 },
    todoDone: { color: colors.success },
    todoText: { color: colors.text, fontSize: font.caption, flex: 1, lineHeight: 18 },
    todoTextDone: { color: colors.textMuted, textDecorationLine: "line-through" },
    bar: { height: 3, borderRadius: 2, backgroundColor: colors.surface2, overflow: "hidden" },
    barFill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.x2, marginTop: space.x2 },
    error: { color: colors.danger, fontSize: font.caption, fontFamily: font.mono },
    errorHeader: { color: colors.danger, fontSize: font.caption, fontFamily: font.mono, paddingHorizontal: space.x4, paddingBottom: space.x2 },
  });
}
