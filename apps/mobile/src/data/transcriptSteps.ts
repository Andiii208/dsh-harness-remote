/**
 * transcriptSteps — DSH 轨迹事件折叠（纯 TS，零 RN 依赖，可单测）。
 * 将 tool/call、tool/result、turn/start、turn/complete、step/end 折叠为
 * 结构化时间线步骤（type/name/input/output/duration/status）。
 */

export type TranscriptStepType = "tool" | "turn" | "step";
export type TranscriptStepStatus = "running" | "completed" | "failed";

export interface TranscriptStep {
  id: string;
  type: TranscriptStepType;
  name: string;
  status: TranscriptStepStatus;
  /** 参数摘要（tool/call arguments 或 step 输入）。 */
  input?: string;
  /** 结果摘要（tool/result 输出）。 */
  output?: string;
  /** 估算耗时（ms）；未完成/无时间信息时为 undefined。 */
  durationMs?: number;
  startedAt?: number;
  endedAt?: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return "";
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** 从任意 DSH 数据中提取可读文本摘要。 */
export function summarizeStepText(v: unknown, max = 200): string | undefined {
  if (typeof v === "string") {
    const t = truncate(v, max);
    return t.length > 0 ? t : undefined;
  }
  if (Array.isArray(v)) {
    const parts = v.map((item) => summarizeStepText(item, max)).filter((s): s is string => typeof s === "string");
    const t = truncate(parts.join(" "), max);
    return t.length > 0 ? t : undefined;
  }
  if (!isRecord(v)) {
    if (v === null || v === undefined) return undefined;
    const t = truncate(String(v), max);
    return t.length > 0 ? t : undefined;
  }
  if (typeof v.text === "string") return truncate(v.text, max);
  if (typeof v.delta === "string") return truncate(v.delta, max);
  if (typeof v.content === "string") return truncate(v.content, max);
  if (typeof v.message === "string") return truncate(v.message, max);
  if (v.content !== undefined) return summarizeStepText(v.content, max);
  if (v.message !== undefined) return summarizeStepText(v.message, max);
  try {
    const t = JSON.stringify(v);
    if (t && t !== "{}") return truncate(t, max);
  } catch {
    // fall through
  }
  return undefined;
}

function newId(type: TranscriptStepType, name: string, index: number, now: number): string {
  return `${type}-${name}-${index}-${now}`;
}

function completeStep(
  step: TranscriptStep,
  now: number,
  status: TranscriptStepStatus = "completed",
  output?: string,
): TranscriptStep {
  return {
    ...step,
    status,
    ...(output !== undefined && output.length > 0 ? { output } : {}),
    endedAt: now,
    durationMs: Math.max(0, now - (step.startedAt ?? now)),
  };
}

/** 折叠单条轨迹事件。不修改原数组。 */
export function applyStepEvent(
  steps: TranscriptStep[],
  ev: string,
  data: unknown,
  now = Date.now(),
): TranscriptStep[] {
  const list = [...steps];
  const lastRunning = (type?: TranscriptStepType): number => {
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (s && s.status === "running" && (type === undefined || s.type === type)) return i;
    }
    return -1;
  };

  switch (ev) {
    case "turn/start": {
      list.push({
        id: newId("turn", "回合", list.length, now),
        type: "turn",
        name: "回合",
        status: "running",
        startedAt: now,
      });
      return list;
    }
    case "tool/call": {
      if (!isRecord(data)) break;
      const name = str(data.name) ?? "tool";
      const input = summarizeStepText(data.arguments ?? data.input, 200);
      list.push({
        id: newId("tool", name, list.length, now),
        type: "tool",
        name,
        status: "running",
        ...(input !== undefined ? { input } : {}),
        startedAt: now,
      });
      return list;
    }
    case "tool/result": {
      if (!isRecord(data)) break;
      const i = lastRunning("tool");
      const failed = data.error !== undefined || data.ok === false;
      const output = summarizeStepText(data.message ?? data.result ?? data, 240);
      if (i >= 0) {
        const step = list[i];
        if (step) list[i] = completeStep(step, now, failed ? "failed" : "completed", output);
      } else {
        // 孤立的 tool/result：折叠为一条已完成工具步骤，避免轨迹缺失结果。
        const name = str(data.name) ?? "tool";
        list.push({
          id: newId("tool", name, list.length, now),
          type: "tool",
          name,
          status: failed ? "failed" : "completed",
          ...(output !== undefined ? { output } : {}),
          startedAt: now,
          endedAt: now,
          durationMs: 0,
        });
      }
      return list;
    }
    case "turn/complete": {
      const i = lastRunning("turn");
      if (i >= 0) {
        const step = list[i];
        if (step) list[i] = completeStep(step, now, "completed");
      }
      return list;
    }
    case "step/end": {
      const i = lastRunning();
      if (i >= 0) {
        const step = list[i];
        if (step) list[i] = completeStep(step, now, "completed");
      }
      return list;
    }
    default:
      break;
  }
  return list;
}
