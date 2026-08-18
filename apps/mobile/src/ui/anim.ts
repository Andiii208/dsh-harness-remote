/**
 * anim — 动效纪律：入场统一 FadeInDown（距离可调），退场统一 FadeOut；
 * 全部尊重系统「减弱动态」。所有页面/卡片共享同一套时长与曲线，
 * 避免一处一个手感。
 */

import { useEffect, useState, type ComponentProps } from "react";
import { AccessibilityInfo } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";

type EnteringProp = NonNullable<ComponentProps<typeof Animated.View>["entering"]>;
type ExitingProp = NonNullable<ComponentProps<typeof Animated.View>["exiting"]>;

export const MOTION = {
  /** 入场时长（毫秒）。 */
  enterMs: 220,
  /** 退场时长（毫秒）。 */
  exitMs: 140,
  /** 默认入场位移（逻辑像素）。 */
  distance: 8,
} as const;

function useReduceMotion(): boolean {
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
  return reduced;
}

export function useEntering(distance: number = MOTION.distance, duration: number = MOTION.enterMs): EnteringProp | undefined {
  const reduced = useReduceMotion();
  if (reduced) return undefined;
  return FadeInDown.duration(duration).withInitialValues({
    opacity: 0,
    translateY: distance,
  }) as unknown as EnteringProp;
}

export function useExiting(duration: number = MOTION.exitMs): ExitingProp | undefined {
  const reduced = useReduceMotion();
  if (reduced) return undefined;
  return FadeOut.duration(duration) as unknown as ExitingProp;
}
