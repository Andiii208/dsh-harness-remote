import { describe, expect, it } from "vitest";
import { readHostSettings } from "../src/host-settings.js";

describe("readHostSettings", () => {
  it("reads full host.settings.get payload", () => {
    const s = readHostSettings({
      model: "deepseek-v4",
      models: ["deepseek-v4", "deepseek-v3"],
      thinking: "high",
      contextPercent: 42,
      contextLimit: 128_000,
      permissions: { mode: "approve", description: "shell commands require approval" },
      writable: true,
    });
    expect(s).toEqual({
      model: "deepseek-v4",
      models: ["deepseek-v4", "deepseek-v3"],
      thinking: "high",
      contextPercent: 42,
      contextLimit: 128_000,
      permissions: { mode: "approve", description: "shell commands require approval" },
      writable: true,
    });
  });

  it("degrades to empty object on malformed payloads", () => {
    expect(readHostSettings(undefined)).toEqual({});
    expect(readHostSettings("x")).toEqual({});
    expect(readHostSettings({ model: 1, models: "bad", permissions: "bad" })).toEqual({});
  });

  it("keeps partial payloads (capability-detectable rendering)", () => {
    expect(readHostSettings({ model: "m1" })).toEqual({ model: "m1" });
    expect(readHostSettings({ contextPercent: 80 })).toEqual({ contextPercent: 80 });
  });
});
