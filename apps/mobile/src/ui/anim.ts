/**
 * anim — 动效纪律（UI-SYSTEM v2 §5）：入场动画统一 FadeInDown，尊重系统「减弱动态」。
 */

import { useEffect, useState, type ComponentProps } from "react";
import { AccessibilityInfo } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

type EnteringProp = NonNullable<ComponentProps<typeof Animated.View>["entering"]>;

export function useEntering(distance = 6, duration = 200): EnteringProp | undefined {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduced(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (reduced) return undefined;
  return FadeInDown.duration(duration) as unknown as EnteringProp;
}
