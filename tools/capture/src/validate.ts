/** Fixture validation helpers (shared by CLI and tests). */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { validateFixtureSet } from "./fixture-format.js";

export interface FileValidation {
  file: string;
  ok: boolean;
  errors: string[];
}

/** Validate one fixture JSON file. */
export async function validateFixtureFile(file: string): Promise<FileValidation> {
  let parsed: unknown;
  try {
    const raw = await readFile(file, "utf8");
    parsed = JSON.parse(raw);
  } catch {
    return { file, ok: false, errors: ["invalid JSON or unreadable"] };
  }
  const result = validateFixtureSet(parsed);
  return result.ok
    ? { file, ok: true, errors: [] }
    : { file, ok: false, errors: result.errors };
}

/** Validate a file or a directory of *.fixture.json files. */
export async function validatePath(target: string): Promise<{
  ok: boolean;
  total: number;
  results: FileValidation[];
}> {
  const st = await stat(target);
  const files: string[] = [];
  if (st.isFile()) {
    files.push(target);
  } else {
    const entries = await readdir(target);
    for (const e of entries) {
      if (e.endsWith(".fixture.json") || e.endsWith(".json")) {
        files.push(join(target, e));
      }
    }
  }
  const results: FileValidation[] = [];
  for (const f of files.sort()) {
    results.push(await validateFixtureFile(f));
  }
  return { ok: results.every((r) => r.ok), total: results.length, results };
}
