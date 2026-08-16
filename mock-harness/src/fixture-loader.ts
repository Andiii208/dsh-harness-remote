/**
 * fixture-loader — load fixture files/dirs into FixtureSet objects using
 * @dsh-remote/capture's lenient validation.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateFixtureSet, type FixtureSet } from "@dsh-remote/capture";

export class FixtureLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureLoadError";
  }
}

/** Load one fixture JSON file (validated). */
export async function loadFixtureFile(file: string): Promise<FixtureSet> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    throw new FixtureLoadError(`cannot read ${file}: ${(err as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FixtureLoadError(`${file}: invalid JSON`);
  }
  const result = validateFixtureSet(parsed);
  if (!result.ok) {
    throw new FixtureLoadError(`${file}: ${result.errors.join("; ")}`);
  }
  return result.fixture;
}

/** Load every *.fixture.json / *.json file in a directory (sorted). */
export async function loadFixtureDir(dir: string): Promise<FixtureSet[]> {
  const entries = await readdir(dir);
  const files = entries
    .filter((e) => e.endsWith(".fixture.json") || e.endsWith(".json"))
    .sort();
  const out: FixtureSet[] = [];
  const errors: string[] = [];
  for (const f of files) {
    try {
      out.push(await loadFixtureFile(join(dir, f)));
    } catch (err) {
      errors.push((err as Error).message);
    }
  }
  if (errors.length > 0 && out.length === 0) {
    throw new FixtureLoadError(errors.join("\n"));
  }
  return out;
}

/** Load a file or a directory. */
export async function loadFixtures(path: string): Promise<FixtureSet[]> {
  if (path.endsWith(".json")) return [await loadFixtureFile(path)];
  return loadFixtureDir(path);
}
