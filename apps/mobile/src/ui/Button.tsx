import { Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { colors, control, font, radius, stroke } from "../theme";

export type ButtonTone = "primary" | "ghost" | "danger";

interface ButtonProps {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  full?: boolean;
  style?: ViewStyle;
}

/** 统一按钮：primary（强调色）/ ghost / danger-ghost；禁用 opacity 0.4。 */
export function Button({ label, onPress, tone = "primary", disabled, full, style }: ButtonProps) {
  const base = [styles.base, styles[tone], disabled && styles.disabled, full && styles.full, style];
  return (
    <Pressable
      style={({ pressed }) => [
        ...base,
        pressed && styles.pressed,
        pressed && !disabled && (tone === "primary" ? styles.pressedPrimary : styles.pressedGhost),
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text style={[styles.text, tone !== "primary" && styles.textGhost, tone === "danger" && styles.textDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: control.height,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: control.paddingX,
  },
  primary: { backgroundColor: colors.accent },
  ghost: {
    backgroundColor: colors.surface2,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
  },
  danger: {
    backgroundColor: colors.surface2,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
  },
  disabled: { opacity: 0.4 },
  full: { width: "100%" },
  pressed: { transform: [{ scale: 0.98 }] },
  pressedPrimary: { backgroundColor: colors.accentHover },
  pressedGhost: { backgroundColor: colors.surface3 },
  text: { color: "#FFFFFF", fontSize: font.body + 1, fontWeight: "600" },
  textGhost: { color: colors.text, fontWeight: "600" },
  textDanger: { color: colors.danger },
});
