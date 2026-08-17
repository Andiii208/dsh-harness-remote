import { describe, expect, it } from "vitest";
import { filterSessions, groupByWorkspace, pressureTier } from "../src/data/sessionViews";
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
