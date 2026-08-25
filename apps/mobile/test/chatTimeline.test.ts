import { describe, expect, it } from "vitest";
import { buildTranscriptRows, dayLabel } from "../src/ui/chat/chatTimeline";
import type { TranscriptMessage } from "../src/data/SessionStore";

const now = new Date(2026, 7, 18, 21, 30).getTime(); // 2026-08-18 21:30（周二）
const todayMs = new Date(2026, 7, 18, 9, 5).getTime();
const yesterdayMs = new Date(2026, 7, 17, 23, 59).getTime();
const olderMs = new Date(2026, 7, 10, 10, 0).getTime();

const msg = (over: Partial<TranscriptMessage>): TranscriptMessage => ({
  role: "user",
  content: "hi",
  ...over,
});

describe("dayLabel", () => {
  it("labels today / yesterday / older as 今天 / 昨天 / M月D日", () => {
    expect(dayLabel(todayMs, now)).toBe("今天");
    expect(dayLabel(yesterdayMs, now)).toBe("昨天");
    expect(dayLabel(olderMs, now)).toBe("8月10日");
  });
});

describe("buildTranscriptRows", () => {
  it("inserts a day divider when the message day changes", () => {
    const rows = buildTranscriptRows(
      [
        msg({ content: "昨天的话", ts: yesterdayMs }),
        msg({ content: "今天的话", ts: todayMs }),
        msg({ content: "还是今天", ts: todayMs + 1000 }),
      ],
      now,
    );
    expect(rows.map((r) => (r.kind === "day" ? `DAY:${r.label}` : r.message.content))).toEqual([
      "DAY:昨天",
      "昨天的话",
      "DAY:今天",
      "今天的话",
      "还是今天",
    ]);
  });

  it("keeps ts-less messages in the previous day group without a divider", () => {
    const rows = buildTranscriptRows(
      [
        msg({ content: "a", ts: todayMs }),
        msg({ content: "gap", gap: true }),
        msg({ content: "b", ts: todayMs + 5000 }),
      ],
      now,
    );
    expect(rows.filter((r) => r.kind === "day")).toHaveLength(1);
    expect(rows.map((r) => (r.kind === "day" ? "DAY" : r.message.content))).toEqual([
      "DAY",
      "a",
      "gap",
      "b",
    ]);
  });

  it("prepends a day divider before the very first dated message", () => {
    // 聊天 App 惯例：首条消息上方也显示日期（今天/昨天/M月D日）。
    const rows = buildTranscriptRows([msg({ content: "x", ts: todayMs })], now);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "day", label: "今天" });
    expect(rows[1]).toMatchObject({ kind: "message" });
  });

  it("produces unique keys for dividers and messages", () => {
    const rows = buildTranscriptRows(
      [msg({ content: "a", ts: yesterdayMs }), msg({ content: "b", ts: todayMs })],
      now,
    );
    const keys = rows.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
