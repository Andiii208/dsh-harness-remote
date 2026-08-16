/**
 * keepaliveAdapter — expo-background-task 表面注入（App 运行时使用；
 * 测试直接测 keepalive.ts 的决策逻辑与注入桩）。
 * Expo Go 下 background-task/task-manager 不可用 → no-op 降级（不崩）。
 */

import { KEEPALIVE_TASK, type BackgroundTaskApi } from "./keepalive";
import { loadModule } from "./expoGuard";

function noopApi(): BackgroundTaskApi {
  return {
    defineTask: () => {},
    registerTaskAsync: async () => {},
    unregisterTaskAsync: async () => {},
  };
}

/** 可注入 loader 便于单测；默认走运行时 require。 */
export function createBackgroundTaskApi(
  load: (id: string) => unknown = loadModule,
): BackgroundTaskApi {
  const bg = load("expo-background-task") as
    | {
        registerTaskAsync?: (name: string, options: unknown) => Promise<void>;
        unregisterTaskAsync?: (name: string) => Promise<void>;
      }
    | null;
  const tm = load("expo-task-manager") as
    | { defineTask?: (name: string, task: unknown) => void }
    | null;
  if (!bg || !tm) {
    console.warn("[keepalive] expo-background-task unavailable — keepalive disabled (Expo Go)");
    return noopApi();
  }
  return {
    defineTask: (name, task) => tm.defineTask?.(name, task),
    registerTaskAsync: (name, options) =>
      bg.registerTaskAsync?.(name, options) ?? Promise.resolve(),
    unregisterTaskAsync: (name) => bg.unregisterTaskAsync?.(name) ?? Promise.resolve(),
  };
}

export const backgroundTaskApi = createBackgroundTaskApi();
export { KEEPALIVE_TASK };
