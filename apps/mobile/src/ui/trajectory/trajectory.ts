/**
 * trajectory — TrajectoryView 的纯函数工具（零 RN 依赖，可单测）。
 */

import type { TranscriptStep, TranscriptStepStatus, TranscriptStepType } from "../../data/transcriptSteps";

export function stepTypeLabel(type: TranscriptStepType): string {
  switch (type) {
    case "tool":
      return "工具";
    case "turn":
      return "回合";
    case "step":
      return "步骤";
  }
}

export function stepTypeIcon(type: TranscriptStepType): string {
  switch (type) {
    case "tool":
      return "⚒";
    case "turn":
      return "↻";
    case "step":
      return "·";
  }
}

export function stepStatusLabel(status: TranscriptStepStatus): string {
  switch (status) {
    case "running":
      return "进行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
  }
}

export function formatStepDuration(ms: number | undefined): string {
  if (ms === undefined || Number.isNaN(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return `${minutes}m${seconds.toString().padStart(2, "0")}s`;
}

export interface LaneSegment {
  id: string;
  /** 轨道内起始百分比（0-100）。 */
  start: number;
  /** 轨道内宽度百分比（最小 1.6，保持可点击/可见）。 */
  width: number;
}

/**
 * 把某一泳道的步骤按 durationMs/totalMs 转成轨道分段（L1 修复）。
 * totalMs<=0 时回退为按步骤数等分。
 */
export function laneSegments(steps: TranscriptStep[], kind: TranscriptStepType, totalMs: number): LaneSegment[] {
  const filtered = steps.filter((s) => s.type === kind);
  if (filtered.length === 0) return [];
  if (!Number.isFinite(totalMs) || totalMs <= 0) {
    return filtered.map((s, i) => ({
      id: s.id,
      start: (i / filtered.length) * 100,
      width: Math.max(1.6, 100 / filtered.length - 1.2),
    }));
  }
  let elapsed = 0;
  return filtered.map((s) => {
    const dur = Math.max(s.durationMs ?? 0, 0);
    const start = (elapsed / totalMs) * 100;
    const width = Math.max(1.6, (dur / totalMs) * 100 - 1.2);
    elapsed += dur;
    return { id: s.id, start, width };
  });
}

export interface TrajectoryRow {
  kind: "turn" | "item";
  step: TranscriptStep;
}

/** 把步骤列表转成 Turn 分组行（Turn 头 + 步骤行）。 */
export function buildTrajectoryRows(steps: TranscriptStep[]): TrajectoryRow[] {
  const rows: TrajectoryRow[] = [];
  for (const s of steps) {
    if (s.type === "turn") rows.push({ kind: "turn", step: s });
    else rows.push({ kind: "item", step: s });
  }
  return rows;
}
