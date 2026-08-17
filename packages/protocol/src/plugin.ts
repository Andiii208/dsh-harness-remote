/**
 * Plugin capability contract (R2): the mobile app discovers user DSH plugins
 * through `plugin.list` and executes their commands through `plugin.exec`.
 *
 * The protocol is intentionally additive: existing unary RPC behavior does not
 * change. All readers are lenient — malformed payloads degrade to empty lists
 * instead of throwing, so a missing/old host never crashes the app.
 */

export type PluginArgType = "string" | "number" | "boolean";

export interface PluginArg {
  /** Stable arg name, sent inside plugin.exec args. */
  name: string;
  /** Human-readable label. */
  label?: string;
  type: PluginArgType;
  required?: boolean;
  default?: unknown;
  /** For select-style args. */
  options?: string[];
}

export type PluginRisk = "read" | "write" | "approve";

export interface PluginCommand {
  /** Stable command id, e.g. "my-plugin.commit". */
  id: string;
  pluginId: string;
  /** Short display title (Chinese/English). */
  title: string;
  description?: string;
  args?: PluginArg[];
  /** Permission level; `approve` commands go through the existing approval flow. */
  risk?: PluginRisk;
}

export interface PluginSetting {
  key: string;
  title: string;
  type: "switch" | "select" | "text" | "number";
  options?: string[];
  value: unknown;
  description?: string;
}

export interface PluginInfo {
  id: string;
  name: string;
  version?: string;
  description?: string;
  commands: PluginCommand[];
  settings: PluginSetting[];
}

/** `plugin.list` result. */
export interface PluginListResult {
  plugins: PluginInfo[];
  commands: PluginCommand[];
  settings: PluginSetting[];
}

/** `plugin.exec` request body. */
export interface PluginExecRequest {
  commandId: string;
  args?: Record<string, unknown>;
}

/** `plugin.exec` result. */
export interface PluginExecResult {
  rpcId: string;
  commandId: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

function readPluginArg(v: unknown): PluginArg | null {
  if (!isRecord(v)) return null;
  const name = str(v.name);
  if (!name) return null;
  const type = v.type === "string" || v.type === "number" || v.type === "boolean" ? v.type : "string";
  return {
    name,
    type,
    ...(str(v.label) !== undefined ? { label: str(v.label) } : {}),
    ...(bool(v.required) !== undefined ? { required: bool(v.required) } : {}),
    ...(v.default !== undefined ? { default: v.default } : {}),
    ...(Array.isArray(v.options) ? { options: v.options.filter((o): o is string => typeof o === "string") } : {}),
  };
}

function readPluginCommand(v: unknown): PluginCommand | null {
  if (!isRecord(v)) return null;
  const id = str(v.id);
  const pluginId = str(v.pluginId);
  if (!id || !pluginId) return null;
  const risk: PluginRisk | undefined =
    v.risk === "read" || v.risk === "write" || v.risk === "approve" ? v.risk : undefined;
  return {
    id,
    pluginId,
    title: str(v.title) ?? id,
    ...(str(v.description) !== undefined ? { description: str(v.description) } : {}),
    ...(risk !== undefined ? { risk } : {}),
    ...(Array.isArray(v.args)
      ? { args: v.args.map(readPluginArg).filter((a): a is PluginArg => a !== null) }
      : {}),
  };
}

function readPluginSetting(v: unknown): PluginSetting | null {
  if (!isRecord(v)) return null;
  const key = str(v.key);
  if (!key) return null;
  const type = v.type;
  if (type !== "switch" && type !== "select" && type !== "text" && type !== "number") return null;
  return {
    key,
    title: str(v.title) ?? key,
    type,
    value: v.value ?? null,
    ...(Array.isArray(v.options) ? { options: v.options.filter((o): o is string => typeof o === "string") } : {}),
    ...(str(v.description) !== undefined ? { description: str(v.description) } : {}),
  };
}

function readPluginInfo(v: unknown): PluginInfo | null {
  if (!isRecord(v)) return null;
  const id = str(v.id);
  if (!id) return null;
  return {
    id,
    name: str(v.name) ?? id,
    ...(str(v.version) !== undefined ? { version: str(v.version) } : {}),
    ...(str(v.description) !== undefined ? { description: str(v.description) } : {}),
    commands: Array.isArray(v.commands)
      ? v.commands.map(readPluginCommand).filter((c): c is PluginCommand => c !== null)
      : [],
    settings: Array.isArray(v.settings)
      ? v.settings.map(readPluginSetting).filter((s): s is PluginSetting => s !== null)
      : [],
  };
}

/** Lenient reader for `plugin.list` results: never throws, degrades to empty. */
export function readPluginList(v: unknown): PluginListResult {
  const plugins = isRecord(v) && Array.isArray(v.plugins)
    ? v.plugins.map(readPluginInfo).filter((p): p is PluginInfo => p !== null)
    : [];
  const commands = plugins.flatMap((p) => p.commands);
  const settings = plugins.flatMap((p) => p.settings);
  return { plugins, commands, settings };
}

/** Lenient reader for `plugin.exec` results. */
export function readPluginExec(v: unknown): PluginExecResult | null {
  if (!isRecord(v)) return null;
  const commandId = str(v.commandId);
  const rpcId = str(v.rpcId) ?? "";
  const ok = bool(v.ok);
  if (!commandId || ok === undefined) return null;
  return {
    rpcId,
    commandId,
    ok,
    ...(v.result !== undefined ? { result: v.result } : {}),
    ...(isRecord(v.error) ? { error: { code: str(v.error.code) ?? "UnknownError", message: str(v.error.message) ?? "unknown error" } } : {}),
  };
}
