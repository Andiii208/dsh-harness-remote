/**
 * MessageBubble — 转录消息（UI-SYSTEM v2：3px 角色边条 + mono 内容 + 流式光标）。
 * 支持 ``` 围栏代码块渲染（surface3 + mono）；长按复制（clipboard + haptic）。
 */

import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { TranscriptMessage } from "../../data/SessionStore";
import { colors, font, radius, space, stroke } from "../../theme";
import { SectionLabel } from "../SectionLabel";
import { StreamingCursor } from "../StreamingCursor";
import { haptic } from "../haptics";
import { splitCode } from "./splitCode";

export function MessageBubble({ m, live }: { m: TranscriptMessage; live?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  if (m.gap) {
    return (
      <View style={styles.gapRow}>
        <Text style={styles.gapText}>{m.content}</Text>
      </View>
    );
  }
  const isUser = m.role === "user";
  const isTool = m.role === "tool";
  const segments = splitCode(m.content);

  const onLongPress = async () => {
    if (m.content.length === 0) return;
    try {
      await Clipboard.setStringAsync(m.content);
    } catch (err) {
      console.warn("[copy] failed", err);
      void haptic("error");
      return;
    }
    void haptic("light");
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot, pressed && styles.bubblePressed]}
      onLongPress={() => void onLongPress()}
      delayLongPress={350}
      accessibilityRole="text"
      accessibilityHint="长按复制消息内容"
    >
      <View style={[styles.edge, isUser ? styles.edgeUser : isTool ? styles.edgeTool : styles.edgeBot]} />
      <View style={styles.body}>
        {m.role && m.role !== "user" && (
          <SectionLabel tone={isTool ? "muted" : "accent"} style={styles.roleTag}>
            {isTool ? "tool" : (m.role ?? "assistant")}
          </SectionLabel>
        )}
        {segments.map((seg, i) =>
          seg.code ? (
            <View key={i} style={styles.codeBlock}>
              <Text style={styles.codeText} selectable>
                {seg.text}
              </Text>
            </View>
          ) : (
            <Text key={i} style={[styles.text, isTool && styles.toolText]} selectable>
              {seg.text}
            </Text>
          ),
        )}
        {m.interrupted && <Text style={styles.tail}>⏹ 中断</Text>}
        {live && <StreamingCursor />}
        {copied && <Text style={styles.copied}>已复制</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gapRow: { alignItems: "center", paddingVertical: space.x2 },
  gapText: { color: colors.textDim, fontSize: font.caption, fontStyle: "italic" },
  bubble: {
    flexDirection: "row",
    borderRadius: radius.card,
    maxWidth: "94%",
    overflow: "hidden",
  },
  bubbleUser: { alignSelf: "flex-end", backgroundColor: colors.surface },
  bubbleBot: { alignSelf: "flex-start", backgroundColor: colors.surface },
  bubblePressed: { opacity: 0.85 },
  edge: { width: 3, borderRadius: 2 },
  edgeUser: { backgroundColor: colors.accent },
  edgeBot: { backgroundColor: colors.surface2 },
  edgeTool: { backgroundColor: colors.textDim },
  body: { padding: space.x3, gap: space.x1, flexShrink: 1 },
  roleTag: { fontSize: font.eyebrow - 1, letterSpacing: 1 },
  text: { color: colors.text, fontSize: font.transcript, lineHeight: 21, fontFamily: font.mono },
  toolText: { color: colors.textMuted },
  codeBlock: {
    backgroundColor: colors.surface3,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    borderRadius: radius.control,
    padding: space.x3,
    marginVertical: space.x1,
  },
  codeText: { color: "#D7E3FF", fontSize: font.transcript, lineHeight: 20, fontFamily: font.mono },
  copied: { color: colors.accent, fontSize: font.eyebrow, fontFamily: font.mono, alignSelf: "flex-end" },
  tail: { color: colors.warn, fontSize: font.caption, fontFamily: font.mono },
});
