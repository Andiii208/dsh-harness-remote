/**
 * 通知点击 → 深链（M1-T1 闭环）。
 * 模块作用域注册 expo-notifications 响应监听：点击通知后按 data.route
 * 跳转（warm tap 与冷启动均可处理，冷启动依赖 expo 的初始响应投递）。
 * 仅 App 运行时引用（route 解析纯函数在 route.ts，可单测）。
 */

import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { routeFromNotificationData } from "./route";

let registered = false;

/** 幂等注册响应监听。 */
export function registerNotificationDeepLink(): void {
  if (registered) return;
  registered = true;
  try {
    Notifications.addNotificationResponseReceivedListener((response) => {
      const route = routeFromNotificationData(response.notification.request.content.data);
      if (route) router.push(`/${route}`);
    });
  } catch (err) {
    console.warn("[notify] deep-link listener failed", err);
  }
}
