import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../theme-context";
import { useReduceMotion } from "./anim";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const styles = StyleSheet.create({
  svg: {
    ...StyleSheet.absoluteFill,
  },
});

/**
 * FlowingOcean — DeepSeek Harness 官网 hero 的流动深海背景：
 * 三团缓慢漂移/呼吸的极光光晕 + 细碎星点 + 鲸鱼背后的蓝色辉光。
 * 全部使用 SVG 径向渐变 + Reanimated 动画，不新增任何依赖。
 * 尊重系统「减弱动态」：开启后静态渲染（不启动动画）。
 */
export function FlowingOcean() {
  const { colors } = useTheme();
  const reduced = useReduceMotion();
  return (
    <Svg style={styles.svg} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" pointerEvents="none">
      <Defs>
        <RadialGradient id="auroraA" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={colors.heroAuroraA} stopOpacity="1" />
          <Stop offset="100%" stopColor={colors.heroAuroraA} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="auroraB" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={colors.heroAuroraB} stopOpacity="1" />
          <Stop offset="100%" stopColor={colors.heroAuroraB} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="auroraC" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={colors.heroAuroraC} stopOpacity="1" />
          <Stop offset="100%" stopColor={colors.heroAuroraC} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="heroGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={colors.heroGlow} stopOpacity="1" />
          <Stop offset="100%" stopColor={colors.heroGlow} stopOpacity="0" />
        </RadialGradient>
      </Defs>

      {/* 三团极光光晕：不同起点/终点/半径/周期，交错流动 */}
      <AuroraBlob
        id="auroraA"
        from={{ x: 18, y: 68 }}
        to={{ x: 78, y: 30 }}
        r={30}
        duration={16000}
        reduced={reduced}
      />
      <AuroraBlob
        id="auroraB"
        from={{ x: 82, y: 18 }}
        to={{ x: 24, y: 78 }}
        r={26}
        duration={21000}
        reduced={reduced}
      />
      <AuroraBlob
        id="auroraC"
        from={{ x: 50, y: 86 }}
        to={{ x: 50, y: 22 }}
        r={22}
        duration={18000}
        reduced={reduced}
      />

      {/* 鲸鱼背后的呼吸辉光 */}
      <AuroraBlob
        id="heroGlow"
        from={{ x: 50, y: 40 }}
        to={{ x: 50, y: 44 }}
        r={16}
        duration={4200}
        reduced={reduced}
      />

      {/* 细碎星点：缓慢闪烁，模拟官网深海光尘 */}
      {STARS.map((s, i) => (
        <StarDot key={`star-${i}`} x={s.x} y={s.y} r={s.r} duration={s.duration} reduced={reduced} fill={colors.heroText} />
      ))}
    </Svg>
  );
}

const STARS = [
  { x: 8, y: 22, r: 0.55, duration: 3600 },
  { x: 22, y: 12, r: 0.4, duration: 4200 },
  { x: 88, y: 38, r: 0.5, duration: 3900 },
  { x: 74, y: 10, r: 0.35, duration: 4500 },
  { x: 14, y: 82, r: 0.45, duration: 4100 },
  { x: 92, y: 80, r: 0.5, duration: 3800 },
  { x: 34, y: 8, r: 0.4, duration: 4400 },
  { x: 58, y: 16, r: 0.5, duration: 3700 },
  { x: 6, y: 52, r: 0.35, duration: 4800 },
  { x: 96, y: 58, r: 0.45, duration: 4000 },
  { x: 40, y: 92, r: 0.5, duration: 4300 },
  { x: 68, y: 88, r: 0.4, duration: 3900 },
  { x: 18, y: 34, r: 0.35, duration: 4600 },
  { x: 84, y: 26, r: 0.55, duration: 3500 },
  { x: 52, y: 72, r: 0.4, duration: 4200 },
  { x: 28, y: 60, r: 0.45, duration: 4700 },
  { x: 76, y: 52, r: 0.35, duration: 4100 },
  { x: 46, y: 44, r: 0.4, duration: 3800 },
] as const;

function AuroraBlob({
  id,
  from,
  to,
  r,
  duration,
  reduced,
}: {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  r: number;
  duration: number;
  reduced: boolean;
}) {
  const progress = useSharedValue(0);
  const radius = useSharedValue(r);

  useEffect(() => {
    if (reduced) return;
    progress.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true,
    );
    radius.value = withRepeat(
      withTiming(r * 1.18, { duration: Math.round(duration * 1.25), easing: Easing.inOut(Easing.cubic) }),
      -1,
      true,
    );
  }, [duration, r, reduced, progress, radius]);

  const animatedProps = useAnimatedProps(() => ({
    cx: from.x + (to.x - from.x) * progress.value,
    cy: from.y + (to.y - from.y) * progress.value,
    r: radius.value,
  }));

  return <AnimatedCircle animatedProps={animatedProps} fill={`url(#${id})`} />;
}

function StarDot({
  x,
  y,
  r,
  duration,
  reduced,
  fill,
}: {
  x: number;
  y: number;
  r: number;
  duration: number;
  reduced: boolean;
  fill: string;
}) {
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    if (reduced) return;
    opacity.value = withRepeat(
      withTiming(0.15, { duration, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true,
    );
  }, [duration, reduced, opacity]);

  const animatedProps = useAnimatedProps(() => ({
    opacity: opacity.value,
  }));

  return <AnimatedCircle animatedProps={animatedProps} cx={x} cy={y} r={r} fill={fill} />;
}
