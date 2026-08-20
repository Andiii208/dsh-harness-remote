import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { font, radius } from "../theme";
import { useTheme } from "../theme-context";
import { SectionLabel } from "./SectionLabel";

interface FieldProps extends TextInputProps {
  label?: string;
  mono?: boolean;
  /** paper = 阅读画布；hero = 品牌画布（半透明白 + 白描边，聚焦 ocean）。 */
  variant?: "paper" | "hero";
}

/** 输入容器 v9：label（mono 眉标）+ 输入框；品牌画布与阅读画布双变体。 */
export function Field({ label, mono, variant = "paper", style, onFocus, onBlur, ...rest }: FieldProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);
  const hero = variant === "hero";
  return (
    <View style={styles.wrap}>
      {label ? <SectionLabel tone={hero ? "mist" : "muted"}>{label}</SectionLabel> : null}
      <TextInput
        {...rest}
        style={[
          styles.input,
          hero ? styles.inputHero : styles.inputPaper,
          mono && styles.monoInput,
          focused && (hero ? styles.focusedHero : styles.focusedPaper),
          style,
        ]}
        placeholderTextColor={hero ? colors.heroTextDim : colors.textDim}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
      />
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    input: {
      height: 46,
      borderRadius: radius.control,
      paddingHorizontal: 16,
      paddingVertical: 0,
      fontSize: font.body,
      borderWidth: 1,
    },
    inputPaper: {
      backgroundColor: colors.surface2,
      borderColor: colors.separator,
      color: colors.text,
    },
    inputHero: {
      backgroundColor: colors.heroInput,
      borderColor: colors.heroStroke,
      color: colors.heroText,
    },
    monoInput: { fontFamily: font.mono, fontSize: font.transcript },
    focusedPaper: { borderColor: colors.accent },
    focusedHero: { borderColor: colors.ocean },
  });
}
