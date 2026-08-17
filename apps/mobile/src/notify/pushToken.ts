/**
 * pushToken — Expo push token 获取（M3.3 上报给 relay 用）。
 *
 * 与 expoAdapter / keepaliveAdapter 同一套守卫风格：
 * - Expo Go 下完全跳过 expo-notifications（require 即可能致命错误）；
 * - Web / 模块不可用 / 获取失败 / 超时 一律降级为 null，绝不 throw。
 */

declare const require: (id: string) => unknown;

import { isExpoGo } from "./expoEnv";

export const DEFAULT_PUSH_TOKEN_TIMEOUT_MS = 2_000;

interface ExpoPushTokenModule {
  getExpoPushTokenAsync?: (opts?: unknown) => Promise<unknown>;
}

function loadExpoNotifications(): unknown {
  if (isExpoGo()) {
    console.warn("[notify] expo push token disabled in Expo Go (SDK 53+) — use a development build");
    return null;
  }
  try {
    return require("expo-notifications");
  } catch (err) {
    console.warn("[notify] expo-notifications unavailable for push token", err);
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Expo push token request timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * 获取 Expo push token；失败/超时/Expo Go/Web 下降级为 null。
 * 可注入 loader 与 timeoutMs 便于单测。
 */
export async function getExpoPushToken(
  load: () => unknown = loadExpoNotifications,
  timeoutMs: number = DEFAULT_PUSH_TOKEN_TIMEOUT_MS,
): Promise<string | null> {
  let mod: unknown;
  try {
    mod = load();
  } catch (err) {
    console.warn("[notify] expo-notifications load failed for push token", err);
    return null;
  }
  if (!mod) {
    console.warn("[notify] expo push token unavailable — push notifications disabled");
    return null;
  }

  const getter = (mod as ExpoPushTokenModule).getExpoPushTokenAsync;
  if (typeof getter !== "function") {
    console.warn("[notify] getExpoPushTokenAsync unavailable");
    return null;
  }

  try {
    const result = getter.call(mod) as unknown;
    const promise = result instanceof Promise ? result : Promise.resolve(result);
    const token = await withTimeout(promise, timeoutMs);
    if (typeof token === "string") return token;
    if (
      token &&
      typeof token === "object" &&
      typeof (token as { data?: unknown }).data === "string"
    ) {
      return (token as { data: string }).data;
    }
    console.warn("[notify] getExpoPushTokenAsync returned no token data");
    return null;
  } catch (err) {
    console.warn("[notify] getExpoPushTokenAsync failed", err);
    return null;
  }
}
