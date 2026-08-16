/**
 * 本地通知（M1）— 分类器事件 → 通知参数映射 + 薄封装 expo-notifications。
 * 本模块零 expo 依赖：NotificationService 通过注入的 api 调用 expo-notifications，
 * 便于在 node 环境单测（注入桩）。
 */

import type { NotificationEvent } from "./classifier.js";

export interface NotificationParams {
  title: string;
  body: string;
  data: Record<string, string>;
}

const BODY_MAX = 60;

function truncate(s: string, max = BODY_MAX): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** 事件 → 通知参数（纯函数，零依赖）。 */
export function notificationParams(ev: NotificationEvent): NotificationParams {
  switch (ev.kind) {
    case "approval-waiting":
      return {
        title: "权限请求",
        body: truncate(ev.prompt ?? "有待审批的请求"),
        data: { kind: ev.kind, rpcId: ev.rpcId ?? "", route: `approval/${ev.rpcId ?? ""}` },
      };
    case "question-waiting":
      return {
        title: "提问",
        body: truncate(ev.prompt ?? "有待回答的问题"),
        data: { kind: ev.kind, rpcId: ev.rpcId ?? "", route: `approval/${ev.rpcId ?? ""}` },
      };
    case "turn-complete":
      return {
        title: "回合完成",
        body: truncate(`会话 ${ev.sessionId ?? ""} 完成一个回合`),
        data: { kind: ev.kind, sessionId: ev.sessionId ?? "", route: `chat/${ev.sessionId ?? ""}` },
      };
    case "goal-complete":
      return {
        title: "目标完成",
        body: truncate(`会话 ${ev.sessionId ?? ""} 的目标已完成`),
        data: { kind: ev.kind, sessionId: ev.sessionId ?? "", route: `chat/${ev.sessionId ?? ""}` },
      };
    case "goal-blocked":
      return {
        title: "目标受阻",
        body: truncate(`会话 ${ev.sessionId ?? ""} 的目标受阻，请关注`),
        data: { kind: ev.kind, sessionId: ev.sessionId ?? "", route: `chat/${ev.sessionId ?? ""}` },
      };
    default:
      return { title: "dsh-remote", body: "", data: {} };
  }
}

/** expo-notifications 最小表面（注入用）。 */
export interface NotificationsApi {
  requestPermissionsAsync(): Promise<{ status: string }>;
  setNotificationChannelAsync?(channelId: string, config: unknown): Promise<unknown>;
  scheduleNotificationAsync(config: unknown): Promise<string>;
  setNotificationHandler?(handler: unknown): void;
  /** 按 identifier 消除系统托盘通知（respond 后调用）。 */
  dismissNotificationAsync?(identifier: string): Promise<void>;
}

export const CHANNEL_ID = "dsh-events";

export class NotificationService {
  /** route → 最近一次通知 identifier（用于 respond 后消除）。 */
  private byRoute = new Map<string, string>();

  constructor(private readonly api: NotificationsApi) {}

  /** 请求权限；被拒返回 false，不抛错。 */
  async ensurePermissions(): Promise<boolean> {
    try {
      const res = await this.api.requestPermissionsAsync();
      return res.status === "granted";
    } catch (err) {
      console.warn("[notify] permission request failed", err);
      return false;
    }
  }

  /** 配置 Android 通知通道（幂等）；iOS 上该 API 会异步拒绝——吞掉。 */
  async configure(): Promise<void> {
    try {
      await this.api.setNotificationChannelAsync?.(CHANNEL_ID, {
        name: "会话事件",
        importance: 4,
        vibrationPattern: [0, 250, 250, 250],
      });
    } catch (err) {
      console.warn("[notify] channel setup failed", err);
    }
  }

  /** 前台也显示通知。 */
  setForegroundHandler(): void {
    try {
      this.api.setNotificationHandler?.({
        handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
      });
    } catch (err) {
      console.warn("[notify] handler setup failed", err);
    }
  }

  /** 立即弹一条本地通知；返回通知 identifier（无标题/空正文则跳过，返回 null）。 */
  async present(ev: NotificationEvent): Promise<string | null> {
    const p = notificationParams(ev);
    if (!p.title || !p.body) return null;
    try {
      const id = await this.api.scheduleNotificationAsync({
        content: {
          title: p.title,
          body: p.body,
          data: p.data,
          sound: false,
        },
        trigger: null, // 立即
      });
      if (p.data.route) this.byRoute.set(p.data.route, id);
      return id;
    } catch (err) {
      console.warn("[notify] present failed", err);
      return null;
    }
  }

  /** 消除某 route 的最近通知（respond/处理完成后调用）。 */
  async dismissByRoute(route: string): Promise<void> {
    const id = this.byRoute.get(route);
    if (!id) return;
    this.byRoute.delete(route);
    try {
      await this.api.dismissNotificationAsync?.(id);
    } catch (err) {
      console.warn("[notify] dismiss failed", err);
    }
  }
}
