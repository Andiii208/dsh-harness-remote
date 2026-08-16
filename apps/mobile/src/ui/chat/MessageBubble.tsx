/**
 * MessageBubble — 转录消息（UI-SYSTEM v2：3px 角色边条 + mono 内容 + 流式光标）。
 */

import { StyleSheet, Text, View } from "react-native";
import type { TranscriptMessage } from "../../data/SessionStore";
import { colors, font, radius, space } from "../../theme";
import { SectionLabel } from "../SectionLabel";
import { StreamingCursor } from "../StreamingCursor";

export function MessageBubble({ m, live }: { m: TranscriptMessage; live?: boolean }) {
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
      <View style={styles.body}>
        {m.role && m.role !== "user" && (
          <SectionLabel tone={isTool ? "muted" : "accent"} style={styles.roleTag}>
            {isTool ? "tool" : (m.role ?? "assistant")}
          </SectionLabel>
        )}
        <Text style={[styles.text, isTool && styles.toolText]}>
          {m.content}
          {m.interrupted ? " ⏹" : ""}
          {live && <StreamingCursor />}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  body: { padding: space.x3, gap: space.x1, flexShrink: 1 },
  roleTag: { fontSize: font.eyebrow - 1, letterSpacing: 1 },
  text: { color: colors.text, fontSize: font.transcript, lineHeight: 21, fontFamily: font.mono },
  toolText: { color: colors.textMuted },
});
