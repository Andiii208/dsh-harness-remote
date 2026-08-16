import Svg, { Circle, Path, Rect } from "react-native-svg";
import { radius } from "../theme";

/**
 * 品牌鲸鱼标记：白色圆角方 + DeepSeek 黑色鲸鱼（矢量，与主图标同源）。
 * 用于连接页/引导页品牌位；矢量渲染保证任意屏幕密度下清晰。
 */
export function WhaleMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" accessibilityLabel="harness remote">
      <Rect x="0" y="0" width="1024" height="1024" rx="160" fill="#FFFFFF" />
      <Path
        fill="#111111"
        d="M 320 585 C 305 545, 305 515, 330 488 C 360 455, 430 432, 520 420 C 640 405, 760 415, 850 460 C 890 480, 920 505, 940 535 C 955 505, 985 480, 1005 470 C 985 505, 965 525, 955 545 C 950 560, 950 570, 955 585 C 965 605, 985 625, 1000 640 C 975 625, 945 610, 920 605 C 870 592, 800 610, 720 630 C 620 655, 480 660, 400 640 C 360 630, 330 615, 320 585 Z"
      />
      <Path
        fill="#111111"
        d="M 480 598 C 452 640, 442 662, 452 684 C 474 668, 506 636, 532 608 Z"
      />
      <Circle cx="386" cy="524" r="17" fill="#FFFFFF" />
    </Svg>
  );
}
