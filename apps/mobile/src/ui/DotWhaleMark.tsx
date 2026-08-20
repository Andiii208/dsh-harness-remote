import { useId } from "react";
import Svg, { Circle, Defs, Mask, Path, Pattern } from "react-native-svg";
import { OFFICIAL_WHALE_D } from "./WhaleMark";

/**
 * DotWhaleMark — DeepSeek 官网风格点阵鲸鱼：
 * 用 SVG Pattern 生成点阵，再用 Mask 把点阵裁成官方鲸鱼剪影。
 * viewBox 与 WhaleMark 一致（-20 -2 90 46），保证品牌图形位置不变。
 */
export function DotWhaleMark({ size = 120, fill = "#F2F6FF", dotSize = 1.1, grid = 3.2 }: { size?: number; fill?: string; dotSize?: number; grid?: number }) {
  const uid = useId().replace(/:/g, "");
  const patternId = `whaleDots-${uid}`;
  const maskId = `whaleMask-${uid}`;
  return (
    <Svg width={size} height={size} viewBox="-20 -2 90 46" accessibilityLabel="harness remote">
      <Defs>
        <Pattern id={patternId} width={grid} height={grid} patternUnits="userSpaceOnUse">
          <Circle cx={grid / 2} cy={grid / 2} r={dotSize} fill={fill} />
        </Pattern>
        <Mask id={maskId}>
          <Path d={OFFICIAL_WHALE_D} fill="#FFFFFF" />
        </Mask>
      </Defs>
      <Path d={OFFICIAL_WHALE_D} fill={`url(#${patternId})`} mask={`url(#${maskId})`} />
    </Svg>
  );
}
