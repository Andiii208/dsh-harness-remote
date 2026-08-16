import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated from "react-native-reanimated";
import { FlashList } from "@shopify/flash-list";
import { useConnection, STATE_LABEL } from "../../src/transport/ConnectionProvider";
import type { SessionSummary, TranscriptMessage } from "../../src/data/SessionStore";
import { colors, font, radius, space, stroke } from "../../src/theme";
import { SectionLabel } from "../../src/ui/SectionLabel";
import { StatusChip } from "../../src/ui/StatusChip";
import { Button } from "../../src/ui/Button";
import { useEntering } from "../../src/ui/anim";

function Bubble({ m }: { m: TranscriptMessage }) {
  if (m.gap) {
    return (
      <View style={styles.gapRow}>
        <Text style={styles.gapText}>{m.content}</Text>
      </View>
    );
  }
  const isUser = m.role === "user";
  const isTool = m.role === "tool";
  return (
    <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
      <View style={[styles.edge, isUser ? styles.edgeUser : isTool ? styles.edgeTool : styles.edgeBot]} />
      <View style={styles.bubbleBody}>
        {m.role && m.role !== "user" && (
          <SectionLabel tone={isTool ? "muted" : "accent"} style={styles.roleTag}>
            {isTool ? "tool" : (m.role ?? "assistant")}
          </SectionLabel>
        )}
        <Text style={[styles.bubbleText, isTool && styles.toolText]}>
          {m.content}
          {m.interrupted ? " ⏹" : ""}
        </Text>
      </View>
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

  const entering = useEntering(8, 220);

  const toggle = async (next: "paused" | "active") => {
    if (!summary || busy) return;
    setBusy(true);
    try {
      const ok = next === "paused" ? await goals.pause(summary.id) : await goals.resume(summary.id);
      if (ok) {
        setGoalStatus(summary.id, next);
        setOpen(true);
      }
    } catch (err) {
      console.warn("[goal] toggle failed", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Animated.View entering={entering} style={styles.goalCard}>
      <Pressable style={styles.goalHeader} onPress={() => setOpen((v) => !v)}>
        <SectionLabel tone={status === "paused" ? "muted" : "accent"}>
          {`Goal · ${status}`}
        </SectionLabel>
        {current.todos && current.todos.length > 0 && (
          <Text style={styles.goalMeta}>
            {doneCount}/{current.todos.length} done
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
              <View
                style={[
                  styles.miniBarFill,
                  { width: `${Math.min(100, current.contextPercent)}%` },
                  current.contextPercent >= 80 && { backgroundColor: colors.warn },
                ]}
              />
            </View>
          )}
          <View style={styles.goalActions}>
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

export default function ChatScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const id = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  const { sessions, transcript, sendMessage, state } = useConnection();
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const messages = id ? transcript(id) : [];
  const summary = id ? sessions.find((s) => s.id === id) : undefined;
  const online = state === "online";
  const entering = useEntering(6, 200);

  const send = async () => {
    const text = draft.trim();
    if (!text || !id || !online) return;
    setDraft("");
    setSendError("");
    try {
      await sendMessage(id, text);
    } catch (err) {
      setDraft(text);
      setSendError(err instanceof Error ? err.message : "发送失败");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlashList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={messages}
        keyExtractor={(m, i) => `${m.id ?? "m"}-${i}`}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.sessionHeader}>
              <Text style={styles.sessionTitle} numberOfLines={1}>
                {summary?.title ?? id}
              </Text>
              <StatusChip
                tone={online ? "success" : state === "offline" ? "danger" : "warn"}
                label={STATE_LABEL[state] ?? state}
              />
            </View>
            <GoalCard summary={summary} />
          </View>
        }
        renderItem={({ item }) => (
          <Animated.View entering={entering}>
            <Bubble m={item} />
          </Animated.View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <SectionLabel>{online ? "WAITING FOR STREAM" : "OFFLINE"}</SectionLabel>
            <Text style={styles.emptyText}>
              {online ? "等待消息流…" : "离线——先回到连接页建立连接"}
            </Text>
          </View>
        }
      />
      <View style={styles.inputBar}>
        {!online && <SectionLabel tone="danger">Offline</SectionLabel>}
        {sendError.length > 0 && <Text style={styles.sendError}>{sendError}</Text>}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={online ? "输入消息…" : "离线"}
            placeholderTextColor={colors.textDim}
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  listContent: { padding: space.x5, gap: space.x2, paddingBottom: space.x6 },
  listHeader: { gap: space.x3, marginBottom: space.x2 },
  sessionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.x3,
  },
  sessionTitle: { color: colors.text, fontSize: font.title, fontWeight: "600", flex: 1, letterSpacing: -0.2 },
  emptyWrap: { alignItems: "center", paddingTop: space.x7 * 2, gap: space.x2 },
  emptyText: { color: colors.textMuted, fontSize: font.caption },
  gapRow: { alignItems: "center", paddingVertical: space.x2 },
  gapText: { color: colors.textDim, fontSize: font.caption, fontStyle: "italic" },
  bubble: {
    flexDirection: "row",
    borderRadius: radius.card,
    maxWidth: "92%",
    overflow: "hidden",
  },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: colors.surface },
  bubbleBot: { alignSelf: "flex-start", backgroundColor: colors.surface },
  edge: { width: 3, borderRadius: 2 },
  edgeUser: { backgroundColor: colors.accent },
  edgeBot: { backgroundColor: colors.surface2 },
  edgeTool: { backgroundColor: colors.textDim },
  bubbleBody: { padding: space.x3, gap: space.x1, flexShrink: 1 },
  roleTag: { fontSize: font.eyebrow - 1, letterSpacing: 1 },
  bubbleText: { color: colors.text, fontSize: font.transcript, lineHeight: 21, fontFamily: font.mono },
  toolText: { color: colors.textMuted },
  goalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    overflow: "hidden",
  },
  goalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: space.x4,
  },
  goalMeta: { color: colors.textMuted, fontSize: font.eyebrow, fontFamily: font.mono },
  goalBody: { paddingHorizontal: space.x4, paddingBottom: space.x4, gap: space.x2 },
  goalObjective: { color: colors.textMuted, fontSize: font.caption, lineHeight: 18 },
  todoRow: { flexDirection: "row", alignItems: "center", gap: space.x2 },
  todoMark: { color: colors.textMuted, fontSize: font.body - 2, width: 14 },
  todoDone: { color: colors.success },
  todoText: { color: colors.text, fontSize: font.caption, flex: 1, lineHeight: 18 },
  todoTextDone: { color: colors.textMuted, textDecorationLine: "line-through" },
  miniBar: { height: 3, borderRadius: 2, backgroundColor: colors.surface2, overflow: "hidden" },
  miniBarFill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
  goalActions: { flexDirection: "row", justifyContent: "flex-end", gap: space.x2, marginTop: space.x2 },
  inputBar: {
    gap: space.x2,
    padding: space.x3,
    borderTopWidth: stroke.hairline,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: space.x2 },
  input: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.control,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    color: colors.text,
    paddingHorizontal: (space.x3 + 2),
    paddingVertical: 10,
    fontSize: font.body,
    maxHeight: 120,
  },
  send: {
    backgroundColor: colors.accent,
    borderRadius: radius.control,
    paddingHorizontal: space.x5,
    paddingVertical: (space.x3 + 2),
  },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: "#FFFFFF", fontSize: font.body, fontWeight: "600" },
  sendError: { color: colors.danger, fontSize: font.caption, fontFamily: font.mono },
});
