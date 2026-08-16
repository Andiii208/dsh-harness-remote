/**
 * ConnectingBar — 连接中不定长进度条（UI-SYSTEM §3.7：3px、accent、不定长，不转圈）。
 */

import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { colors, radius } from "../theme";

type Percent = `${number}%`;

export function ConnectingBar() {
  const progress = useSharedValue(12);
  useEffect(() => {
    progress.value = withRepeat(
      withTiming(88, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [progress]);
  const animatedStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%` as Percent,
  }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, animatedStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 3, borderRadius: radius.pill, backgroundColor: colors.surface2, overflow: "hidden" },
  fill: { height: 3, borderRadius: radius.pill, backgroundColor: colors.accent },
});
