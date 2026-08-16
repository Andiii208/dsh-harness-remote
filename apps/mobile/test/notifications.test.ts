import { describe, expect, it, vi } from "vitest";
import {
  CHANNEL_ID,
  NotificationService,
  notificationParams,
  type NotificationsApi,
} from "../src/notify/notifications.js";
import type { NotificationEvent } from "../src/notify/classifier.js";

function ev(partial: Partial<NotificationEvent> & { kind: NotificationEvent["kind"] }): NotificationEvent {
  return { sessionId: "s1", dedupeKey: "k", ...partial };
}

describe("notificationParams", () => {
  it("maps approval-waiting with route", () => {
    const p = notificationParams(ev({ kind: "approval-waiting", rpcId: "r1", prompt: "允许执行 git push？" }));
    expect(p.title).toBe("权限请求");
    expect(p.body).toContain("git push");
    expect(p.data.route).toBe("approval/r1");
  });

  it("maps question-waiting", () => {
    const p = notificationParams(ev({ kind: "question-waiting", rpcId: "q1", prompt: "部署到生产？" }));
    expect(p.title).toBe("提问");
    expect(p.data.route).toBe("approval/q1");
  });

  it("maps turn/goal events to chat routes", () => {
    expect(notificationParams(ev({ kind: "turn-complete" })).data.route).toBe("chat/s1");
    expect(notificationParams(ev({ kind: "goal-complete" })).title).toBe("目标完成");
    expect(notificationParams(ev({ kind: "goal-blocked" })).title).toBe("目标受阻");
  });

  it("truncates long bodies", () => {
    const long = "x".repeat(200);
    const p = notificationParams(ev({ kind: "approval-waiting", rpcId: "r", prompt: long }));
    expect(p.body.length).toBeLessThanOrEqual(60);
    expect(p.body.endsWith("…")).toBe(true);
  });
});

describe("NotificationService (injected api)", () => {
  function stubApi(): NotificationsApi & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      async requestPermissionsAsync() {
        calls.push("permission");
        return { status: "granted" };
      },
      async setNotificationChannelAsync(id) {
        calls.push(`channel:${id}`);
      },
      async scheduleNotificationAsync(config) {
        calls.push(`schedule:${JSON.stringify(config)}`);
        return "id-1";
      },
      setNotificationHandler() {
        calls.push("handler");
      },
      async dismissNotificationAsync(id) {
        calls.push(`dismiss:${id}`);
      },
    };
  }

  it("ensurePermissions returns true when granted", async () => {
    const api = stubApi();
    const svc = new NotificationService(api);
    expect(await svc.ensurePermissions()).toBe(true);
    expect(api.calls).toContain("permission");
  });

  it("ensurePermissions returns false (no throw) when denied", async () => {
    const api: NotificationsApi = {
      async requestPermissionsAsync() {
        return { status: "denied" };
      },
      async scheduleNotificationAsync() {
        return "";
      },
    };
    const svc = new NotificationService(api);
    expect(await svc.ensurePermissions()).toBe(false);
  });

  it("ensurePermissions returns false (no throw) on api failure", async () => {
    const api: NotificationsApi = {
      async requestPermissionsAsync() {
        throw new Error("native not available");
      },
      async scheduleNotificationAsync() {
        return "";
      },
    };
    const svc = new NotificationService(api);
    expect(await svc.ensurePermissions()).toBe(false);
  });

  it("configure sets the channel", async () => {
    const api = stubApi();
    new NotificationService(api).configure();
    expect(api.calls).toContain(`channel:${CHANNEL_ID}`);
  });

  it("present schedules an immediate notification and returns its id", async () => {
    const api = stubApi();
    const id = await new NotificationService(api).present(
      ev({ kind: "approval-waiting", rpcId: "r9", prompt: "run?" }),
    );
    expect(id).toBe("id-1");
    const call = api.calls.find((c) => c.startsWith("schedule:")) ?? "";
    expect(call).toContain('"rpcId":"r9"');
    expect(call).toContain('"trigger":null');
  });

  it("present skips empty-body notifications (no schedule call)", async () => {
    const api = stubApi();
    const svc = new NotificationService(api);
    // 未知 kind → default 分支：title 有值但 body 为空 → 跳过
    const id = await svc.present({ kind: "weird" } as unknown as NotificationEvent);
    expect(id).toBeNull();
    expect(api.calls.some((c) => c.startsWith("schedule:"))).toBe(false);
  });

  it("dismissByRoute dismisses the latest notification for that route", async () => {
    const api = stubApi();
    const svc = new NotificationService(api);
    await svc.present(ev({ kind: "approval-waiting", rpcId: "r9", prompt: "run?" }));
    await svc.dismissByRoute("approval/r9");
    expect(api.calls).toContain("dismiss:id-1");
    // 再次消除为 no-op
    await svc.dismissByRoute("approval/r9");
    expect(api.calls.filter((c) => c.startsWith("dismiss:"))).toHaveLength(1);
  });

  it("present never throws", async () => {
    const api: NotificationsApi = {
      async requestPermissionsAsync() {
        return { status: "granted" };
      },
      async scheduleNotificationAsync() {
        throw new Error("boom");
      },
    };
    const svc = new NotificationService(api);
    await expect(svc.present(ev({ kind: "turn-complete" }))).resolves.toBeNull();
  });
});
