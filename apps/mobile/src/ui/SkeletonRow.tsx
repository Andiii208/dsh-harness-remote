import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { colors, radius, space } from "../theme";

/** 列表首载骨架：2 行条 + 140ms 透明度脉动（减弱动态时静止）。 */
export function SkeletonRow() {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
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
