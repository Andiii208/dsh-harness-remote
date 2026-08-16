import { describe, expect, it } from "vitest";
import { routeFromNotificationData } from "../src/notify/route.js";

describe("routeFromNotificationData", () => {
  it("extracts known chat routes", () => {
    expect(routeFromNotificationData({ route: "chat/s1" })).toBe("chat/s1");
    expect(routeFromNotificationData({ route: "approval/r1" })).toBe("approval/r1");
  });

  it("rejects unknown prefixes and garbage", () => {
    expect(routeFromNotificationData({ route: "settings/x" })).toBeNull();
    expect(routeFromNotificationData({ route: "javascript:alert(1)" })).toBeNull();
    expect(routeFromNotificationData(null)).toBeNull();
    expect(routeFromNotificationData("chat/s1")).toBeNull();
    expect(routeFromNotificationData({})).toBeNull();
  });
});
