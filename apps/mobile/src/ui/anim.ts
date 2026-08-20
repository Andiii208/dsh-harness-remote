/**
 * anim — 动效纪律：入场统一 FadeInDown（距离可调），退场统一 FadeOut；
 * 全部尊重系统「减弱动态」。所有页面/卡片共享同一套时长与曲线，
 * 避免一处一个手感。
 *
 * 曲线使用 cubic-bezier(0.16, 1, 0.3, 1)（缓出），
 * 具有自然、高级的质感，避免廉价感。
 */

import { useEffect, useState, type ComponentProps } from "react";
import { AccessibilityInfo } from "react-native";
import Animated, { Easing, FadeInDown, FadeOut } from "react-native-reanimated";

type EnteringProp = NonNullable<ComponentProps<typeof Animated.View>["entering"]>;
type ExitingProp = NonNullable<ComponentProps<typeof Animated.View>["exiting"]>;

/** 缓出曲线：自然、高级。 */
const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

export const MOTION = {
  /** 入场时长（毫秒）。 */
  enterMs: 200,
  /** 退场时长（毫秒）。 */
  exitMs: 120,
  /** 默认入场位移（逻辑像素）。 */
  distance: 10,
  /** 缓出曲线。 */
  easing: EASE_OUT,
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
  }).easing(MOTION.easing) as unknown as EnteringProp;
}

export function useExiting(duration: number = MOTION.exitMs): ExitingProp | undefined {
  const reduced = useReduceMotion();
  if (reduced) return undefined;
  return FadeOut.duration(duration).easing(MOTION.easing) as unknown as ExitingProp;
}
