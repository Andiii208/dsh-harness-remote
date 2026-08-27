/**
 * AppText — 统一文字组件（UI-SYSTEM v8）。
 * 只消费 token，不再散落 fontSize/fontFamily。
 */

import { useMemo } from "react";
import { Text, type TextProps, type TextStyle } from "react-native";
import { font, type ThemeColors } from "../theme";
import { useTheme } from "../theme-context";
import { useAppSettings } from "../data/appSettingsContext";

export type AppTextVariant = "display" | "title" | "body" | "caption" | "eyebrow" | "mono" | "monoBold";

interface AppTextProps extends TextProps {
  variant?: AppTextVariant;
  /** 文字颜色：默认 text，可选 muted / dim / accent / danger / success / inherit。 */
  tone?: "text" | "muted" | "dim" | "accent" | "danger" | "success";
}

/** 导出为纯函数：渲染测试与调用方均可直接断言缩放结果。 */
export function variantBase(variant: AppTextVariant, colors: ThemeColors, scale: number): TextStyle {
  switch (variant) {
    case "display":
      return {
        color: colors.text,
        fontFamily: font.display,
        fontSize: 24,
        fontWeight: "600",
        letterSpacing: -0.6,
        lineHeight: 28,
      };
    case "title":
      return {
        color: colors.text,
        fontFamily: font.display,
        fontSize: 20,
        fontWeight: "600",
        letterSpacing: -0.5,
        lineHeight: 24,
      };
    case "body":
      return { color: colors.text, fontSize: (font.body + 1) * scale, lineHeight: 22 * scale };
    case "caption":
      return { color: colors.text, fontSize: font.caption * scale, lineHeight: 18 * scale };
    case "eyebrow":
      return {
        color: colors.textMuted,
        fontFamily: font.monoBold,
        fontSize: font.eyebrow,
        fontWeight: "500",
        letterSpacing: 1.6,
        textTransform: "uppercase",
      };
    case "mono":
      return { color: colors.text, fontFamily: font.mono, fontSize: font.transcript, lineHeight: 18 };
    case "monoBold":
      return { color: colors.text, fontFamily: font.monoBold, fontSize: font.transcript, fontWeight: "500" };
  }
}

function toneColor(tone: NonNullable<AppTextProps["tone"]>, colors: ThemeColors): string {
  switch (tone) {
    case "text":
      return colors.text;
    case "muted":
      return colors.textMuted;
    case "dim":
      return colors.textDim;
    case "accent":
      return colors.accent;
    case "danger":
      return colors.danger;
    case "success":
      return colors.success;
  }
}

export function AppText({ variant = "body", tone = "text", style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  // B7：设置页的字体大小从「仅聊天气泡」升级为统一文字组件全生效。
  const { scale } = useAppSettings();
  const styles = useMemo(() => {
    const b = variantBase(variant, colors, scale);
    return { ...b, color: toneColor(tone, colors) };
  }, [variant, tone, colors, scale]);
  return <Text {...rest} style={[styles, style]} />;
}
