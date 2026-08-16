/**
 * onboardingStore — 首启引导标记（SecureStore）。
 */

import type { SecureStoreApi } from "../data/tokenStore";

export const ONBOARDING_KEY = "dsh-seen-onboarding";

export class OnboardingStore {
  constructor(private readonly api: SecureStoreApi) {}

  async seen(): Promise<boolean> {
    try {
      const v = await this.api.getItemAsync(ONBOARDING_KEY);
      return v === "1";
    } catch (err) {
      // 存储不可用（如 Web 预览无 SecureStore）→ 视为已引导，避免首启重定向死循环。
      console.warn("[onboarding] read failed — assume seen", err);
      return true;
    }
  }

  async markSeen(): Promise<void> {
    try {
      await this.api.setItemAsync(ONBOARDING_KEY, "1");
    } catch (err) {
      console.warn("[onboarding] write failed", err);
    }
  }
}
