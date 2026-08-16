import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli.js";
import { validateFixtureFile, validatePath } from "../src/validate.js";
import { serializeFixture, type FixtureSet } from "../src/fixture-format.js";

const valid: FixtureSet = {
  meta: { baselineVersion: "0.1.0-rc.5", recordedAt: "2026-08-16T00:00:00.000Z" },
  unaryResponses: [{ method: "host.describe", response: { ok: true, result: {} } }],
  wsFrames: [{ stream: "mux", frame: { type: "session/event" } }],
};

let dirs: string[] = [];
async function tmpDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "dsh-capture-test-"));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  dirs = [];
});

describe("parseArgs", () => {
  it("parses record flags", () => {
    const a = parseArgs(["record", "--host", "1.2.3.4", "--port", "9999", "--out", "out", "--duration", "5", "--probe", "host.describe"]);
    expect(a.command).toBe("record");
    expect(a.flags.get("host")).toEqual(["1.2.3.4"]);
    expect(a.flags.get("port")).toEqual(["9999"]);
    expect(a.flags.get("probe")).toEqual(["host.describe"]);
  });

  it("handles --help", () => {
    expect(parseArgs(["--help"]).command).toBe("help");
    expect(parseArgs([]).command).toBe("help");
  });

  it("parses validate positional", () => {
    const a = parseArgs(["validate", "some/path"]);
    expect(a.command).toBe("validate");
    expect(a.positional).toEqual(["some/path"]);
  });
});

describe("validateFixtureFile / validatePath", () => {
  it("validates a single valid file", async () => {
    const dir = await tmpDir();
    const f = join(dir, "a.fixture.json");
    await writeFile(f, serializeFixture(valid), "utf8");
    expect((await validateFixtureFile(f)).ok).toBe(true);
    expect((await validatePath(f)).ok).toBe(true);
  });

  it("flags an invalid file with errors", async () => {
    const dir = await tmpDir();
    const f = join(dir, "bad.fixture.json");
    await writeFile(f, JSON.stringify({ meta: {}, unaryResponses: [], wsFrames: [] }), "utf8");
    const r = await validateFixtureFile(f);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("baselineVersion");
  });

  it("validates a directory and reports totals", async () => {
    const dir = await tmpDir();
    await writeFile(join(dir, "ok.fixture.json"), serializeFixture(valid), "utf8");
    await writeFile(join(dir, "bad.json"), "not json", "utf8");
    const r = await validatePath(dir);
    expect(r.total).toBe(2);
    expect(r.ok).toBe(false);
    expect(r.results.filter((x) => x.ok)).toHaveLength(1);
  });
});
