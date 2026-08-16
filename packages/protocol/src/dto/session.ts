/**
 * Session domain DTOs: transcript events (turn/step/message/tool nodes,
 * streaming chunks, interruption/gap markers) and session/projection frames
 * (permissions, stats, token usage, context pressure, goal, todos, plan,
 * title). All lenient — fields we cannot yet type stay `unknown` and the
 * original payload is preserved in `raw`.
 */

export type MessageRole = "user" | "assistant" | "tool" | "system";

export interface MessageNode {
  id?: string;
  role?: MessageRole;
  content?: unknown;
  /** Streaming partial chunk (assistant). */
  delta?: unknown;
  done?: boolean;
  /** Set when the assistant turn was interrupted. */
  interrupted?: boolean;
  raw: Record<string, unknown>;
}

export interface ToolNode {
  id?: string;
  name?: string;
  args?: unknown;
  result?: unknown;
  status?: "running" | "ok" | "error";
  raw: Record<string, unknown>;
}

export interface StepNode {
  id?: string;
  kind?: string;
  messages?: MessageNode[];
  tools?: ToolNode[];
  raw: Record<string, unknown>;
}

export interface TurnNode {
  id?: string;
  steps?: StepNode[];
  /** Gap marker: transcript has missing events. */
  gap?: boolean;
  raw: Record<string, unknown>;
}

/** session/event frame. */
export interface SessionEvent {
  type: "session/event";
  sessionId?: string;
  event?: "turn/start" | "step/start" | "message/delta" | "message/complete" | "turn/complete" | "interrupted";
  turn?: TurnNode;
  message?: MessageNode;
  raw: Record<string, unknown>;
}

export interface TokenUsage {
  input?: number;
  output?: number;
  total?: number;
}

export interface SessionStats {
  turns?: number;
  messages?: number;
}

export interface ContextPressure {
  percent?: number;
  level?: "low" | "medium" | "high" | "critical";
}

export interface GoalState {
  id?: string;
  objective?: string;
  status?: "active" | "paused" | "blocked" | "complete";
}

export interface TodoItem {
  content?: string;
  status?: "pending" | "in_progress" | "completed";
}

export interface SessionProjection {
  type: "session/projection";
  sessionId?: string;
  permissions?: unknown;
  sessionStats?: SessionStats;
  tokenUsage?: TokenUsage;
  contextPressure?: ContextPressure;
  goal?: GoalState;
  todos?: TodoItem[];
  plan?: unknown;
  title?: string;
  raw: Record<string, unknown>;
}

/** session/registry frame (events.host stream). */
export interface SessionRegistryEvent {
  type: "session/registry";
  action?: "added" | "updated" | "removed";
  sessionId?: string;
  workspace?: string;
  title?: string;
  raw: Record<string, unknown>;
}
