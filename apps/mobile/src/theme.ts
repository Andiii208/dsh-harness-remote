/**
 * dsh-remote 设计令牌 v9（docs/design/UI-SYSTEM-v9.md）
 * 双画布：品牌画布（navy 整屏深蓝）+ 阅读画布（paper 暖白/深色近黑）。
 * 三层纵深：流体光晕 + 技术网格 + 鲸鱼粒子 + 底部暗角（品牌画布专用）。
 * 强调色纪律：主行动 = DeepSeek 官方按钮蓝 #3964FE/#5686FE；选中态 = 黑底白字；
 * 紫色/橙色只允许出现在轨迹时间线与思考等级胶囊。
 * ThemeProvider / useTheme 见 ./theme-context.tsx（.ts 不能含 JSX）。
 * 注意：本文件不依赖 theme-context（避免循环依赖）；theme-context 单向依赖本文件。
 */

export type ThemeScheme = "light" | "dark";

export interface ThemeColors {
  bg: string;
  surface: string;
  surface2: string;
  /** v8 别名：Card = surface。 */
  card: string;
  /** v8 别名：Chip = surface2。 */
  chip: string;
  separator: string;
  /** v8 别名：Board = separator（1px 分隔线/描边）。 */
  board: string;
  /** 品牌画布底色（浅色模式也深蓝，与官网一致）。 */
  navy: string;
  /** 品牌画布浮起面。 */
  navyRaised: string;
  /** DeepSeek 官网 hero 深海蓝背景（= navy，兼容旧引用）。 */
  heroBg: string;
  /** DeepSeek 官网 hero 网格线颜色。 */
  heroGrid: string;
  heroText: string;
  heroTextDim: string;
  /** 流动深海光晕（SVG 径向渐变中心色）。去紫：B 为海洋蓝。 */
  heroAuroraA: string;
  heroAuroraB: string;
  heroAuroraC: string;
  heroGlow: string;
  /** 品牌画布半透明白浮层（浅/深同值）。 */
  heroCard: string;
  heroCardStrong: string;
  heroStroke: string;
  heroDivider: string;
  heroInput: string;
  /** 品牌画布焦点/辉光/发送键。 */
  ocean: string;
  /** 品牌画布次级文本/图标。 */
  mist: string;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accentSoft: string;
  success: string;
  warn: string;
  amber: string;
  danger: string;
  /** 轨迹语义色（只允许在轨迹页/思考等级胶囊使用）。 */
  traceBlue: string;
  tracePurple: string;
  traceOrange: string;
  codeBg: string;
  codeText: string;
  msgSelf: string;
  msgSelfText: string;
}

export type ThemePreference = "light" | "dark" | "system";

export interface ThemeValue {
  colors: ThemeColors;
  scheme: ThemeScheme;
  isDark: boolean;
  /** 用户选择的主题偏好（默认 light）。 */
  preference: ThemePreference;
  setPreference(pref: ThemePreference): void;
}

const HERO_CARD = "rgba(255,255,255,0.055)";
const HERO_CARD_STRONG = "rgba(255,255,255,0.08)";
const HERO_STROKE = "rgba(255,255,255,0.14)";
const HERO_DIVIDER = "rgba(255,255,255,0.10)";
const HERO_INPUT = "rgba(255,255,255,0.06)";

const light: ThemeColors = {
  bg: "#F7F8FA",
  surface: "#FFFFFF",
  surface2: "#F2F2F6",
  card: "#FFFFFF",
  chip: "#F2F2F6",
  separator: "rgba(20,20,40,0.08)",
  board: "rgba(20,20,40,0.08)",
  navy: "#07182B",
  navyRaised: "#0D2440",
  heroBg: "#07182B",
  heroGrid: "rgba(86,134,254,0.18)",
  heroText: "#F2F6FF",
  heroTextDim: "rgba(242,246,255,0.62)",
  heroAuroraA: "rgba(78,138,255,0.55)",
  heroAuroraB: "rgba(46,107,230,0.42)",
  heroAuroraC: "rgba(0,210,190,0.30)",
  heroGlow: "rgba(46,107,230,0.35)",
  heroCard: HERO_CARD,
  heroCardStrong: HERO_CARD_STRONG,
  heroStroke: HERO_STROKE,
  heroDivider: HERO_DIVIDER,
  heroInput: HERO_INPUT,
  ocean: "#2E6BE6",
  mist: "#BFD4FF",
  text: "#101318",
  textMuted: "#7D8592",
  textDim: "#B4B4C0",
  accent: "#3964FE", // DeepSeek Chat 官方主按钮蓝
  accentSoft: "rgba(57,100,254,0.08)",
  success: "#2E9E5B",
  warn: "#D9820B",
  amber: "#FFAD1F",
  danger: "#E5484D",
  traceBlue: "#2E6BE6",
  tracePurple: "#7A54C7",
  traceOrange: "#F07D14",
  codeBg: "#F3F3F7",
  codeText: "#23232E",
  msgSelf: "#3964FE",
  msgSelfText: "#FFFFFF",
};

const dark: ThemeColors = {
  bg: "#0B0B0F",
  surface: "#141419",
  surface2: "#1D1D24",
  card: "#141419",
  chip: "#1D1D24",
  separator: "rgba(255,255,255,0.07)",
  board: "rgba(255,255,255,0.07)",
  navy: "#07182B",
  navyRaised: "#0D2440",
  heroBg: "#07182B",
  heroGrid: "rgba(86,134,254,0.18)",
  heroText: "#F2F6FF",
  heroTextDim: "rgba(242,246,255,0.62)",
  heroAuroraA: "rgba(78,138,255,0.50)",
  heroAuroraB: "rgba(46,107,230,0.38)",
  heroAuroraC: "rgba(0,210,190,0.26)",
  heroGlow: "rgba(46,107,230,0.30)",
  heroCard: HERO_CARD,
  heroCardStrong: HERO_CARD_STRONG,
  heroStroke: HERO_STROKE,
  heroDivider: HERO_DIVIDER,
  heroInput: HERO_INPUT,
  ocean: "#2E6BE6",
  mist: "#BFD4FF",
  text: "#F2F2F6",
  textMuted: "#8E8E9C",
  textDim: "#7A7A88",
  accent: "#5686FE", // DeepSeek Chat 深色模式主按钮蓝
  accentSoft: "rgba(86,134,254,0.12)",
  success: "#3ECF8E",
  warn: "#F5B84D",
  amber: "#FFAD1F",
  danger: "#F0728C",
  traceBlue: "#2E6BE6",
  tracePurple: "#7A54C7",
  traceOrange: "#F07D14",
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
  card: 15,
  control: 14,
  sheet: 20,
  pill: 999,
} as const;

export const control = {
  height: 48,
} as const;

/** 兼容旧引用：默认导出浅色（迁移期用；组件应改用 useTheme） */
export const colors = light;
