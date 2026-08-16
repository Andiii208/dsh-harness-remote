/**
 * expoAdapter — expo-notifications 表面注入到 NotificationService 的单例。
 * 运行时安全加载：Expo Go（SDK 53+）中该模块 import 即抛错，此时降级为
 * no-op（通知禁用），development build 下正常工作。仅 App 运行时引用
 * （测试直接测 notifications.ts 的纯逻辑与注入桩）。
 */

import { NotificationService, type NotificationsApi } from "./notifications";
import { loadModule } from "./expoGuard";

function noopApi(): NotificationsApi {
  return {
    requestPermissionsAsync: async () => ({ status: "denied" }),
    scheduleNotificationAsync: async () => "noop",
  };
}

/** 可注入 loader 便于单测；默认走运行时 require。 */
export function createNotificationsService(
  load: (id: string) => unknown = loadModule,
): NotificationService {
  const mod = load("expo-notifications") as NotificationsApi | null;
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
