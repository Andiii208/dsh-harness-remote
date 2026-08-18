/**
 * host.settings.get / host.settings.set contract (R3).
 *
 * Capability-detectable: when a host does not implement these RPCs the app
 * simply hides the group. Readers are lenient — missing/optional fields are
 * omitted so the UI can render partial payloads without crashing.
 */

export interface HostSettings {
  /** Current model id. */
  model?: string;
  /** Selectable model list. */
  models?: string[];
  /** Thinking strength. Values are host-defined; common: "low" | "medium" | "high". */
  thinking?: string;
  /** Context usage percentage (0-100). */
  contextPercent?: number;
  /** Context window limit (token count, host unit). */
  contextLimit?: number;
  /** Permission status descriptors for the approval flow. */
  permissions?: {
    mode?: "readonly" | "approve" | "auto";
    description?: string;
  };
  /** True when the host accepts host.settings.set. */
  writable?: boolean;
}

export interface HostSettingsPatch {
  model?: string;
  thinking?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function bool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

/** Lenient reader for host.settings.get payloads. Never throws. */
export function readHostSettings(v: unknown): HostSettings {
  if (!isRecord(v)) return {};
  const out: HostSettings = {
    ...(str(v.model) !== undefined ? { model: str(v.model) } : {}),
    ...(Array.isArray(v.models) ? { models: v.models.filter((m): m is string => typeof m === "string") } : {}),
    ...(str(v.thinking) !== undefined ? { thinking: str(v.thinking) } : {}),
    ...(num(v.contextPercent) !== undefined ? { contextPercent: num(v.contextPercent) } : {}),
    ...(num(v.contextLimit) !== undefined ? { contextLimit: num(v.contextLimit) } : {}),
    ...(bool(v.writable) !== undefined ? { writable: bool(v.writable) } : {}),
  };
  if (isRecord(v.permissions)) {
    const mode =
      v.permissions.mode === "readonly" || v.permissions.mode === "approve" || v.permissions.mode === "auto"
        ? v.permissions.mode
        : undefined;
    out.permissions = {
      ...(mode !== undefined ? { mode } : {}),
      ...(str(v.permissions.description) !== undefined ? { description: str(v.permissions.description) } : {}),
    };
  }
  return out;
}
