#!/usr/bin/env node
/**
 * mock-harness CLI — start the DSH fixture-replaying stub server.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { createMockHarness } from "./index.js";
import { loadFixtures } from "./fixture-loader.js";

const HELP = `mock-harness — DSH /api + WS test stub (replays conformance fixtures)

Usage:
  mock-harness [--port <n>] [--host <h>] [--fixtures <file|dir>]

Options:
  --port <n>      listen port (default 3080)
  --host <h>      bind host (default 127.0.0.1)
  --fixtures <p>  fixture file or directory (default: built-in samples)
  --help          show this help
`;

function parse(argv: string[]): { port: number; host: string; fixtures: string | null; help: boolean } {
  const out = { port: 3080, host: "127.0.0.1", fixtures: null as string | null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--port") out.port = Number.parseInt(argv[++i] ?? "", 10);
    else if (a === "--host") out.host = argv[++i] ?? "127.0.0.1";
    else if (a === "--fixtures") out.fixtures = argv[++i] ?? null;
  }
  return out;
}

async function main(argv: string[]): Promise<number> {
  const opts = parse(argv);
  if (opts.help) {
    console.log(HELP);
    return 0;
  }
  if (Number.isNaN(opts.port) || opts.port < 0 || opts.port > 65535) {
    console.error("invalid --port");
    return 2;
  }

  const fixturePath =
    opts.fixtures ?? fileURLToPath(new URL("../fixtures", import.meta.url));
  let fixtures;
  try {
    fixtures = await loadFixtures(fixturePath);
  } catch (err) {
    console.error(`fixture load failed: ${(err as Error).message}`);
    return 1;
  }

  const harness = await createMockHarness({ fixtures, host: opts.host, port: opts.port });
  console.log(
    `mock-harness ready on ${harness.url} (${fixtures.length} fixture set(s), ${fixtures.reduce(
      (n, f) => n + f.wsFrames.length,
      0,
    )} ws frames)`,
  );
  return 0;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

// Keep the process alive; exit codes handled by caller when run as a service.
if (isMain) {
  void main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(err);
      process.exitCode = 1;
    },
  );
}
