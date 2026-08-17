/**
 * plugin-catalog.ts — R2 reference implementation of the DSH plugin
 * capability face for mobile.
 *
 * Real host seam: when DSH exposes a plugin registry API, the host adapter
 * should feed registered plugin commands/settings into `createPluginCatalog`.
 * Until then this module falls back to a local manifest directory (JSON files
 * named `<pluginId>.plugin.json`) or to a small built-in default manifest, so
 * the mobile app always has a stable contract to render against.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  PluginCommand,
  PluginExecResult,
  PluginInfo,
  PluginListResult,
} from "@dsh-remote/protocol";
import { readPluginList } from "@dsh-remote/protocol";

export const DEFAULT_PLUGIN_CATALOG: PluginInfo[] = [
  {
    id: "dsh-remote",
    name: "dsh-remote",
    version: "0.1.0",
    description: "手机视口基础能力（参考实现）",
    commands: [
      {
        id: "dsh-remote.ping",
        pluginId: "dsh-remote",
        title: "Ping 宿主",
        description: "返回宿主在线状态与当前时间",
        risk: "read",
      },
      {
        id: "dsh-remote.echo",
        pluginId: "dsh-remote",
        title: "回显文本",
        description: "把参数原样返回（用于联调）",
        risk: "read",
        args: [{ name: "text", label: "文本", type: "string", required: true }],
      },
    ],
    settings: [
      {
        key: "dsh-remote.notifyLevel",
        title: "通知级别",
        type: "select",
        options: ["off", "errors", "all"],
        value: "errors",
        description: "控制手机端收到的系统通知级别",
      },
    ],
  },
];

export interface PluginCatalogOptions {
  /** Local manifest directory; files named `<pluginId>.plugin.json`. */
  manifestDir?: string;
  /** Pre-built manifests (host seam). Takes precedence over manifestDir. */
  manifests?: PluginInfo[];
}

export interface PluginCatalog {
  list(): PluginListResult;
  commands(): PluginCommand[];
  exec(commandId: string, args?: Record<string, unknown>): Promise<PluginExecResult>;
}

function normalizeManifestList(input: unknown): PluginInfo[] {
  const list = readPluginList(input);
  return list.plugins;
}

async function loadManifestDir(dir: string): Promise<PluginInfo[]> {
  const entries = await readdir(dir);
  const files = entries.filter((e) => e.endsWith(".plugin.json")).sort();
  const out: PluginInfo[] = [];
  for (const file of files) {
    try {
      const raw = await readFile(join(dir, file), "utf8");
      const parsed: unknown = JSON.parse(raw);
      out.push(...normalizeManifestList(parsed));
    } catch {
      // Manifest 损坏/无法读取时跳过，不阻断其他插件。
    }
  }
  return out;
}

export async function createPluginCatalog(
  opts: PluginCatalogOptions = {},
): Promise<PluginCatalog> {
  let plugins: PluginInfo[];
  if (opts.manifests && opts.manifests.length > 0) {
    plugins = opts.manifests;
  } else if (opts.manifestDir) {
    plugins = await loadManifestDir(opts.manifestDir);
  } else {
    plugins = DEFAULT_PLUGIN_CATALOG;
  }

  const commands = plugins.flatMap((p) => p.commands);

  return {
    list(): PluginListResult {
      return {
        plugins,
        commands,
        settings: plugins.flatMap((p) => p.settings),
      };
    },
    commands(): PluginCommand[] {
      return commands;
    },
    async exec(commandId, args = {}): Promise<PluginExecResult> {
      const command = commands.find((c) => c.id === commandId);
      if (!command) {
        return {
          rpcId: "",
          commandId,
          ok: false,
          error: { code: "NOT_FOUND", message: `unknown plugin command ${commandId}` },
        };
      }
      if (command.id === "dsh-remote.ping") {
        return {
          rpcId: "",
          commandId,
          ok: true,
          result: { pong: true, now: Date.now() },
        };
      }
      if (command.id === "dsh-remote.echo") {
        return {
          rpcId: "",
          commandId,
          ok: true,
          result: { echo: args.text ?? "", receivedArgs: args },
        };
      }
      return {
        rpcId: "",
        commandId,
        ok: true,
        result: { ok: true, commandId, args },
      };
    },
  };
}
