/**
 * TrajectoryView — 轨迹时间线：统计卡（Duration/Turns/Calls）+ 三泳道时间线
 * + 步骤列表（类型图标、名称、耗时、参数/结果摘要，点开看详情）。
 */

import { useMemo, useState, type MutableRefObject } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import Svg, { Rect } from "react-native-svg";
import type { TranscriptStep } from "../../data/transcriptSteps";
import { font, radius, space, type ThemeColors } from "../../theme";
import { useTheme } from "../../theme-context";
import { EmptyState } from "../EmptyState";
import { buildTrajectoryRows, formatStepDuration, laneSegments, stepStatusLabel, stepTypeIcon, stepTypeLabel, type TrajectoryRow } from "./trajectory";
import { BottomSheet } from "../BottomSheet";

const LANE_KINDS = ["turn", "step", "tool"] as const;

export function TrajectoryView({
  steps,
  listRef,
}: {
  steps: TranscriptStep[];
  listRef: MutableRefObject<FlashListRef<any> | null>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [detail, setDetail] = useState<TranscriptStep | null>(null);

  const totalMs = useMemo(() => steps.reduce((a, s) => a + (s.durationMs ?? 0), 0), [steps]);
  const turns = useMemo(() => steps.filter((s) => s.type === "turn").length, [steps]);
  const calls = useMemo(() => steps.filter((s) => s.type === "tool").length, [steps]);
  const rows = useMemo(() => buildTrajectoryRows(steps), [steps]);

  const header = useMemo(
    () => (
      <View style={styles.header}>
        <View style={styles.statsRow}>
          <Stat label="Duration" value={formatStepDuration(totalMs)} colors={colors} styles={styles} />
          <Stat label="Turns" value={String(turns)} colors={colors} styles={styles} />
          <Stat label="Calls" value={String(calls)} colors={colors} styles={styles} />
        </View>
        <View style={styles.lanesCard}>
          <Text style={styles.lanesTitle}>TIMELINE</Text>
          {LANE_KINDS.map((kind) => (
            <Lane key={kind} kind={kind} steps={steps} colors={colors} totalMs={totalMs} />
          ))}
        </View>
      </View>
    ),
    [colors, styles, steps, totalMs, turns, calls],
  );

  return (
    <>
      <FlashList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.content}
        data={rows}
        keyExtractor={(row) => `${row.kind}-${row.step.id}`}
        ListHeaderComponent={steps.length > 0 ? header : null}
        ListEmptyComponent={<EmptyState eyebrow="NO STEPS" text="暂无轨迹步骤——发送消息或运行工具后出现" />}
        renderItem={({ item }: { item: TrajectoryRow }) =>
          item.kind === "turn" ? (
            <View style={styles.turnHeaderRow}>
              <Text style={styles.turnHeaderIcon}>↻</Text>
              <View style={styles.rowBody}>
                <Text style={styles.turnHeaderTitle}>{item.step.name || stepTypeLabel(item.step.type)}</Text>
                <Text style={styles.meta}>
                  {stepStatusLabel(item.step.status)} · {formatStepDuration(item.step.durationMs)}
                </Text>
              </View>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => setDetail(item.step)}
              accessibilityRole="button"
              accessibilityLabel={`轨迹步骤 ${item.step.name}`}
            >
              <View style={styles.iconWrap}>
                <Text style={styles.icon}>{stepTypeIcon(item.step.type)}</Text>
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowHeader}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.step.name}
                  </Text>
                  <Text style={styles.duration}>{formatStepDuration(item.step.durationMs)}</Text>
                </View>
                <Text style={styles.meta}>
                  {stepTypeLabel(item.step.type)} · {stepStatusLabel(item.step.status)}
                </Text>
                {item.step.input ? (
                  <Text style={styles.summary} numberOfLines={1}>
                    参数：{item.step.input}
                  </Text>
                ) : null}
                {item.step.output ? (
                  <Text style={styles.summary} numberOfLines={1}>
                    结果：{item.step.output}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )
        }
      />

      <BottomSheet visible={detail !== null} onClose={() => setDetail(null)}>

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
</BottomSheet>
    </>
  );
}

function Stat({
  label,
  value,
  colors,
  styles,
}: {
  label: string;
  value: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Lane({ kind, steps, colors, totalMs }: { kind: "turn" | "step" | "tool"; steps: TranscriptStep[]; colors: ThemeColors; totalMs: number }) {
  const segments = laneSegments(steps, kind, totalMs);
  const fill =
    kind === "turn" ? colors.traceBlue : kind === "step" ? colors.tracePurple : colors.traceOrange;
  return (
    <View style={laneStyles.row}>
      <Text style={[laneStyles.label, { color: colors.textMuted }]}>{kind.toUpperCase()}</Text>
      <View style={laneStyles.track}>
        <Svg width="100%" height={6} viewBox="0 0 100 6" preserveAspectRatio="none">
          {segments.map((seg) => (
            <Rect key={seg.id} x={seg.start} y={0} width={seg.width} height={6} rx={3} fill={fill} opacity={0.9} />
          ))}
        </Svg>
      </View>
    </View>
  );
}

const laneStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { width: 42, fontFamily: font.monoBold, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" },
  track: { flex: 1, height: 6, justifyContent: "center" },
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    list: { flex: 1 },
    content: { padding: space.x4, gap: space.x2, paddingBottom: space.x6 },
    header: { gap: space.x3, marginBottom: space.x2 },
    statsRow: { flexDirection: "row", gap: space.x2 },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.separator,
      padding: space.x3,
      gap: 4,
    },
    statLabel: { color: colors.textMuted, fontFamily: font.monoBold, fontSize: font.eyebrow, letterSpacing: 1.2, textTransform: "uppercase" },
    statValue: { color: colors.text, fontFamily: font.monoMedium, fontSize: 15 },
    lanesCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.separator,
      padding: space.x4,
      gap: 10,
    },
    lanesTitle: { color: colors.textMuted, fontFamily: font.monoBold, fontSize: font.eyebrow, letterSpacing: 1.4, textTransform: "uppercase" },
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
    turnHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: space.x3,
      backgroundColor: colors.traceBlue,
      borderRadius: radius.card,
      padding: space.x3,
      marginTop: space.x2,
    },
    turnHeaderIcon: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
    turnHeaderTitle: { color: "#FFFFFF", fontSize: font.body, fontWeight: "600" },
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


    detailTitle: { color: colors.text, fontSize: font.title, fontWeight: "600" },
    detailMeta: { color: colors.textMuted, fontSize: font.caption, fontFamily: font.mono },
    detailLabel: { color: colors.textMuted, fontSize: font.eyebrow, fontFamily: font.monoBold, letterSpacing: 1.2, textTransform: "uppercase", marginTop: space.x2 },
    detailText: { color: colors.text, fontSize: font.body, lineHeight: 21 },
    detailHint: { color: colors.textDim, fontSize: font.caption, textAlign: "center", marginTop: space.x2 },
  });
}
