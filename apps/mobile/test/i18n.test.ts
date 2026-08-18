import { describe, expect, it } from "vitest";
import { en, zhCN } from "../src/i18n/translations";

function keysOf(obj: unknown, prefix = ""): string[] {
  if (!obj || typeof obj !== "object") return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    keysOf(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe("i18n translations", () => {
  it("zh-CN and en have identical key sets", () => {
    expect(keysOf(zhCN).sort()).toEqual(keysOf(en).sort());
  });

  it("covers onboarding and connect sections", () => {
    expect(zhCN.onboarding.step1Title.length).toBeGreaterThan(0);
    expect(en.connect.scanConnect.length).toBeGreaterThan(0);
  });
});
