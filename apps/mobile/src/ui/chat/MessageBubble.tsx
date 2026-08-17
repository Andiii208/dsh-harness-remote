/**
 * MessageBubble — 转录消息（UI-SYSTEM v7：iMessage 式气泡）。
 * user = DeepSeek 蓝气泡白字；assistant = 表面色气泡；tool = 表面色 + 代码块。
 * 代码块：默认展开、可折叠，轻量语法高亮（关键词/字符串/注释/数字）。
 * 长按：操作菜单（复制消息全文 / 按代码块分别复制）。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { PluginCommand } from "@dsh-remote/protocol";
import type { TranscriptMessage } from "../../data/SessionStore";
import { useConnection } from "../../transport/ConnectionProvider";
import { font, radius, type ThemeColors } from "../../theme";
import { useTheme } from "../../theme-context";
import { StreamingCursor } from "../StreamingCursor";
import { haptic } from "../haptics";
import { splitCodeWithLang } from "./splitCode";
import { highlight, type HighlightTokenType } from "./highlight";

function tokenColor(type: HighlightTokenType, colors: ThemeColors): string {
  switch (type) {
    case "keyword":
      return colors.accent;
    case "string":
      return colors.success;
    case "comment":
      return colors.textDim;
    case "number":
      return colors.warn;
    default:
      return colors.codeText;
  }
}

export function MessageBubble({ m, live }: { m: TranscriptMessage; live?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { pluginList, pluginExec } = useConnection();
  const [copied, setCopied] = useState(false);
  const [pluginNotice, setPluginNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [pluginCommands, setPluginCommands] = useState<PluginCommand[]>([]);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pluginTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    if (pluginTimer.current) clearTimeout(pluginTimer.current);
  }, []);

  // R2：菜单打开时读取宿主插件命令；读不到自动隐藏插件指令区。
  useEffect(() => {
    if (!menuOpen) {
      setPluginCommands([]);
      return;
    }
    let alive = true;
    void pluginList().then((list) => {
      if (alive) setPluginCommands(list?.commands ?? []);
    });
    return () => {
      alive = false;
    };
  }, [menuOpen, pluginList]);

  if (m.gap) {
    return (
      <View style={styles.gapRow}>
        <Text style={styles.gapText}>{m.content}</Text>
      </View>
    );
  }
  const isUser = m.role === "user";
  const isTool = m.role === "tool";
  const segments = splitCodeWithLang(m.content);
  const codeSegments = segments.filter((seg) => seg.code);

  const copy = async (text: string) => {
    if (text.length === 0) return;
    try {
      await Clipboard.setStringAsync(text);
    } catch (err) {
      console.warn("[copy] failed", err);
      void haptic("error");
      return;
    }
    void haptic("light");
    setCopied(true);
    setMenuOpen(false);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1200);
  };

  const runPluginCommand = async (cmd: PluginCommand) => {
    setMenuOpen(false);
    void haptic("light");
    const r = await pluginExec(cmd.id);
    setPluginNotice(r?.ok === false ? `${cmd.title} · ${r.error?.message ?? "执行失败"}` : `${cmd.title} · 已发送`);
    if (pluginTimer.current) clearTimeout(pluginTimer.current);
    pluginTimer.current = setTimeout(() => setPluginNotice(""), 1600);
  };

  const onLongPress = () => {
    if (m.content.length === 0) return;
    void haptic("light");
    setMenuOpen(true);
  };

  const toggleCollapsed = (index: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleBot,
          pressed && styles.bubblePressed,
        ]}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityRole="text"
        accessibilityHint="长按打开操作菜单"
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
                <View style={styles.codeHeader}>
                  <Text style={styles.codeLang}>{seg.lang ?? "code"}</Text>
                  <Pressable
                    onPress={() => toggleCollapsed(i)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={collapsed.has(i) ? "展开代码块" : "折叠代码块"}
                  >
                    <Text style={styles.codeToggle}>{collapsed.has(i) ? "▸ 展开" : "▾ 折叠"}</Text>
                  </Pressable>
                </View>
                {!collapsed.has(i) && (
                  <Text style={styles.codeText} selectable>
                    {highlight(seg.text).map((tok, j) => (
                      <Text key={j} style={{ color: tokenColor(tok.type, colors) }}>
                        {tok.text}
                      </Text>
                    ))}
                  </Text>
                )}
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
          {pluginNotice.length > 0 && <Text style={styles.copied}>{pluginNotice}</Text>}
        </View>
      </Pressable>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>消息操作</Text>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => void copy(m.content)}
              accessibilityRole="button"
              accessibilityLabel="复制消息全文"
            >
              <Text style={styles.menuItemText}>复制消息全文</Text>
            </Pressable>
            {codeSegments.map((seg, i) => (
              <Pressable
                key={`copy-code-${i}`}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={() => void copy(seg.text)}
                accessibilityRole="button"
                accessibilityLabel={`复制代码块 ${i + 1}`}
              >
                <Text style={styles.menuItemText}>复制代码块 #{i + 1}{seg.lang ? `（${seg.lang}）` : ""}</Text>
              </Pressable>
            ))}
            {pluginCommands.length > 0 && (
              <Text style={styles.menuTitle}>插件指令</Text>
            )}
            {pluginCommands.map((cmd) => (
              <Pressable
                key={`plugin-${cmd.id}`}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                onPress={() => void runPluginCommand(cmd)}
                accessibilityRole="button"
                accessibilityLabel={cmd.title}
              >
                <Text style={styles.menuItemText}>{cmd.title}</Text>
                {cmd.risk === "approve" && <Text style={styles.menuRisk}>需审批</Text>}
              </Pressable>
            ))}
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => setMenuOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="取消"
            >
              <Text style={[styles.menuItemText, styles.menuCancelText]}>取消</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
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
      gap: 8,
    },
    codeBlockTool: { borderLeftWidth: 2, borderLeftColor: colors.warn },
    codeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    codeLang: { color: colors.textDim, fontSize: 9, fontFamily: font.monoBold, letterSpacing: 1, textTransform: "uppercase" },
    codeToggle: { color: colors.accent, fontSize: 11, fontFamily: font.mono, fontWeight: "500" },
    codeText: { color: colors.codeText, fontSize: 12, lineHeight: 19, fontFamily: font.mono },
    copied: { color: colors.accent, fontSize: font.eyebrow, fontFamily: font.mono, alignSelf: "flex-end" },
    tail: { color: colors.warn, fontSize: 11, fontFamily: font.mono },
    modalBackdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
    },
    menuPanel: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 16,
      paddingBottom: 28,
      gap: 8,
    },
    menuTitle: { color: colors.textMuted, fontSize: font.eyebrow, fontFamily: font.monoBold, letterSpacing: 1.6, textTransform: "uppercase", marginBottom: 6 },
    menuItem: {
      backgroundColor: colors.surface2,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    menuItemPressed: { opacity: 0.7 },
    menuItemText: { color: colors.text, fontSize: font.body, fontWeight: "500" },
    menuRisk: { color: colors.warn, fontSize: 10, fontFamily: font.mono, marginTop: 3 },
    menuCancelText: { color: colors.textMuted },
  });
}
