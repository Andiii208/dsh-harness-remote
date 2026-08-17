/**
 * dsh-remote 设计令牌 v7（docs/design/UI-SYSTEM-v7.md）
 * 极简 · 高级 · DeepSeek 品牌。双主题（浅/深跟随系统），纯色反转、零装饰。
 * 强调色 = DeepSeek Chat 官方主按钮蓝：浅 #3964FE / 深 #5686FE（实测 chat.deepseek.com）。
 * 显示标题字体 = Space Grotesk（@expo-google-fonts/space-grotesk）。
 * ThemeProvider / useTheme 见 ./theme-context.tsx（.ts 不能含 JSX）。
 * 注意：本文件不依赖 theme-context（避免循环依赖）；theme-context 单向依赖本文件。
 */

export type ThemeScheme = "light" | "dark";

export interface ThemeColors {
  bg: string;
  surface: string;
  surface2: string;
  separator: string;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accentSoft: string;
  success: string;
  warn: string;
  danger: string;
  codeBg: string;
  codeText: string;
  msgSelf: string;
  msgSelfText: string;
}

export interface ThemeValue {
  colors: ThemeColors;
  scheme: ThemeScheme;
  isDark: boolean;
}

const light: ThemeColors = {
  bg: "#F7F7FA",
  surface: "#FFFFFF",
  surface2: "#F2F2F6",
  separator: "rgba(20,20,40,0.08)",
  text: "#101016",
  textMuted: "#6E6E7A",
  textDim: "#B4B4C0",
  accent: "#3964FE", // DeepSeek Chat 官方主按钮蓝
  accentSoft: "rgba(57,100,254,0.08)",
  success: "#2E9E5B",
  warn: "#D9820B",
  danger: "#E5484D",
  codeBg: "#F3F3F7",
  codeText: "#23232E",
  msgSelf: "#3964FE",
  msgSelfText: "#FFFFFF",
};

const dark: ThemeColors = {
  bg: "#0B0B0F",
  surface: "#141419",
  surface2: "#1D1D24",
  separator: "rgba(255,255,255,0.07)",
  text: "#F2F2F6",
  textMuted: "#8E8E9C",
  textDim: "#555560",
  accent: "#5686FE", // DeepSeek Chat 深色模式主按钮蓝
  accentSoft: "rgba(86,134,254,0.12)",
  success: "#3ECF8E",
  warn: "#F5B84D",
  danger: "#F0728C",
  codeBg: "#1B1B22",
  codeText: "#D5D5E0",
  msgSelf: "#3964FE",
  msgSelfText: "#FFFFFF",
};

export function createTheme(scheme: ThemeScheme): ThemeColors {
  return scheme === "dark" ? dark : light;
}

/** 全局静态（与主题无关） */
export const font = {
  display: "SpaceGrotesk_600SemiBold",
  displayBold: "SpaceGrotesk_700Bold",
  body: 14,
  section: 15,
  title: 20,
  caption: 12,
  eyebrow: 10,
  transcript: 13,
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
  monoBold: "JetBrainsMono_700Bold",
} as const;

export const tracking = {
  display: -0.8,
  title: -0.5,
  eyebrow: 1.6,
} as const;

export const space = {
  x1: 4,
  x2: 8,
  x3: 12,
  x4: 14,
  x5: 16,
  x6: 20,
  x7: 24,
} as const;

export const radius = {
  card: 14,
  control: 12,
  pill: 999,
} as const;

export const control = {
  height: 48,
} as const;

/** 兼容旧引用：默认导出浅色（迁移期用；组件应改用 useTheme） */
export const colors = light;
