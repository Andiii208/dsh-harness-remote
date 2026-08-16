/**
 * expoAdapter — expo-notifications 表面注入到 NotificationService 的单例。
 * 仅 App 运行时引用（测试直接测 notifications.ts 的纯逻辑与注入桩）。
 */

import * as Notifications from "expo-notifications";
import { NotificationService, type NotificationsApi } from "./notifications.js";

const api: NotificationsApi = {
  requestPermissionsAsync: () => Notifications.requestPermissionsAsync(),
  setNotificationChannelAsync: (id, config) =>
    Notifications.setNotificationChannelAsync(id, config as never),
  scheduleNotificationAsync: (config) =>
    Notifications.scheduleNotificationAsync(config as never),
  setNotificationHandler: (handler) => Notifications.setNotificationHandler(handler as never),
  dismissNotificationAsync: (identifier) => Notifications.dismissNotificationAsync(identifier),
};

export const notificationService = new NotificationService(api);
