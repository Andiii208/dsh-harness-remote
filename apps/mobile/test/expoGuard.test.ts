import { describe, expect, it } from "vitest";
import { createNotificationsService } from "../src/notify/expoAdapter";
import { createBackgroundTaskApi } from "../src/notify/keepaliveAdapter";

describe("native module fallbacks (Expo Go SDK 53+)", () => {
  it("notification service degrades to no-op when expo-notifications cannot load", async () => {
    const svc = createNotificationsService(() => null);
    await expect(svc.ensurePermissions()).resolves.toBe(false);
    await expect(
      svc.present({ kind: "turn-complete", sessionId: "s1", dedupeKey: "k" }),
    ).resolves.toBe("noop");
  });

  it("notification service uses the real module when available", async () => {
    const fake = {
      requestPermissionsAsync: async () => ({ status: "granted" }),
      scheduleNotificationAsync: async () => "id-1",
      setNotificationChannelAsync: async () => undefined,
    };
    const svc = createNotificationsService(() => fake);
    await expect(svc.ensurePermissions()).resolves.toBe(true);
    await expect(
      svc.present({ kind: "goal-complete", sessionId: "s1", dedupeKey: "k" }),
    ).resolves.toBe("id-1");
  });

  it("background task api degrades to no-op when modules cannot load", async () => {
    const api = createBackgroundTaskApi(() => null);
    expect(() => api.defineTask("x", () => {})).not.toThrow();
    await expect(api.registerTaskAsync("x", {})).resolves.toBeUndefined();
    await expect(api.unregisterTaskAsync("x")).resolves.toBeUndefined();
  });
});
