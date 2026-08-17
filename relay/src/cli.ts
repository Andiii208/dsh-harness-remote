#!/usr/bin/env node
/**
 * relay CLI — start the M3.1 control-plane MVP.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { createRelayServer } from "./server.js";

const HELP = `relay — DSH relay control plane (M3.1 MVP)

Usage:
  relay [--port <n>] [--host <h>] [--store <sqlite-path>]

Options:
  --port <n>     listen port (default 4090)
  --host <h>     bind host (default 127.0.0.1)
  --store <path> persist registry/pairings to a SQLite file (default: in-memory)
  --help         show this help
`;

function parse(argv: string[]): { port: number; host: string; help: boolean; store?: string } {
  const out = { port: 4090, host: "127.0.0.1", help: false, store: undefined as string | undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--port") out.port = Number.parseInt(argv[++i] ?? "", 10);
    else if (a === "--host") out.host = argv[++i] ?? "127.0.0.1";
    else if (a === "--store") out.store = argv[++i];
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

  const serverOpts: Parameters<typeof createRelayServer>[0] = { host: opts.host };
  if (opts.store) {
    const { createSqliteRelayStore } = await import("./sqlite-store.js");
    serverOpts.store = createSqliteRelayStore(opts.store);
  }
  const relay = createRelayServer(serverOpts);
  await relay.start(opts.port);
  console.log(`relay listening on http://${opts.host}:${relay.port}`);
  console.log("logging: metadata only (no payload)");
  return 0;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

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
