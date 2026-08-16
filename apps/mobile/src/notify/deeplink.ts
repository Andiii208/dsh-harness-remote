/**
 * 通知点击 → 深链（M1-T1 闭环）。
 * 模块作用域注册 expo-notifications 响应监听：点击通知后按 data.route
 * 跳转（warm tap 与冷启动均可处理，冷启动依赖 expo 的初始响应投递）。
 * Expo Go 下完全跳过 expo-notifications（require 即致命错误）→ 深链禁用（不崩）。
 */

declare const require: (id: string) => unknown;

import { router, type Href } from "expo-router";
import { routeFromNotificationData } from "./route";
import { isExpoGo } from "./expoEnv";

interface NotificationResponseLike {
  notification: {
    request: {
      content: { data?: unknown };
    };
  };
}

interface NotificationsModule {
  addNotificationResponseReceivedListener?: (
    listener: (response: NotificationResponseLike) => void,
  ) => unknown;
}

function loadNotifications(): NotificationsModule | null {
  if (isExpoGo()) {
    console.warn("[notify] deep-link disabled in Expo Go (SDK 53+) — use a development build");
    return null;
  }
  try {
    return require("expo-notifications") as NotificationsModule;
  } catch (err) {
    console.warn("[notify] expo-notifications unavailable — deep-link disabled", err);
    return null;
  }
}

let registered = false;

/** 幂等注册响应监听。 */
export function registerNotificationDeepLink(): void {
  if (registered) return;
  registered = true;
  try {
    const mod = loadNotifications();
    if (!mod?.addNotificationResponseReceivedListener) {
      console.warn("[notify] deep-link disabled: expo-notifications unavailable");
      return;
    }
    mod.addNotificationResponseReceivedListener((response) => {
      const route = routeFromNotificationData(response.notification.request.content.data);
      if (route) router.push(`/${route}` as Href);
    });
  } catch (err) {
    console.warn("[notify] deep-link listener failed", err);
  }
}
