import { describe, expect, it } from "vitest";
import { getExpoPushToken } from "../src/notify/pushToken";

describe("getExpoPushToken", () => {
  it("returns token data from an injected expo-notifications module", async () => {
    const token = await getExpoPushToken(() => ({
      getExpoPushTokenAsync: async () => ({ data: "ExponentPushToken[test-1]" }),
    }));
    expect(token).toBe("ExponentPushToken[test-1]");
  });

  it("degrades to null when the module cannot be loaded", async () => {
    await expect(getExpoPushToken(() => null)).resolves.toBeNull();
  });

  it("degrades to null when getExpoPushTokenAsync throws", async () => {
    await expect(
      getExpoPushToken(() => ({
        getExpoPushTokenAsync: async () => {
          throw new Error("native unavailable");
        },
      })),
    ).resolves.toBeNull();
  });
});
