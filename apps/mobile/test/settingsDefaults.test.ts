import { describe, expect, it } from "vitest";
import { defaultsFromHostSettings, defaultsFromSettingsNamespaces } from "../src/ui/settingsDefaults";

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

  it("maps real settings.describe namespaces to defaults view", () => {
    const view = defaultsFromSettingsNamespaces(
      [
        { ns: "agent-default-model", value: { provider: "p", model: "deepseek-v4-pro", reasoningEffort: "medium" }, revision: 3, applies: "live" },
        { ns: "llm-deepseek", value: { models: [{ id: "deepseek-v4-pro" }, { id: "deepseek-v4-flash" }] }, revision: 0, applies: "live" },
      ],
      true,
    );
    expect(view).toEqual({
      model: "deepseek-v4-pro",
      models: ["deepseek-v4-pro", "deepseek-v4-flash"],
      thinking: "medium",
      thinkingOptions: ["low", "medium", "high"],
      writable: true,
    });
  });

  it("hides defaults view when namespaces are missing", () => {
    expect(defaultsFromSettingsNamespaces(null, true)).toEqual({
      models: [],
      thinkingOptions: ["low", "medium", "high"],
      writable: true,
    });
  });
});
