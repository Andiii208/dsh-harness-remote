import { useMemo } from "react";
import { Image, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { type ThemeColors } from "../theme";
import { useTheme } from "../theme-context";

/**
 * DeepOceanBackground — 品牌画布全屏背景（v9.1 静态版）。
 *
 * v9 的三层 Reanimated 动画（FlowingOcean + TechnicalGrid mask + DotWhaleMark pattern）
 * 在 Android 原生端掉帧严重；本版全部改为**静态渲染**：
 * - 两团固定位置的径向光晕（SVG RadialGradient，无动画）
 * - 稀疏技术网格（有限 Rect，无 Mask/渐隐遮罩）
 * - 预渲染白鲸 PNG（`whale-light.png`，替代运行时 DotWhaleMark SVG pattern）
 * 视觉层级不变，原生端零 JS 动画开销。
 */

export function DeepOceanBackground({
  whale = true,
  whaleSize = 190,
  whaleOpacity = 0.16,
}: {
  whale?: boolean;
  /** 已废弃（v9 参数），仅为兼容旧调用保留；鲸鱼固定沉底。 */
  whaleTop?: number;
  whaleSize?: number;
  whaleOpacity?: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.root} pointerEvents="none" accessibilityElementsHidden>
      <Aurora />
      <TechnicalGrid />
      {whale ? (
        <View style={styles.whaleWrap} pointerEvents="none">
          <Image
            source={require("../../assets/whale-light.png")}
            style={{ width: whaleSize, height: whaleSize, opacity: whaleOpacity }}
            resizeMode="contain"
          />
        </View>
      ) : null}
      <Vignette />
    </View>
  );
}

const GRID_W = 8;
const GRID_H = 14;
const GRID_SPACING = 64;

function TechnicalGrid() {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${GRID_W * GRID_SPACING} ${GRID_H * GRID_SPACING}`}
        preserveAspectRatio="xMidYMid slice"
      >
        <G>
          {Array.from({ length: GRID_W }, (_, i) => (
            <Rect key={`v${i}`} x={(i + 0.5) * GRID_SPACING} y={0} width={0.6} height={GRID_H * GRID_SPACING} fill="#FFFFFF" opacity={0.05} />
          ))}
          {Array.from({ length: GRID_H }, (_, i) => (
            <Rect key={`h${i}`} x={0} y={(i + 0.5) * GRID_SPACING} width={GRID_W * GRID_SPACING} height={0.6} fill="#FFFFFF" opacity={0.05} />
          ))}
        </G>
      </Svg>
    </View>
  );
}

function Aurora() {
  const { colors } = useTheme();
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="v91AuroraA" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={colors.heroAuroraA} stopOpacity="0.55" />
          <Stop offset="100%" stopColor={colors.heroAuroraA} stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="v91AuroraB" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={colors.heroAuroraB} stopOpacity="0.42" />
          <Stop offset="100%" stopColor={colors.heroAuroraB} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {/* 左上冷蓝辉光 */}
      <Circle cx="18%" cy="22%" r="34%" fill="url(#v91AuroraA)" />
      {/* 右下深海青辉光（弱） */}
      <Circle cx="82%" cy="78%" r="30%" fill="url(#v91AuroraB)" opacity={0.5} />
    </Svg>
  );
}

function Vignette() {
  const { colors } = useTheme();
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="v91Vignette" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity="0" />
          <Stop offset="0.55" stopColor={colors.navy} stopOpacity="0.10" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.45" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#v91Vignette)" />
    </Svg>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { ...StyleSheet.absoluteFill, backgroundColor: colors.navy, overflow: "hidden" },
    whaleWrap: {
      position: "absolute",
      right: -28,
      bottom: -36,
    },
  });
}
