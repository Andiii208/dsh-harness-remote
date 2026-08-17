/**
 * MessageBubble — 转录消息（UI-SYSTEM v7：iMessage 式气泡）。
 * user = DeepSeek 蓝气泡白字；assistant = 表面色气泡；tool = 表面色 + 代码块。
 * 支持 ``` 围栏代码块渲染（codeBg + mono）；长按复制（clipboard + haptic）。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { TranscriptMessage } from "../../data/SessionStore";
import { font, radius } from "../../theme";
import { useTheme } from "../../theme-context";
import { StreamingCursor } from "../StreamingCursor";
import { haptic } from "../haptics";
import { splitCode } from "./splitCode";

export function MessageBubble({ m, live }: { m: TranscriptMessage; live?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
      style={({ pressed }) => [
        styles.bubble,
        isUser ? styles.bubbleUser : styles.bubbleBot,
        pressed && styles.bubblePressed,
      ]}
      onLongPress={() => void onLongPress()}
      delayLongPress={350}
      accessibilityRole="text"
      accessibilityHint="长按复制消息内容"
    >
      <View style={styles.body}>
        {m.role && m.role !== "user" && (
          <Text style={[styles.roleTag, isTool && styles.roleTagTool]}>
            {isTool ? "tool · log" : (m.role ?? "assistant")}
          </Text>
        )}
        {segments.map((seg, i) =>
          seg.code ? (
            <View key={i} style={[styles.codeBlock, isTool && styles.codeBlockTool]}>
              <Text style={styles.codeText} selectable>
                {seg.text}
              </Text>
            </View>
          ) : (
            <Text key={i} style={[styles.text, isUser && styles.textUser, isTool && styles.toolText]} selectable>
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

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    gapRow: { alignItems: "center", paddingVertical: 8 },
    gapText: { color: colors.textDim, fontSize: 11, fontStyle: "italic" },
    bubble: {
      maxWidth: "82%",
      borderRadius: 18,
      overflow: "hidden",
    },
    bubbleUser: { alignSelf: "flex-end", backgroundColor: colors.msgSelf, borderBottomRightRadius: 6 },
    bubbleBot: { alignSelf: "flex-start", backgroundColor: colors.surface, borderBottomLeftRadius: 6 },
    bubblePressed: { opacity: 0.85 },
    body: { paddingVertical: 11, paddingHorizontal: 15, gap: 5, flexShrink: 1 },
    roleTag: { color: colors.textMuted, fontFamily: font.monoBold, fontSize: 9, fontWeight: "500", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 2 },
    roleTagTool: { color: colors.warn },
    text: { color: colors.text, fontSize: font.transcript, lineHeight: 20, fontFamily: font.mono },
    textUser: { color: colors.msgSelfText },
    toolText: { color: colors.textMuted },
    codeBlock: {
      backgroundColor: colors.codeBg,
      borderRadius: 9,
      padding: 11,
      marginVertical: 4,
    },
    codeBlockTool: { borderLeftWidth: 2, borderLeftColor: colors.warn },
    codeText: { color: colors.codeText, fontSize: 12, lineHeight: 19, fontFamily: font.mono },
    copied: { color: colors.accent, fontSize: font.eyebrow, fontFamily: font.mono, alignSelf: "flex-end" },
    tail: { color: colors.warn, fontSize: 11, fontFamily: font.mono },
  });
}
