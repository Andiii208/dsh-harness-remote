/**
 * Server-initiated requests (approval / question) answered via
 * POST /api/respond with a client-response. Lenient payload shapes.
 */

export interface ApprovalPayload {
  /** Human-readable prompt for the approval. */
  prompt?: string;
  /** The command / tool invocation under approval, if any. */
  command?: string;
  permission?: string;
  raw: Record<string, unknown>;
}

export interface QuestionPayload {
  question?: string;
  options?: unknown[];
  raw: Record<string, unknown>;
}

export interface ServerRequestPayload {
  kind: "approval" | "question" | (string & {});
  payload?: unknown;
  raw: Record<string, unknown>;
}

export function readApprovalPayload(v: unknown): ApprovalPayload {
  const raw = (typeof v === "object" && v !== null && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  return {
    ...(typeof raw.prompt === "string" ? { prompt: raw.prompt } : {}),
    ...(typeof raw.command === "string" ? { command: raw.command } : {}),
    ...(typeof raw.permission === "string" ? { permission: raw.permission } : {}),
    raw,
  };
}

export function readQuestionPayload(v: unknown): QuestionPayload {
  const raw = (typeof v === "object" && v !== null && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  return {
    ...(typeof raw.question === "string" ? { question: raw.question } : {}),
    ...(Array.isArray(raw.options) ? { options: raw.options } : {}),
    raw,
  };
}
