/**
 * keepaliveAdapter — expo-background-task 表面注入（App 运行时使用；
 * 测试直接测 keepalive.ts 的决策逻辑与注入桩）。
 * Expo Go 下 background-task/task-manager require 即致命错误 → 完全跳过，no-op 降级。
 */

declare const require: (id: string) => unknown;

import { KEEPALIVE_TASK, type BackgroundTaskApi } from "./keepalive";
import { isExpoGo } from "./expoEnv";

export interface NativeBackgroundModules {
  bg: unknown;
  tm: unknown;
}

function loadModules(): NativeBackgroundModules {
  if (isExpoGo()) {
    console.warn("[keepalive] background task disabled in Expo Go (SDK 53+) — use a development build");
    return { bg: null, tm: null };
  }
  let bg: unknown = null;
  let tm: unknown = null;
  try {
    bg = require("expo-background-task");
  } catch (err) {
    console.warn("[keepalive] expo-background-task unavailable", err);
  }
  try {
    tm = require("expo-task-manager");
  } catch (err) {
    console.warn("[keepalive] expo-task-manager unavailable", err);
  }
  return { bg, tm };
}

function noopApi(): BackgroundTaskApi {
  return {
    defineTask: () => {},
    registerTaskAsync: async () => {},
    unregisterTaskAsync: async () => {},
  };
}

/** 可注入 loader 便于单测；默认走 isExpoGo 守卫 + 静态 require。 */
export function createBackgroundTaskApi(
  load: () => NativeBackgroundModules = loadModules,
): BackgroundTaskApi {
  const { bg, tm } = load();
  if (!bg || !tm) {
    console.warn("[keepalive] expo-background-task unavailable — keepalive disabled (Expo Go)");
    return noopApi();
  }
  const B = bg as { registerTaskAsync?: (name: string, options: unknown) => Promise<void>; unregisterTaskAsync?: (name: string) => Promise<void> };
  const T = tm as { defineTask?: (name: string, task: unknown) => void };
  return {
    defineTask: (name, task) => T.defineTask?.(name, task),
    registerTaskAsync: (name, options) => B.registerTaskAsync?.(name, options) ?? Promise.resolve(),
    unregisterTaskAsync: (name) => B.unregisterTaskAsync?.(name) ?? Promise.resolve(),
  };
}

export const backgroundTaskApi = createBackgroundTaskApi();
export { KEEPALIVE_TASK };
