import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, G, LinearGradient, Mask, Rect, Stop } from "react-native-svg";
import { type ThemeColors } from "../theme";
import { useTheme } from "../theme-context";
import { FlowingOcean } from "./FlowingOcean";
import { DotWhaleMark } from "./DotWhaleMark";

/**
 * DeepOceanBackground — 品牌画布全屏背景（v9）。
 * L1 流体层（FlowingOcean）+ L2 技术网格（42pt 间距 + 稀疏交点 + 自上而下渐隐）
 * + L3 鲸鱼粒子（MVP：DotWhaleMark，位置/大小可调）+ L4 底部暗角。
 * 参考 Clarklevis1995/dsh-mobile HarnessAnimatedBackground 的 RN 等价实现。
 */
export function DeepOceanBackground({
  whale = true,
  whaleTop = 118,
  whaleSize = 168,
  whaleOpacity = 0.5,
}: {
  whale?: boolean;
  whaleTop?: number;
  whaleSize?: number;
  whaleOpacity?: number;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.root} pointerEvents="none" accessibilityElementsHidden>
      <FlowingOcean />
      <TechnicalGrid />
      {whale ? (
        <View style={[styles.whaleWrap, { top: whaleTop, opacity: whaleOpacity }]}>
          <DotWhaleMark size={whaleSize} fill={colors.heroText} dotSize={1.15} grid={3.4} />
        </View>
      ) : null}
      <Vignette />
    </View>
  );
}

const GRID_SPACING = 42;

function TechnicalGrid() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const verticals = useMemo(
    () => (size.w > 0 ? Math.ceil(size.w / GRID_SPACING) + 1 : 0),
    [size.w],
  );
  const horizontals = useMemo(
    () => (size.h > 0 ? Math.ceil(size.h / GRID_SPACING) + 1 : 0),
    [size.h],
  );
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
      }}
    >
      {size.w > 0 && size.h > 0 ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id="v9GridMask" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.8" />
              <Stop offset="0.56" stopColor="#FFFFFF" stopOpacity="1" />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
            </LinearGradient>
            <Mask id="v9GridFade">
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#v9GridMask)" />
            </Mask>
          </Defs>
          <G mask="url(#v9GridFade)">
            {Array.from({ length: verticals }, (_, i) => {
              const x = (i + 0.5) * GRID_SPACING;
              return (
                <Rect key={`v${i}`} x={x} y={0} width={0.55} height={size.h} fill="#FFFFFF" opacity={0.043} />
              );
            })}
            {Array.from({ length: horizontals }, (_, i) => {
              const y = (i + 0.5) * GRID_SPACING;
              return (
                <Rect key={`h${i}`} x={0} y={y} width={size.w} height={0.55} fill="#FFFFFF" opacity={0.043} />
              );
            })}
            {/* 稀疏交点方点：镜像官网 technical grid */}
            {Array.from({ length: horizontals }, (_, row) =>
              Array.from({ length: verticals }, (_, col) => {
                if ((row * 11 + col * 7) % 13 !== 0) return null;
                const x = (col + 0.5) * GRID_SPACING - 1.1;
                const y = (row + 0.5) * GRID_SPACING - 1.1;
                return <Rect key={`s${row}-${col}`} x={x} y={y} width={2.2} height={2.2} fill="#FFFFFF" opacity={0.085} />;
              }),
            )}
          </G>
        </Svg>
      ) : null}
    </View>
  );
}

function Vignette() {
  const { colors } = useTheme();
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="v9Vignette" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#000000" stopOpacity="0" />
          <Stop offset="0.5" stopColor={colors.navy} stopOpacity="0.12" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.58" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#v9Vignette)" />
    </Svg>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { ...StyleSheet.absoluteFill, backgroundColor: colors.navy, overflow: "hidden" },
    whaleWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      alignItems: "center",
    },
  });
}
