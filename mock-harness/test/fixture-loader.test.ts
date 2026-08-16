import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { loadFixtureDir, loadFixtureFile, FixtureLoadError } from "../src/fixture-loader.js";
import { isStableFixture } from "../src/cli.js";

const fixturesDir = fileURLToPath(new URL("../fixtures", import.meta.url));

describe("fixture-loader", () => {
  it("loads and validates the built-in fixture directory", async () => {
    const sets = await loadFixtureDir(fixturesDir);
    expect(sets.length).toBeGreaterThanOrEqual(4);
    for (const s of sets) {
      expect(s.meta.baselineVersion).toBe("0.1.0-rc.5");
      expect(Array.isArray(s.unaryResponses)).toBe(true);
      expect(Array.isArray(s.wsFrames)).toBe(true);
    }
  });

  it("rejects invalid fixture files", async () => {
    await expect(loadFixtureFile("C:\\Windows\\does-not-exist.json")).rejects.toBeInstanceOf(
      FixtureLoadError,
    );
  });

  it("isStableFixture excludes scenario fixtures (disconnect.json)", async () => {
    const sets = await loadFixtureDir(fixturesDir);
    const disconnect = sets.find((f) => JSON.stringify(f).includes("drop-after"));
    const sessions = sets.find((f) => JSON.stringify(f).includes("session.list"));
    expect(disconnect).toBeDefined();
    expect(sessions).toBeDefined();
    expect(isStableFixture(disconnect!)).toBe(false);
    expect(isStableFixture(sessions!)).toBe(true);
  });
});
