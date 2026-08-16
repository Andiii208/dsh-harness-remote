/**
 * expoEnv — 运行时检测当前是否运行在 Expo Go（storeClient）。
 * Expo Go（SDK 53+）下 expo-notifications / expo-background-task 等模块
 * 一旦 require 即触发致命错误（绕过 try/catch），必须完全跳过加载。
 */

declare const require: (id: string) => unknown;

/** 是否运行在 Expo Go（而非 development/production build）。 */
export function isExpoGo(): boolean {
  try {
    const mod = require("expo-constants") as {
      default?: { executionEnvironment?: string };
      executionEnvironment?: string;
    };
    const env = (mod.default ?? mod).executionEnvironment;
    return env === "storeClient";
  } catch {
    return false;
  }
}
