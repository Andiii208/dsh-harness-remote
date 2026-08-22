/**
 * composerCommands — 聊天输入区 `/` 命令面板与队列编辑 payload 的纯函数。
 */

export interface ComposerCommand {
  id: "permission" | "queue" | "steer";
  label: string;
  hint: string;
}

/** `/` 面板命令：permission 依赖在线能力；queue/steer 始终可用。 */
export function availableCommands(online: boolean): ComposerCommand[] {
  const all: ComposerCommand[] = [
    { id: "permission", label: "/permission", hint: "切换会话权限" },
    { id: "queue", label: "/queue", hint: "消息进入队列模式" },
    { id: "steer", label: "/steer", hint: "消息使用 steer 模式" },
  ];
  return online ? all : all.filter((c) => c.id !== "permission");
}

export interface QueueEditAction {
  kind: "edit";
  content: Array<{ type: "text"; text: string }>;
}

/** session.updateQueue 的 edit 动作载荷（M8 伪编辑 → 真编辑）。 */
export function queueEditPayload(text: string): QueueEditAction {
  return { kind: "edit", content: [{ type: "text", text }] };
}
