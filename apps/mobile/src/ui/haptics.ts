/**
 * haptics — 关键操作的触觉反馈（expo-haptics；Web/不可用时静默降级）。
 */

import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export type HapticKind = "light" | "medium" | "success" | "warning" | "error";

export async function haptic(kind: HapticKind = "light"): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    switch (kind) {
      case "success":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "warning":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case "error":
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
      case "medium":
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      default:
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch {
    // 触觉不可用（模拟器/Web）→ 忽略
  }
}
