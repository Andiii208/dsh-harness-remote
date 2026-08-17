/**
 * ApprovalHistoryStore — 审批/提问处理历史（C：审批流程）。
 * respond 成功后记录 rpcId/kind/prompt/结果/时间；历史页按时间倒序展示。
 * 纯 TS store：存储注入（App 用 SecureStore，测试用内存桩），零 RN 依赖。
 */

import type { SecureStoreApi } from "./tokenStore";

export interface ApprovalHistoryEntry {
  rpcId: string;
  kind: string;
  prompt: string;
  result: unknown;
  respondedAt: number;
}

export const APPROVAL_HISTORY_KEY = "dsh-approval-history";
const MAX_ENTRIES = 100;

export class ApprovalHistoryStore {
  constructor(private readonly api: SecureStoreApi) {}

  /** 读取全部历史（时间倒序，最新在前）。存储不可用/损坏 → 空数组（不抛错）。 */
  async list(): Promise<ApprovalHistoryEntry[]> {
    try {
      const raw = await this.api.getItemAsync(APPROVAL_HISTORY_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const out: ApprovalHistoryEntry[] = [];
      for (const item of parsed) {
        const e = this.normalize(item);
        if (e) out.push(e);
      }
      return out.sort((a, b) => b.respondedAt - a.respondedAt);
    } catch (err) {
      console.warn("[approval-history] read failed", err);
      return [];
    }
  }

  /** 记录一条处理历史（最新在前，最多保留 MAX_ENTRIES 条）。 */
  async record(entry: ApprovalHistoryEntry): Promise<void> {
    const cleaned: ApprovalHistoryEntry = {
      rpcId: String(entry.rpcId ?? ""),
      kind: String(entry.kind ?? ""),
      prompt: String(entry.prompt ?? ""),
      result: entry.result,
      respondedAt:
        typeof entry.respondedAt === "number" && Number.isFinite(entry.respondedAt)
          ? entry.respondedAt
          : Date.now(),
    };
    try {
      const list = await this.list();
      const next = [cleaned, ...list.filter((e) => e.rpcId !== cleaned.rpcId || e.respondedAt !== cleaned.respondedAt)];
      const trimmed = next.slice(0, MAX_ENTRIES);
      await this.api.setItemAsync(APPROVAL_HISTORY_KEY, JSON.stringify(trimmed));
    } catch (err) {
      console.warn("[approval-history] write failed", err);
    }
  }

  private normalize(v: unknown): ApprovalHistoryEntry | null {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (typeof o.rpcId !== "string" || typeof o.kind !== "string") return null;
    const respondedAt = typeof o.respondedAt === "number" ? o.respondedAt : 0;
    return {
      rpcId: o.rpcId,
      kind: o.kind,
      prompt: typeof o.prompt === "string" ? o.prompt : "",
      result: o.result,
      respondedAt,
    };
  }
}
