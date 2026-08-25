/**
 * chatTimeline — 聊天转录的日期分组（审计 P1 遗留：消息按天分割）。
 * 纯函数，零依赖，可单测。消息带 ts 时按日切分插入「今天/昨天/M月D日」分割行；
 * 无 ts 的合成消息（间隙标记、流式 live）并入前一条所在日期分组。
 */

import type { TranscriptMessage } from "../../data/SessionStore";

export type TranscriptRow =
  | { kind: "message"; key: string; message: TranscriptMessage }
  | { kind: "day"; key: string; label: string };

export function dayLabel(
  ms: number,
  now: number = Date.now(),
  todayLabel = "今天",
  yesterdayLabel = "昨天",
): string {
  const nowDate = new Date(now);
  const thenDate = new Date(ms);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(nowDate) - startOfDay(thenDate)) / 86_400_000);
  if (dayDiff <= 0) return todayLabel;
  if (dayDiff === 1) return yesterdayLabel;
  return `${thenDate.getMonth() + 1}月${thenDate.getDate()}日`;
}

export function buildTranscriptRows(
  messages: TranscriptMessage[],
  now: number = Date.now(),
): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  let lastDay: string | null = null;
  messages.forEach((m, i) => {
    if (m.ts !== undefined) {
      const day = dayLabel(m.ts, now);
      if (day !== lastDay) {
        rows.push({ kind: "day", key: `day-${i}`, label: day });
        lastDay = day;
      }
    }
    rows.push({ kind: "message", key: m.id ?? `m-${i}`, message: m });
  });
  return rows;
}
