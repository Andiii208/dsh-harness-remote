import { describe, expect, it } from "vitest";
import { defaultsFromHostSettings } from "../src/ui/settingsDefaults";

describe("settingsDefaults", () => {
  it("maps null host settings to an empty hidden view", () => {
    expect(defaultsFromHostSettings(null)).toEqual({
      models: [],
      thinkingOptions: ["low", "medium", "high"],
      writable: false,
    });
  });

  it("maps model/models/thinking and honours writable flag", () => {
    expect(
      defaultsFromHostSettings({
        model: "deepseek-v4",
        models: ["deepseek-v4", "deepseek-v4-flash"],
        thinking: "medium",
        writable: true,
      }),
    ).toEqual({
      model: "deepseek-v4",
      models: ["deepseek-v4", "deepseek-v4-flash"],
      thinking: "medium",
      thinkingOptions: ["low", "medium", "high"],
      writable: true,
    });
  });

  it("treats missing or false writable as not writable", () => {
    expect(defaultsFromHostSettings({ model: "m1", writable: false }).writable).toBe(false);
    expect(defaultsFromHostSettings({ model: "m1" }).writable).toBe(false);
  });
});
