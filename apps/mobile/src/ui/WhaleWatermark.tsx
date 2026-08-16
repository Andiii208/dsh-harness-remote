/**
 * WhaleWatermark — 品牌鲸鱼水印（accent 低透明度，装饰用，不参与交互）。
 */

import { StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { StyleProp, ViewStyle } from "react-native";
import { colors } from "../theme";

export const WHALE_D =
  "M 320 585 C 305 545, 305 515, 330 488 C 360 455, 430 432, 520 420 C 640 405, 760 415, 850 460 C 890 480, 920 505, 940 535 C 955 505, 985 480, 1005 470 C 985 505, 965 525, 955 545 C 950 560, 950 570, 955 585 C 965 605, 985 625, 1000 640 C 975 625, 945 610, 920 605 C 870 592, 800 610, 720 630 C 620 655, 480 660, 400 640 C 360 630, 330 615, 320 585 Z M 480 598 C 452 640, 442 662, 452 684 C 474 668, 506 636, 532 608 Z";

export function WhaleWatermark({
  size = 320,
  opacity = 0.045,
  style,
}: {
  size?: number;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Svg style={[styles.base, style]} width={size} height={size} viewBox="0 0 1024 1024" pointerEvents="none">
      <Path d={WHALE_D} fill={colors.accent} opacity={opacity} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  base: { position: "absolute" },
});
