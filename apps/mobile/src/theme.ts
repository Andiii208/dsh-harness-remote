/**
 * dsh-remote 设计令牌（docs/design/UI-SYSTEM.md v2）
 * 暗色终端质感 v2：蓝黑底、单一强调色、等宽数据 + 无衬线叙述。
 */

export const colors = {
  bg: "#0A0C10",
  surface: "#12151C",
  surface2: "#1A1E28",
  surface3: "#232838",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.16)",
  text: "#EDEFF4",
  textMuted: "#8B93A3",
  textDim: "#5C6372",
  accent: "#4D6BFE",
  accentHover: "#5F7AFF",
  accentSoft: "rgba(77,107,254,0.14)",
  success: "#34D399",
  warn: "#FBBF24",
  danger: "#F87171",
} as const;

export const font = {
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
  display: 26,
  title: 20,
  section: 15,
  body: 14,
  caption: 12,
  eyebrow: 11,
  transcript: 13,
} as const;

/** letterSpacing 建议值：标题 -0.3 / -0.2；眉标 +1.4；其余 0。 */
export const tracking = {
  display: -0.3,
  title: -0.2,
  eyebrow: 1.4,
} as const;

export const space = {
  x1: 4,
  x2: 8,
  x3: 12,
  x4: 14,
  x5: 16,
  x6: 24,
  x7: 32,
} as const;

export const radius = {
  card: 12,
  control: 10,
  large: 16,
  pill: 999,
} as const;

export const control = {
  height: 46,
  paddingX: 14,
  paddingY: 12,
} as const;

export const stroke = {
  hairline: 1,
} as const;
