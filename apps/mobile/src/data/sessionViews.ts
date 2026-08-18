/**
 * sessionViews — 会话列表视图派生（A：搜索 / 分组 / 压力分档）。
 * 纯函数，零依赖，可单测。UI 只消费这些函数的结果，不自己写过滤/分档逻辑。
 */

import type { SessionSummary } from "./SessionStore";

export type PressureTier = "normal" | "warn" | "danger";

export interface SessionGroup {
  workspace: string;
  sessions: SessionSummary[];
}

/** 搜索：大小写不敏感，匹配 title / workspace / lastMessage。 */
export function filterSessions(sessions: SessionSummary[], query: string): SessionSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return sessions;
  return sessions.filter((s) => {
    const haystacks = [s.title, s.workspace, s.lastMessage];
    return haystacks.some((v) => typeof v === "string" && v.toLowerCase().includes(q));
  });
}

/**
 * 按 workspace 分组；无 workspace 归「其他」。
 * 组序按组内最近会话的 updatedAt 倒序（保持列表“最近活动在前”的直觉）。
 */
export function groupByWorkspace(sessions: SessionSummary[]): SessionGroup[] {
  const groups = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    const key = s.workspace && s.workspace.trim().length > 0 ? s.workspace : "其他";
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([workspace, list]) => ({ workspace, sessions: list }))
    .sort((a, b) => {
      const aMax = Math.max(...a.sessions.map((s) => s.updatedAt));
      const bMax = Math.max(...b.sessions.map((s) => s.updatedAt));
      return bMax - aMax;
    });
}

/** 压力分档：<70 正常 / 70–85 黄 / ≥85 红（领导拍板）。 */
export function pressureTier(percent: number): PressureTier {
  if (percent < 0) return "normal";
  if (percent >= 85) return "danger";
  if (percent >= 70) return "warn";
  return "normal";
}

const DAY_NAMES = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 会话时间格式：今天 HH:mm / 昨天 / 一周内周X / 更早 M/D。 */
export function formatSessionTime(ms: number, now: number = Date.now()): string {
  const nowDate = new Date(now);
  const thenDate = new Date(ms);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(nowDate) - startOfDay(thenDate)) / 86_400_000);
  if (dayDiff <= 0) {
    return thenDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (dayDiff === 1) return "昨天";
  if (dayDiff < 7) return DAY_NAMES[thenDate.getDay()] ?? "";
  return `${thenDate.getMonth() + 1}/${thenDate.getDate()}`;
}
