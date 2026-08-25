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
      const aMax = Math.max(...a.sessions.map((s) => s.sortKey ?? s.updatedAt));
      const bMax = Math.max(...b.sessions.map((s) => s.sortKey ?? s.updatedAt));
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

/**
 * 工作区分组显示名（审计 2026-08-23 P1-4）：
 * 优先用宿主 workspace.list 的标题；否则退化为路径末段（basename），
 * 绝不把「D:\APP\foo」整条 Windows 路径渲染成分组头。
 * @param path 会话上的原始 workspace 路径（可空）
 * @param getTitle 归一化路径 → 宿主标题 的查询函数（可返回 undefined）
 */
export function workspaceDisplayName(
  path: string | undefined,
  getTitle: (normalizedPath: string) => string | undefined,
): string {
  if (!path || path.trim().length === 0) return "其他";
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const titled = getTitle(normalized);
  if (titled && titled.trim().length > 0) return titled;
  const segments = normalized.split("/").filter((s) => s.length > 0);
  const base = segments[segments.length - 1];
  return base && base.length > 0 ? base : normalized;
}

const DAY_NAMES_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 会话时间格式：今天 HH:mm / 昨天 / 一周内周X / 更早 M/D。weekday/yesterday 名称可注入翻译。 */
export function formatSessionTime(
  ms: number,
  now: number = Date.now(),
  weekdays: string[] = DAY_NAMES_ZH,
  yesterdayLabel: string = "昨天",
): string {
  const nowDate = new Date(now);
  const thenDate = new Date(ms);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(nowDate) - startOfDay(thenDate)) / 86_400_000);
  if (dayDiff <= 0) {
    return thenDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (dayDiff === 1) return yesterdayLabel;
  if (dayDiff < 7) return weekdays[thenDate.getDay()] ?? "";
  return `${thenDate.getMonth() + 1}/${thenDate.getDate()}`;
}
