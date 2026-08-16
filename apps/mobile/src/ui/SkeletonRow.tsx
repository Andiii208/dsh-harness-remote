import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import { colors, radius, space } from "../theme";

/** 列表首载骨架：2 行条 + 140ms 透明度脉动；尊重系统「减弱动态」时静止。 */
export function SkeletonRow() {
  const pulse = useRef(new Animated.Value(0.6)).current;
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
  }, []);
  useEffect(() => {
    if (reduced) {
      pulse.setValue(0.6);
      return;
    }
    pulse.setValue(0.45);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: 140, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 140, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return (
    <View style={styles.row}>
      <Animated.View style={[styles.bar, { width: "55%", opacity: pulse }]} />
      <Animated.View style={[styles.bar, { width: "80%", opacity: pulse }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.x4,
    gap: space.x2,
  },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.surface2 },
});
