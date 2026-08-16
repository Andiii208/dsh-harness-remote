/**
 * expoAdapter — expo-notifications 表面注入到 NotificationService 的单例。
 * Expo Go（SDK 53+）中该模块 require 即触发致命错误（绕过 try/catch），
 * 因此用 isExpoGo() 前置判断，Expo Go 下完全跳过加载 → no-op 降级。
 * 仅 App 运行时引用（测试直接测 notifications.ts 的纯逻辑与注入桩）。
 */

declare const require: (id: string) => unknown;

import { NotificationService, type NotificationsApi } from "./notifications";
import { isExpoGo } from "./expoEnv";

function loadNotifications(): unknown {
  if (isExpoGo()) {
    console.warn("[notify] expo-notifications disabled in Expo Go (SDK 53+) — use a development build");
    return null;
  }
  try {
    return require("expo-notifications");
  } catch (err) {
    console.warn("[notify] expo-notifications unavailable", err);
    return null;
  }
}

function noopApi(): NotificationsApi {
  return {
    requestPermissionsAsync: async () => ({ status: "denied" }),
    scheduleNotificationAsync: async () => "noop",
  };
}

/** 可注入 loader 便于单测；默认走 isExpoGo 守卫 + 静态 require。 */
export function createNotificationsService(
  load: () => unknown = loadNotifications,
): NotificationService {
  const mod = load() as NotificationsApi | null;
  if (!mod) {
    console.warn("[notify] expo-notifications unavailable — notifications disabled");
    return new NotificationService(noopApi());
  }
  const N = mod;
  const api: NotificationsApi = {
    requestPermissionsAsync: () => N.requestPermissionsAsync(),
    setNotificationChannelAsync: (id, config) =>
      N.setNotificationChannelAsync?.(id, config) ?? Promise.resolve(undefined),
    scheduleNotificationAsync: (config) => N.scheduleNotificationAsync(config),
    setNotificationHandler: (handler) => N.setNotificationHandler?.(handler),
    dismissNotificationAsync: (identifier) =>
      N.dismissNotificationAsync?.(identifier) ?? Promise.resolve(),
  };
  return new NotificationService(api);
}

export const notificationService = createNotificationsService();
