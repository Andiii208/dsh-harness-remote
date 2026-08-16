import { Image, StyleSheet, type ImageStyle, type StyleProp } from "react-native";
import { radius } from "../theme";

/** 品牌鲸鱼标记：白色圆角方 + 黑色鲸鱼（复用主图标），仅品牌位使用。 */
export function WhaleMark({ size = 40, style }: { size?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={require("../../assets/icon.png")}
      style={[styles.mark, { width: size, height: size, borderRadius: radius.control }, style]}
      accessibilityLabel="harness remote"
    />
  );
}

const styles = StyleSheet.create({
  mark: { backgroundColor: "#FFFFFF" },
});
