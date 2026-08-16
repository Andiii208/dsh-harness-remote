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
import type { TranscriptMessage } from "../../src/data/SessionStore";
import { colors, font, radius, space, stroke } from "../../src/theme";

function Bubble({ m }: { m: TranscriptMessage }) {
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

export default function ChatScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const id = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  const { transcript, sendMessage, state } = useConnection();
  const [draft, setDraft] = useState("");
  const messages = id ? transcript(id) : [];
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
