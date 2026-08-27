/**
 * icons — 统一 SVG 线性图标（审计 B3：此前 ⚙🛡↑↓✓ 等用 emoji/unicode 凑数，
 * 观感廉价且跨平台字形不一致）。风格对齐 Feather：24 viewBox、圆角线帽、
 * stroke 由主题色传入。唯一出口 AppIcon，页面不得再内嵌文本字符图标。
 */

import Svg, { Circle, Line, Path, Polyline } from "react-native-svg";

export type IconName =
  | "settings"
  | "shield"
  | "arrowUp"
  | "arrowDown"
  | "check"
  | "close"
  | "banned"
  | "refresh"
  | "clock"
  | "help"
  | "pending";

const STROKE_WIDTH = 2;

/** 齿轮简化形：中心圆 + 8 根辐条（Feather settings 的几何近似）。 */
function GearGlyph({ color }: { color: string }) {
  const spokes: Array<[number, number, number, number]> = [
    [19.5, 12, 22, 12],
    [12, 19.5, 12, 22],
    [4.5, 12, 2, 12],
    [12, 4.5, 12, 2],
    [17.3, 17.3, 19.07, 19.07],
    [6.7, 17.3, 4.93, 19.07],
    [17.3, 6.7, 19.07, 4.93],
    [6.7, 6.7, 4.93, 4.93],
  ];
  return (
    <>
      <Circle cx={12} cy={12} r={3.2} stroke={color} strokeWidth={STROKE_WIDTH} fill="none" />
      {spokes.map(([x1, y1, x2, y2]) => (
        <Line
          key={`${x1}:${y1}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
        />
      ))}
    </>
  );
}

export function AppIcon({
  name,
  color,
  size = 18,
}: {
  name: IconName;
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "settings" && <GearGlyph color={color} />}
      {name === "shield" && (
        <Path
          d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          strokeLinejoin="round"
          fill="none"
        />
      )}
      {name === "arrowUp" && (
        <>
          <Line x1={12} y1={19} x2={12} y2={5} stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
          <Polyline points="5 12 12 5 19 12" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      )}
      {name === "arrowDown" && (
        <>
          <Line x1={12} y1={5} x2={12} y2={19} stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
          <Polyline points="5 12 12 19 19 12" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      )}
      {name === "check" && (
        <Polyline points="20 6 9 17 4 12" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      )}
      {name === "close" && (
        <>
          <Line x1={18} y1={6} x2={6} y2={18} stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
          <Line x1={6} y1={6} x2={18} y2={18} stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
        </>
      )}
      {name === "banned" && (
        <>
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={STROKE_WIDTH} fill="none" />
          <Line x1={5.6} y1={5.6} x2={18.4} y2={18.4} stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
        </>
      )}
      {name === "refresh" && (
        <>
          <Polyline points="23 4 23 10 17 10" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <Path
            d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"
            stroke={color}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      )}
      {name === "help" && (
        <>
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={STROKE_WIDTH} fill="none" />
          <Path
            d="M9.6 9.2a2.45 2.45 0 1 1 3.35 2.28c-.72.29-.95.86-.95 1.52v.4"
            stroke={color}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            fill="none"
          />
          <Line x1={12} y1={16.8} x2={12} y2={16.9} stroke={color} strokeWidth={STROKE_WIDTH + 0.6} strokeLinecap="round" />
        </>
      )}
      {(name === "clock" || name === "pending") && (
        <>
          <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={STROKE_WIDTH} fill="none" />
          <Line x1={12} y1={7} x2={12} y2={12} stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
          {name === "clock" ? (
            <Line x1={12} y1={12} x2={15.5} y2={14} stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
          ) : (
            <Path d="M12 21a9 9 0 0 0 9-9" stroke={color} strokeWidth={STROKE_WIDTH} strokeLinecap="round" fill="none" />
          )}
        </>
      )}
    </Svg>
  );
}
