/**
 * StreamingCursor — 流式输出闪烁光标（v7：方块光标）。
 * 尊重系统「减弱动态」：开启时静止显示；关闭动画时立即取消。
 */

import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, StyleSheet } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { font } from "../theme";
import { useTheme } from "../theme-context";

export function StreamingCursor() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [reduced, setReduced] = useState(false);
  const opacity = useSharedValue(1);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
  }, []);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(opacity);
      opacity.value = 1;
      return;
    }
    opacity.value = withRepeat(withTiming(0.25, { duration: 480 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.Text style={[styles.cursor, style]}>▍</Animated.Text>;
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    cursor: { color: colors.accent, fontFamily: font.mono, fontSize: font.transcript },
  });
}
