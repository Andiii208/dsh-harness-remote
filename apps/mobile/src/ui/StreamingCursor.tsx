/**
 * StreamingCursor — 流式输出闪烁光标（UI-SYSTEM §2：转录等宽、▍ 光标）。
 * 尊重系统「减弱动态」：关闭时静止显示。
 */

import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { colors, font } from "../theme";

export function StreamingCursor() {
  const [reduced, setReduced] = useState(false);
  const opacity = useSharedValue(1);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
  }, []);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withRepeat(withTiming(0.25, { duration: 480 }), -1, true);
  }, [opacity, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.Text style={[styles.cursor, style]}>▍</Animated.Text>
  );
}

const styles = StyleSheet.create({
  cursor: { color: colors.accent, fontFamily: font.mono, fontSize: font.transcript },
});
