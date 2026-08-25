import { describe, expect, it } from "vitest";
import { filterSessions, formatSessionTime, groupByWorkspace, pressureTier, workspaceDisplayName } from "../src/data/sessionViews";
import type { SessionSummary } from "../src/data/SessionStore";

const s = (over: Partial<SessionSummary>): SessionSummary => ({
  id: "s1",
  title: "deploy",
  workspace: "D:\\app",
  lastMessage: "构建完成",
  updatedAt: 1,
  ...over,
});

describe("filterSessions", () => {
  it("matches title, workspace or lastMessage case-insensitively", () => {
    const sessions = [
      s({ id: "a", title: "Deploy", workspace: "C:\\work", lastMessage: "hello" }),
      s({ id: "b", title: "Debug", workspace: "D:\\APP", lastMessage: "world" }),
      s({ id: "c", title: "Other", workspace: "X", lastMessage: "构建失败" }),
    ];
    expect(filterSessions(sessions, "deploy").map((x) => x.id)).toEqual(["a"]);
    expect(filterSessions(sessions, "d:\\app").map((x) => x.id)).toEqual(["b"]);
    expect(filterSessions(sessions, "构建").map((x) => x.id)).toEqual(["c"]);
    expect(filterSessions(sessions, "").map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});

describe("groupByWorkspace", () => {
  it("groups by workspace and puts missing workspace into 其他", () => {
    const groups = groupByWorkspace([
      s({ id: "a", workspace: "D:\\app" }),
      s({ id: "b", workspace: "D:\\app" }),
      s({ id: "c", workspace: undefined }),
    ]);
    expect(groups.map((g) => g.workspace)).toEqual(["D:\\app", "其他"]);
    expect(groups[0]?.sessions.map((x) => x.id)).toEqual(["a", "b"]);
    expect(groups[1]?.sessions.map((x) => x.id)).toEqual(["c"]);
  });

  it("orders groups by the most recent session in each group", () => {
    const groups = groupByWorkspace([
      s({ id: "old-w", workspace: "W1", updatedAt: 1 }),
      s({ id: "new-o", workspace: undefined, updatedAt: 3 }),
      s({ id: "new-w", workspace: "W2", updatedAt: 2 }),
    ]);
    expect(groups.map((g) => g.workspace)).toEqual(["其他", "W2", "W1"]);
  });
});

describe("formatSessionTime", () => {
  it("formats today as HH:mm, yesterday as 昨天, within a week as 周X, older as M/D", () => {
    const now = new Date(2026, 7, 18, 21, 30).getTime(); // 2026-08-18 21:30（周二）
    const today = new Date(2026, 7, 18, 9, 5).getTime();
    const yesterday = new Date(2026, 7, 17, 23, 59).getTime();
    const twoDaysAgo = new Date(2026, 7, 16, 12, 0).getTime(); // 周日
    const older = new Date(2026, 6, 1, 10, 0).getTime();
    expect(formatSessionTime(today, now)).toContain(":");
    expect(formatSessionTime(yesterday, now)).toBe("昨天");
    expect(formatSessionTime(twoDaysAgo, now)).toBe("周日");
    expect(formatSessionTime(older, now)).toBe("7/1");
  });
});

describe("pressureTier", () => {
  it("classifies <70 normal, 70-85 warn, >=85 danger", () => {
    expect(pressureTier(0)).toBe("normal");
    expect(pressureTier(69.9)).toBe("normal");
    expect(pressureTier(70)).toBe("warn");
    expect(pressureTier(84.9)).toBe("warn");
    expect(pressureTier(85)).toBe("danger");
    expect(pressureTier(120)).toBe("danger");
  });

  it("treats negative pressure as normal (lenient UI)", () => {
    expect(pressureTier(-1)).toBe("normal");
  });
});

describe("workspaceDisplayName", () => {
  it("prefers the host-provided workspace title", () => {
    expect(workspaceDisplayName("D:\\APP\\foo", (p) => (p === "D:/APP/foo" ? "Foo 项目" : undefined))).toBe("Foo 项目");
  });

  it("falls back to the path basename instead of rendering the full Windows path", () => {
    expect(workspaceDisplayName("D:\\APP\\dsh-remote", () => undefined)).toBe("dsh-remote");
    expect(workspaceDisplayName("/home/user/projects/dsh-remote/", () => undefined)).toBe("dsh-remote");
  });

  it("returns 其他 for empty/missing paths and never returns an empty label", () => {
    expect(workspaceDisplayName(undefined, () => undefined)).toBe("其他");
    expect(workspaceDisplayName("", () => undefined)).toBe("其他");
    expect(workspaceDisplayName("D:\\", () => undefined)).toBe("D:");
  });
});
