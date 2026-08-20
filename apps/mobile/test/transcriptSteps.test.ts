import { describe, expect, it } from "vitest";
import { applyStepEvent, summarizeStepText, type TranscriptStep } from "../src/data/transcriptSteps";

describe("transcriptSteps", () => {
  it("folds turn/start into a running turn step and turn/complete closes it", () => {
    let steps: TranscriptStep[] = [];
    steps = applyStepEvent(steps, "turn/start", {}, 1000);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: "turn", status: "running", startedAt: 1000 });

    steps = applyStepEvent(steps, "turn/complete", {}, 1200);
    expect(steps[0]).toMatchObject({ type: "turn", status: "completed", endedAt: 1200, durationMs: 200 });
  });

  it("folds tool/call + tool/result into a completed tool step with input/output summaries", () => {
    let steps: TranscriptStep[] = [];
    steps = applyStepEvent(steps, "tool/call", { name: "read", arguments: { path: "C:\\tmp" } }, 2000);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: "tool", name: "read", status: "running", input: '{"path":"C:\\\\tmp"}' });

    steps = applyStepEvent(steps, "tool/result", { message: { content: [{ type: "text", text: "file contents" }] } }, 2350);
    expect(steps[0]).toMatchObject({ type: "tool", name: "read", status: "completed", output: "file contents", durationMs: 350 });
  });

  it("marks tool/result as failed when the result carries an error", () => {
    let steps: TranscriptStep[] = [];
    steps = applyStepEvent(steps, "tool/call", { name: "write", arguments: { path: "x" } }, 3000);
    steps = applyStepEvent(steps, "tool/result", { name: "write", error: { code: "EACCES" }, message: "denied" }, 3100);
    expect(steps[0]).toMatchObject({ type: "tool", name: "write", status: "failed", output: "denied", durationMs: 100 });
  });

  it("folds an orphan tool/result as a completed tool step instead of losing it", () => {
    let steps: TranscriptStep[] = [];
    steps = applyStepEvent(steps, "tool/result", { name: "read", message: "late result" }, 4000);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: "tool", name: "read", status: "completed", output: "late result" });
  });

  it("step/end closes the latest running step (tool or turn)", () => {
    let steps: TranscriptStep[] = [];
    steps = applyStepEvent(steps, "turn/start", {}, 5000);
    steps = applyStepEvent(steps, "tool/call", { name: "bash", arguments: { command: "ls" } }, 5100);
    steps = applyStepEvent(steps, "step/end", {}, 5200);
    expect(steps[1]).toMatchObject({ type: "tool", name: "bash", status: "completed", durationMs: 100 });
    expect(steps[0]?.status).toBe("running");
  });

  it("ignores unknown events and does not mutate the input array", () => {
    const steps: TranscriptStep[] = [];
    const next = applyStepEvent(steps, "user/message", { content: "hi" }, 6000);
    expect(next).not.toBe(steps);
    expect(next).toEqual(steps);
  });

  it("summarizeStepText truncates long content and returns undefined for empty values", () => {
    expect(summarizeStepText({ text: "hello" }, 10)).toBe("hello");
    expect(summarizeStepText("a".repeat(30), 10)).toBe(`${"a".repeat(10)}…`);
    expect(summarizeStepText("   ", 10)).toBeUndefined();
    expect(summarizeStepText(null, 10)).toBeUndefined();
  });
});
