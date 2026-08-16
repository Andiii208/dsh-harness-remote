/**
 * dsh-remote 设计令牌（docs/design/UI-SYSTEM.md v1）
 * 暗色终端质感：近黑底、单一强调色、信息密度优先。
 */

export const colors = {
  bg: "#0E0E10",
  surface: "#16161A",
  surface2: "#1E1E24",
  border: "#2A2A31",
  text: "#F5F5F7",
  textMuted: "#9BA1A6",
  accent: "#4D6BFE",
  accentSoft: "rgba(77,107,254,0.14)",
  success: "#34D399",
  warn: "#FBBF24",
  danger: "#F87171",
} as const;

export const font = {
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
  body: 15,
  title: 20,
  section: 16,
  transcript: 13,
} as const;

export const space = {
  x1: 4,
  x2: 8,
  x3: 12,
  x4: 16,
  x5: 24,
  x6: 32,
} as const;

export const radius = {
  card: 12,
  large: 16,
  pill: 999,
} as const;

export const stroke = {
  hairline: 1,
} as const;
