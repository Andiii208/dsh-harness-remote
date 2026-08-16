/**
 * 通知点击 → 深链（M1-T1 闭环）。
 * 模块作用域注册 expo-notifications 响应监听：点击通知后按 data.route
 * 跳转（warm tap 与冷启动均可处理，冷启动依赖 expo 的初始响应投递）。
 * Expo Go（SDK 53+）下 expo-notifications 不可用 → 深链监听禁用（不崩）。
 */

import { router, type Href } from "expo-router";
import { routeFromNotificationData } from "./route";
import { loadModule } from "./expoGuard";

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

let registered = false;

/** 幂等注册响应监听。 */
export function registerNotificationDeepLink(): void {
  if (registered) return;
  registered = true;
  try {
    const mod = loadModule("expo-notifications") as NotificationsModule | null;
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
