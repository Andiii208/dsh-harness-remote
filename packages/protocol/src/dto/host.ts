/**
 * host.describe result (baseline rc.5). Lenient: unknown capability fields
 * pass through; `raw` keeps the full original for debugging.
 */

export interface HostDescribe {
  name?: string;
  version?: string;
  /** Free-form capability map; unknown keys preserved. */
  capabilities?: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export function readHostDescribe(v: unknown): HostDescribe {
  const raw = (typeof v === "object" && v !== null && !Array.isArray(v)
    ? v
    : {}) as Record<string, unknown>;
  return {
    ...(typeof raw.name === "string" ? { name: raw.name } : {}),
    ...(typeof raw.version === "string" ? { version: raw.version } : {}),
    ...(typeof raw.capabilities === "object" && raw.capabilities !== null
      ? { capabilities: raw.capabilities as Record<string, unknown> }
      : {}),
    raw,
  };
}
