/**
 * trajectory — TrajectoryView 的纯函数工具（零 RN 依赖，可单测）。
 */

import type { TranscriptStepStatus, TranscriptStepType } from "../../data/transcriptSteps";

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
