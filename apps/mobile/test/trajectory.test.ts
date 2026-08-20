import { describe, expect, it } from "vitest";
import {
  formatStepDuration,
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
});
