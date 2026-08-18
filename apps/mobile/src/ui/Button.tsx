import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import { control, font, radius } from "../theme";
import { useTheme } from "../theme-context";

export type ButtonTone = "primary" | "ghost" | "danger";

interface ButtonProps {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  /** 加载态：禁用 + 转圈，避免重复提交。 */
  loading?: boolean;
  full?: boolean;
  style?: ViewStyle;
}

/** 统一按钮 v8：primary（DeepSeek 蓝）/ ghost / danger-ghost；禁用 opacity 0.4；支持 loading。 */
export function Button({ label, onPress, tone = "primary", disabled, loading, full, style }: ButtonProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const blocked = disabled || loading;
  const base = [styles.base, styles[tone], blocked && styles.disabled, full && styles.full, style];
  return (
    <Pressable
      style={({ pressed }) => [
        ...base,
        pressed && styles.pressed,
        pressed && !blocked && (tone === "primary" ? styles.pressedPrimary : styles.pressedGhost),
      ]}
      onPress={onPress}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityState={{ busy: loading === true, disabled: blocked }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone === "primary" ? "#FFFFFF" : colors.text} />
      ) : (
        <Text style={[styles.text, tone !== "primary" && styles.textGhost, tone === "danger" && styles.textDanger]}>{label}</Text>
      )}
    </Pressable>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    base: {
      height: control.height,
      borderRadius: radius.control,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    primary: { backgroundColor: colors.accent },
    ghost: { backgroundColor: colors.surface2 },
    danger: { backgroundColor: colors.surface2 },
    disabled: { opacity: 0.4 },
    full: { width: "100%" },
    pressed: { transform: [{ scale: 0.98 }], opacity: 0.85 },
    pressedPrimary: { backgroundColor: colors.accent },
    pressedGhost: { backgroundColor: colors.surface2 },
    text: { color: "#FFFFFF", fontSize: font.body + 1, fontWeight: "600" },
    textGhost: { color: colors.text, fontWeight: "600" },
    textDanger: { color: colors.danger },
  });
}
