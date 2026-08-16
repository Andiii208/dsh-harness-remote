import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useConnection, STATE_LABEL } from "../../src/transport/ConnectionProvider";
import type { TranscriptMessage } from "../../src/data/SessionStore";
import { colors, font, radius, space, stroke } from "../../src/theme";
import { SectionLabel } from "../../src/ui/SectionLabel";
import { StatusChip } from "../../src/ui/StatusChip";
import { useEntering } from "../../src/ui/anim";
import { GoalCard } from "../../src/ui/chat/GoalCard";
import { MessageBubble } from "../../src/ui/chat/MessageBubble";
import { SkeletonRow } from "../../src/ui/SkeletonRow";
import { haptic } from "../../src/ui/haptics";

export default function ChatScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const id = Array.isArray(sessionId) ? sessionId[0] : sessionId;
  const { sessions, transcript, liveMessage, sendMessage, state } = useConnection();
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const [showJump, setShowJump] = useState(false);
  const listRef = useRef<FlashListRef<TranscriptMessage> | null>(null);
  const messages = id ? transcript(id) : [];
  const live = id ? liveMessage(id) : undefined;
  const data = live ? [...messages, live] : messages;
  const summary = id ? sessions.find((s) => s.id === id) : undefined;
  const online = state === "online";
  const entering = useEntering(6, 200);

  // 新消息到达时滚到底部（终端流式习惯）。
  useEffect(() => {
    if (data.length > 0) {
      listRef.current?.scrollToEnd({ animated: data.length <= 4 });
    }
  }, [data.length]);

  const jumpToBottom = () => {
    listRef.current?.scrollToEnd({ animated: true });
    void haptic("light");
  };

  const onScroll = (e: { nativeEvent: { contentOffset: { y: number }; layoutMeasurement: { height: number }; contentSize: { height: number } } }) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    const distance = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    setShowJump(distance > 320);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || !id || !online) return;
    setDraft("");
    setSendError("");
    void haptic("light");
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
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        data={data}
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
        renderItem={({ item, index }) => (
          <Animated.View entering={entering}>
            <MessageBubble m={item} live={index === messages.length && item.id === live?.id} />
          </Animated.View>
        )}
        onScroll={onScroll}
        scrollEventThrottle={64}
        ListEmptyComponent={
          state === "connecting" || state === "backoff" ? (
            <View style={styles.skeletonStack}>
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <SectionLabel>{online ? "WAITING FOR STREAM" : "OFFLINE"}</SectionLabel>
              <Text style={styles.emptyText}>
                {online ? "等待消息流…" : "离线——先回到连接页建立连接"}
              </Text>
            </View>
          )
        }
      />
      {showJump && (
        <Pressable style={styles.jumpFab} onPress={jumpToBottom} accessibilityRole="button" accessibilityLabel="回到底部">
          <Text style={styles.jumpFabText}>↓</Text>
        </Pressable>
      )}
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
  skeletonStack: { gap: space.x3, paddingTop: space.x3 },
  emptyText: { color: colors.textMuted, fontSize: font.caption },
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
  jumpFab: {
    position: "absolute",
    right: space.x5,
    bottom: 96,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 5 },
    }),
  },
  jumpFabText: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
});
