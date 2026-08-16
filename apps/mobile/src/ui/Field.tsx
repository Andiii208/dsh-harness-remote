import { useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, control, font, radius, space, stroke } from "../theme";
import { SectionLabel } from "./SectionLabel";

interface FieldProps extends TextInputProps {
  label?: string;
  mono?: boolean;
}

/** 输入容器：label（mono 眉标）+ 输入框；聚焦时 accent 描边 + accentSoft 外环。 */
export function Field({ label, mono, style, onFocus, onBlur, ...rest }: FieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      <TextInput
        {...rest}
        style={[
          styles.input,
          mono && styles.monoInput,
          focused && styles.focused,
          style,
        ]}
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

const styles = StyleSheet.create({
  wrap: { gap: space.x2 },
  input: {
    height: control.height,
    backgroundColor: colors.surface2,
    borderWidth: stroke.hairline,
    borderColor: colors.border,
    borderRadius: radius.control,
    color: colors.text,
    paddingHorizontal: control.paddingX,
    paddingVertical: control.paddingY,
    fontSize: font.body,
  },
  monoInput: { fontFamily: font.mono, fontSize: font.transcript },
  focused: {
    borderColor: colors.accent,
    borderWidth: 1,
    backgroundColor: colors.surface2,
    boxShadow: `0 0 0 3px ${colors.accentSoft}`,
  },
});
