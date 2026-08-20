/**
 * TrajectoryView — 轨迹时间线（步骤类型图标、名称、耗时、参数/结果摘要，点开看详情）。
 */

import { useMemo, useState, type MutableRefObject } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import type { TranscriptStep } from "../../data/transcriptSteps";
import { font, radius, space, type ThemeColors } from "../../theme";
import { useTheme } from "../../theme-context";
import { EmptyState } from "../EmptyState";
import { formatStepDuration, stepStatusLabel, stepTypeIcon, stepTypeLabel } from "./trajectory";

export function TrajectoryView({
  steps,
  listRef,
}: {
  steps: TranscriptStep[];
  listRef: MutableRefObject<FlashListRef<TranscriptStep> | null>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [detail, setDetail] = useState<TranscriptStep | null>(null);

  return (
    <>
      <FlashList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.content}
        data={steps}
        keyExtractor={(s) => s.id}
        ListEmptyComponent={<EmptyState eyebrow="NO STEPS" text="暂无轨迹步骤——发送消息或运行工具后出现" />}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => setDetail(item)}
            accessibilityRole="button"
            accessibilityLabel={`轨迹步骤 ${item.name}`}
          >
            <View style={styles.iconWrap}>
              <Text style={styles.icon}>{stepTypeIcon(item.type)}</Text>
            </View>
            <View style={styles.rowBody}>
              <View style={styles.rowHeader}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.duration}>{formatStepDuration(item.durationMs)}</Text>
              </View>
              <Text style={styles.meta}>
                {stepTypeLabel(item.type)} · {stepStatusLabel(item.status)}
              </Text>
              {item.input ? (
                <Text style={styles.summary} numberOfLines={1}>
                  参数：{item.input}
                </Text>
              ) : null}
              {item.output ? (
                <Text style={styles.summary} numberOfLines={1}>
                  结果：{item.output}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />

      <Modal visible={detail !== null} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <Pressable
          style={styles.backdrop}
          onPress={() => setDetail(null)}
          accessibilityRole="button"
          accessibilityLabel="关闭步骤详情"
        >
          <View style={styles.detailPanel}>
            <Text style={styles.detailTitle}>{detail?.name ?? ""}</Text>
            <Text style={styles.detailMeta}>
              {detail
                ? `${stepTypeLabel(detail.type)} · ${stepStatusLabel(detail.status)} · ${formatStepDuration(detail.durationMs)}`
                : ""}
            </Text>
            {detail?.input ? <Text style={styles.detailLabel}>参数</Text> : null}
            {detail?.input ? <Text style={styles.detailText}>{detail.input}</Text> : null}
            {detail?.output ? <Text style={styles.detailLabel}>结果</Text> : null}
            {detail?.output ? <Text style={styles.detailText}>{detail.output}</Text> : null}
            <Text style={styles.detailHint}>轻触关闭</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: { flex: 1 },
    content: { padding: space.x4, gap: space.x2, paddingBottom: space.x6 },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: space.x3,
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.separator,
      padding: space.x3,
    },
    rowPressed: { opacity: 0.75 },
    iconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 2,
    },
    icon: { color: colors.accent, fontSize: 14, fontWeight: "600" },
    rowBody: { flex: 1, gap: 2 },
    rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.x2 },
    name: { color: colors.text, fontSize: font.body, fontWeight: "600", flexShrink: 1 },
    duration: { color: colors.textDim, fontSize: font.caption, fontFamily: font.mono },
    meta: { color: colors.textMuted, fontSize: font.eyebrow, fontFamily: font.mono },
    summary: { color: colors.textMuted, fontSize: font.caption, lineHeight: 17 },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
      padding: space.x4,
    },
    detailPanel: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: space.x4,
      gap: space.x2,
      paddingBottom: space.x5,
    },
    detailTitle: { color: colors.text, fontSize: font.title, fontWeight: "600" },
    detailMeta: { color: colors.textMuted, fontSize: font.caption, fontFamily: font.mono },
    detailLabel: { color: colors.textMuted, fontSize: font.eyebrow, fontFamily: font.monoBold, letterSpacing: 1.2, textTransform: "uppercase", marginTop: space.x2 },
    detailText: { color: colors.text, fontSize: font.body, lineHeight: 21 },
    detailHint: { color: colors.textDim, fontSize: font.caption, textAlign: "center", marginTop: space.x2 },
  });
}
