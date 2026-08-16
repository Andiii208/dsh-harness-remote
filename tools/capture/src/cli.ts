#!/usr/bin/env node
/**
 * dsh-capture CLI — record real DSH traffic into conformance fixtures,
 * validate existing fixtures.
 */

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { recordToFile } from "./record.js";
import { validatePath } from "./validate.js";

const HELP = `dsh-capture — record DSH traffic into conformance fixtures

Usage:
  dsh-capture record --host <h> --port <p> --out <dir> [--duration <sec>] [--probe <method>]...
  dsh-capture validate <path>            (file or directory of *.fixture.json)
  dsh-capture --help

Options:
  --host <h>        DSH host (default 127.0.0.1)
  --port <p>        DSH port (default 3080)
  --out <dir>       output directory for recorded fixtures (required for record)
  --duration <sec>  collection window in seconds (default 15)
  --probe <method>  unary method to probe (repeatable; default host.describe)
`;

interface CliArgs {
  command: "record" | "validate" | "help";
  flags: Map<string, string[]>;
  positional: string[];
}

/** Exported for tests. */
export function parseArgs(argv: string[]): CliArgs {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { command: "help", flags: new Map(), positional: [] };
  }
  const command = argv[0] === "record" || argv[0] === "validate" ? argv[0] : "help";
  const flags = new Map<string, string[]>();
  const positional: string[] = [];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const vals = flags.get(key) ?? [];
      if (i + 1 < argv.length && !(argv[i + 1] ?? "").startsWith("--")) {
        vals.push(argv[i + 1] ?? "");
        i++;
      } else if (key === "help") {
        return { command: "help", flags: new Map(), positional: [] };
      }
      flags.set(key, vals);
    } else {
      positional.push(a);
    }
  }
  return { command, flags, positional };
}

function last(flags: Map<string, string[]>, key: string, def: string): string {
  const v = flags.get(key);
  return v && v.length > 0 ? (v[v.length - 1] ?? def) : def;
}

async function main(argv: string[]): Promise<number> {
  const { command, flags, positional } = parseArgs(argv);
  if (command === "help") {
    console.log(HELP);
    return 0;
  }

  if (command === "record") {
    const host = last(flags, "host", "127.0.0.1");
    const port = Number.parseInt(last(flags, "port", "3080"), 10);
    const out = last(flags, "out", "");
    const duration = Number.parseInt(last(flags, "duration", "15"), 10);
    const probes = flags.get("probe") ?? [];
    if (!out) {
      console.error("record requires --out <dir>");
      return 2;
    }
    if (Number.isNaN(port) || Number.isNaN(duration) || duration <= 0) {
      console.error("invalid --port or --duration");
      return 2;
    }
    try {
      const result = await recordToFile(
        { host, port, durationMs: duration * 1000, probes },
        resolve(out),
      );
      console.log(`recorded ${result.frameCount} frames, ${result.probeCount} probes → ${result.file}`);
      return 0;
    } catch (err) {
      console.error(`capture failed: ${(err as Error).message}`);
      return 1;
    }
  }

  if (command === "validate") {
    const target = positional[0];
    if (!target) {
      console.error("validate requires a path");
      return 2;
    }
    try {
      const result = await validatePath(resolve(target));
      for (const r of result.results) {
        console.log(`${r.ok ? "✓" : "✗"} ${r.file}${r.ok ? "" : `: ${r.errors.join("; ")}`}`);
      }
      console.log(`\n${result.total} file(s), ${result.results.filter((r) => !r.ok).length} failed`);
      return result.ok ? 0 : 1;
    } catch (err) {
      console.error(`validate failed: ${(err as Error).message}`);
      return 1;
    }
  }

  console.error(HELP);
  return 2;
}

// Run only when executed directly (importing the module stays side-effect free).
const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(err);
      process.exitCode = 1;
    },
  );
}
