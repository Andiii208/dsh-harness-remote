import { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { control, font, radius } from "../theme";
import { useTheme } from "../theme-context";
import { SectionLabel } from "./SectionLabel";

interface FieldProps extends TextInputProps {
  label?: string;
  mono?: boolean;
}

/** 输入容器 v7：label（mono 眉标）+ 输入框；聚焦时 accent 描边 + accentSoft 外环。 */
export function Field({ label, mono, style, onFocus, onBlur, ...rest }: FieldProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      <TextInput
        {...rest}
        style={[styles.input, mono && styles.monoInput, focused && styles.focused, style]}
        placeholderTextColor={colors.textDim}
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
      backgroundColor: colors.glass,
      borderRadius: radius.control,
      color: colors.text,
      paddingHorizontal: 16,
      paddingVertical: 0,
      fontSize: font.body,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    monoInput: { fontFamily: font.mono, fontSize: font.transcript },
    focused: {
      borderColor: colors.accent,
      shadowColor: colors.accent,
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
  });
}
