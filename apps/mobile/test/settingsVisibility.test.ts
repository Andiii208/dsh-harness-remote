import { describe, expect, it } from "vitest";
import { modelsPermissionsVisible, pluginsRowVisible } from "../src/ui/settingsVisibility";

describe("pluginsRowVisible", () => {
  it("shows only after plugin list resolves with plugins", () => {
    expect(pluginsRowVisible(false, 0)).toBe(false);
    expect(pluginsRowVisible(true, 0)).toBe(false);
    expect(pluginsRowVisible(true, 3)).toBe(true);
  });
});

describe("modelsPermissionsVisible", () => {
  it("hides when offline or no data", () => {
    expect(modelsPermissionsVisible({ online: false, settingsInfoPresent: true, presetRead: true, presetCount: 1 })).toBe(false);
    expect(modelsPermissionsVisible({ online: true, settingsInfoPresent: false, presetRead: false, presetCount: 0 })).toBe(false);
    expect(modelsPermissionsVisible({ online: true, settingsInfoPresent: true, presetRead: false, presetCount: 0 })).toBe(true);
    expect(modelsPermissionsVisible({ online: true, settingsInfoPresent: false, presetRead: true, presetCount: 2 })).toBe(true);
  });
});
