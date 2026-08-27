/**
 * eventLogStore — 事件日志持久化（P3 / 审计 A15）。
 *
 * 此前 events 页只读内存（上限 50 条、重连清空、杀进程即焚），
 * 不能当通知中心用。现在把事件（封顶 200 条）持久化到 SecureStore，
 * 冷启动恢复；连接/重连不再清空，真正的事件历史。
 */

import type { SecureStoreApi } from "../data/tokenStore";
import type { NotificationEvent } from "./classifier";

export const EVENT_LOG_KEY = "dsh-event-log";
export const MAX_EVENT_LOG = 200;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 宽容解析：任何非对象/缺 kind 的条目直接丢弃。 */
export function parseEventLog(raw: string | null): NotificationEvent[] {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((e): e is NotificationEvent =>
    isRecord(e) && typeof e.kind === "string",
  );
}

export class EventLogStore {
  constructor(private readonly api: SecureStoreApi) {}

  async read(): Promise<NotificationEvent[]> {
    try {
      const raw = await this.api.getItemAsync(EVENT_LOG_KEY);
      const events = parseEventLog(raw);
      return events.slice(-MAX_EVENT_LOG);
    } catch (err) {
      console.warn("[event-log] read failed", err);
      return [];
    }
  }

  async writeAll(events: NotificationEvent[]): Promise<void> {
    const trimmed = events.slice(-MAX_EVENT_LOG);
    if (trimmed.length === 0) return;
    try {
      await this.api.setItemAsync(EVENT_LOG_KEY, JSON.stringify(trimmed));
    } catch (err) {
      console.warn("[event-log] write failed", err);
    }
  }
}
