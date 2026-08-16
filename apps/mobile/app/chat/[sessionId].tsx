import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useConnection } from "../../src/transport/ConnectionProvider";
import type { SessionSummary, TranscriptMessage } from "../../src/data/SessionStore";
import { colors, font, radius, space, stroke } from "../../src/theme";

function Bubble({ m }: { m: TranscriptMessage }) {
  if (m.gap) {
    return (
      <View style={styles.gapRow}>
        <Text style={styles.gapText}>{m.content}</Text>
      </View>
    );
  }
  const isUser = m.role === "user";
  return (
    <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
      {m.role === "tool" && <Text style={styles.roleTag}>tool</Text>}
      <Text style={[styles.bubbleText, m.role === "tool" && styles.toolText]}>
        {m.content}
        {m.interrupted ? " ⏹" : ""}
      </Text>
    </View>
  );
}

function GoalCard({ summary }: { summary: SessionSummary | undefined }) {
  const { goals, sessions, setGoalStatus } = useConnection();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = sessions.find((s) => s.id === summary?.id) ?? summary;
  if (!current || (current.goalStatus === undefined && !current.todos && current.plan === undefined)) {
    return null;
  }
  const doneCount = current.todos?.filter((t) => t.status === "completed").length ?? 0;
  const status = current.goalStatus ?? "—";

  const toggle = async (next: "paused" | "active") => {
    if (!summary || busy) return;
    setBusy(true);
    try {
      const ok = next === "paused" ? await goals.pause(summary.id) : await goals.resume(summary.id);
      if (ok) {
        setGoalStatus(summary.id, next); // 乐观更新；下一条投影帧为准
        setOpen(true);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.goalCard}>
      <Pressable style={styles.goalHeader} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.goalTitle}>goal · {status}</Text>
        {current.todos && current.todos.length > 0 && (
          <Text style={styles.goalMeta}>
            {doneCount}/{current.todos.length} ✓
          </Text>
        )}
      </Pressable>
      {open && (
        <View style={styles.goalBody}>
          {current.goalObjective !== undefined && (
            <Text style={styles.goalObjective}>{current.goalObjective}</Text>
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
            <View style={styles.miniBar}>
              <View style={[styles.miniBarFill, { width: `${Math.min(100, current.contextPercent)}%` }]} />
            </View>
          )}
          <View style={styles.goalActions}>
            {status === "active" && (
              <Pressable style={styles.goalActionGhost} onPress={() => toggle("paused")} disabled={busy}>
                <Text style={styles.goalActionGhostText}>暂停</Text>
              </Pressable>
            )}
            {status === "paused" && (
              <Pressable style={styles.goalActionPrimary} onPress={() => toggle("active")} disabled={busy}>
                <Text style={styles.goalActionPrimaryText}>恢复</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

export default function ChatScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const id = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  const { sessions, transcript, sendMessage, state } = useConnection();
  const [draft, setDraft] = useState("");
  const messages = id ? transcript(id) : [];
  const summary = id ? sessions.find((s) => s.id === id) : undefined;
  const online = state === "online";

  const send = async () => {
    const text = draft.trim();
    if (!text || !id || !online) return;
    setDraft("");
    try {
      await sendMessage(id, text);
    } catch {
      // 失败留在输入框，便于重试
      setDraft(text);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        style={styles.list}
        contentContainerStyle={{ padding: space.x4, gap: space.x2 }}
        data={messages}
        keyExtractor={(m, i) => `${m.id ?? "m"}-${i}`}
        ListHeaderComponent={<GoalCard summary={summary} />}
        renderItem={({ item }) => <Bubble m={item} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {online ? "等待消息流…" : "离线——先回到连接页建立连接"}
          </Text>
        }
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder={online ? "输入消息…" : "离线"}
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={setDraft}
          editable={online}
          onSubmitEditing={send}
          returnKeyType="send"
          multiline
        />
        <Pressable
          style={[styles.send, (!draft.trim() || !online) && styles.sendDisabled]}
          onPress={send}
          disabled={!draft.trim() || !online}
        >
          <Text style={styles.sendText}>发送</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  empty: { color: colors.textMuted, fontSize: font.body - 3, textAlign: "center", marginTop: space.x6 },
  gapRow: { alignItems: "center", paddingVertical: space.x2 },
  gapText: { color: colors.textMuted, fontSize: font.body - 3, fontStyle: "italic" },
  goalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    marginBottom: space.x2,
    overflow: "hidden",
  },
  goalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: space.x3,
  },
  goalTitle: { color: colors.text, fontSize: font.body - 2, fontWeight: "600", fontFamily: font.mono },
  goalMeta: { color: colors.textMuted, fontSize: font.body - 4, fontFamily: font.mono },
  goalBody: { paddingHorizontal: space.x3, paddingBottom: space.x3, gap: space.x2 },
  goalObjective: { color: colors.textMuted, fontSize: font.body - 3, lineHeight: 18 },
  todoRow: { flexDirection: "row", alignItems: "center", gap: space.x2 },
  todoMark: { color: colors.textMuted, fontSize: font.body - 2, width: 14 },
  todoDone: { color: colors.success },
  todoText: { color: colors.text, fontSize: font.body - 3, flex: 1 },
  todoTextDone: { color: colors.textMuted, textDecorationLine: "line-through" },
  miniBar: { height: 3, borderRadius: 2, backgroundColor: colors.surface2, overflow: "hidden" },
  miniBarFill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
  goalActions: { flexDirection: "row", justifyContent: "flex-end", gap: space.x2, marginTop: space.x2 },
  goalActionGhost: {
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
  },
  goalActionGhostText: { color: colors.danger, fontSize: font.body - 3, fontWeight: "600" },
  goalActionPrimary: {
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2,
  },
  goalActionPrimaryText: { color: "#FFFFFF", fontSize: font.body - 3, fontWeight: "600" },
  bubble: {
    borderRadius: radius.card,
    padding: space.x3,
    maxWidth: "88%",
    borderWidth: stroke.hairline,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  bubbleBot: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  bubbleText: { color: colors.text, fontSize: font.transcript, lineHeight: 21, fontFamily: font.mono },
  toolText: { color: colors.textMuted },
  roleTag: { color: colors.accent, fontSize: font.body - 5, fontFamily: font.mono, marginBottom: 2 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.x2,
    padding: space.x3,
    borderTopWidth: stroke.hairline,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    color: colors.text,
    paddingHorizontal: space.x3,
    paddingVertical: space.x2 + 2,
    fontSize: font.body - 1,
    maxHeight: 120,
  },
  send: {
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: "#FFFFFF", fontSize: font.body - 1, fontWeight: "600" },
});
