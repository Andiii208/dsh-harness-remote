import { describe, expect, it } from "vitest";
import {
  buildTrajectoryRows,
  formatStepDuration,
  laneSegments,
  stepStatusLabel,
  stepTypeIcon,
  stepTypeLabel,
} from "../src/ui/trajectory/trajectory";

describe("trajectory pure helpers", () => {
  it("formats step durations in ms/s/m", () => {
    expect(formatStepDuration(undefined)).toBe("—");
    expect(formatStepDuration(-1)).toBe("—");
    expect(formatStepDuration(0)).toBe("0ms");
    expect(formatStepDuration(350)).toBe("350ms");
    expect(formatStepDuration(1200)).toBe("1.2s");
    expect(formatStepDuration(65000)).toBe("1m05s");
  });

  it("maps step type and status to Chinese labels", () => {
    expect(stepTypeLabel("tool")).toBe("工具");
    expect(stepTypeLabel("turn")).toBe("回合");
    expect(stepTypeLabel("step")).toBe("步骤");
    expect(stepTypeIcon("tool")).toBe("⚒");
    expect(stepStatusLabel("running")).toBe("进行中");
    expect(stepStatusLabel("completed")).toBe("已完成");
    expect(stepStatusLabel("failed")).toBe("失败");
  });

  it("sizes lane segments by durationMs / totalMs", () => {
    const steps = [
      { id: "a", type: "tool" as const, name: "t", status: "completed" as const, durationMs: 1000 },
      { id: "b", type: "tool" as const, name: "t", status: "completed" as const, durationMs: 3000 },
    ];
    const segs = laneSegments(steps, "tool", 4000);
    expect(segs[0]).toMatchObject({ id: "a", start: 0 });
    expect(segs[0]?.width).toBeCloseTo(25 - 1.2, 1);
    expect(segs[1]?.start).toBeCloseTo(25, 1);
    expect(segs[1]?.width).toBeCloseTo(75 - 1.2, 1);
  });

  it("falls back to equal lane segments when totalMs is zero", () => {
    const steps = [
      { id: "a", type: "step" as const, name: "s", status: "completed" as const, durationMs: 0 },
      { id: "b", type: "step" as const, name: "s", status: "completed" as const, durationMs: 0 },
    ];
    const segs = laneSegments(steps, "step", 0);
    expect(segs.map((s) => s.start)).toEqual([0, 50]);
  });

  it("builds turn headers followed by step rows", () => {
    const rows = buildTrajectoryRows([
      { id: "t1", type: "turn" as const, name: "Turn 1", status: "completed" as const },
      { id: "s1", type: "step" as const, name: "step", status: "completed" as const },
      { id: "t2", type: "turn" as const, name: "Turn 2", status: "running" as const },
    ]);
    expect(rows.map((r) => `${r.kind}:${r.step.id}`)).toEqual(["turn:t1", "item:s1", "turn:t2"]);
  });
});
