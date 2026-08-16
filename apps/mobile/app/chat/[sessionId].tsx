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
  const [open, setOpen] = useState(false);
  if (!summary || (summary.goalStatus === undefined && !summary.todos && summary.plan === undefined)) {
    return null;
  }
  const doneCount = summary.todos?.filter((t) => t.status === "completed").length ?? 0;
  return (
    <View style={styles.goalCard}>
      <Pressable style={styles.goalHeader} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.goalTitle}>goal · {summary.goalStatus ?? "—"}</Text>
        {summary.todos && summary.todos.length > 0 && (
          <Text style={styles.goalMeta}>
            {doneCount}/{summary.todos.length} ✓
          </Text>
        )}
      </Pressable>
      {open && (
        <View style={styles.goalBody}>
          {summary.goalObjective !== undefined && (
            <Text style={styles.goalObjective}>{summary.goalObjective}</Text>
          )}
          {summary.todos?.map((t, i) => (
            <View key={i} style={styles.todoRow}>
              <Text style={[styles.todoMark, t.status === "completed" && styles.todoDone]}>
                {t.status === "completed" ? "✓" : t.status === "in_progress" ? "●" : "○"}
              </Text>
              <Text style={[styles.todoText, t.status === "completed" && styles.todoTextDone]}>
                {t.content}
              </Text>
            </View>
          ))}
          {summary.contextPercent !== undefined && (
            <View style={styles.miniBar}>
              <View style={[styles.miniBarFill, { width: `${Math.min(100, summary.contextPercent)}%` }]} />
            </View>
          )}
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
