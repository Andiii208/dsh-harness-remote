/**
 * highlight — 轻量语法高亮（B：聊天体验）。
 * 纯函数，零依赖：关键词 / 字符串 / 注释 / 数字 四类着色，其余 plain。
 * 仅做展示层着色，不新增语法解析依赖。
 */

export type HighlightTokenType = "keyword" | "string" | "comment" | "number" | "plain";

export interface HighlightToken {
  text: string;
  type: HighlightTokenType;
}

const KEYWORDS = [
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "break", "continue", "import", "from", "export", "default", "class", "new",
  "try", "catch", "finally", "throw", "async", "await", "type", "interface",
  "enum", "def", "elif", "print", "lambda", "True", "False", "None", "and",
  "or", "not", "in", "is", "switch", "case", "typeof", "instanceof", "void",
  "delete", "do", "static", "extends", "super", "this", "null", "undefined",
  "true", "false",
];

const PATTERN = [
  String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*`,
  String.raw`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|` + "`(?:\\.|[^`\\\\])*`",
  String.raw`\b\d+(?:\.\d+)?\b`,
  String.raw`\b(?:${KEYWORDS.join("|")})\b`,
].join("|");

const TOKEN_RE = new RegExp(PATTERN, "g");

/** 将代码文本切分为着色 token；无匹配时返回整段 plain。 */
export function highlight(code: string): HighlightToken[] {
  if (!code) return [];
  const out: HighlightToken[] = [];
  let pos = 0;
  for (const m of code.matchAll(TOKEN_RE)) {
    const index = m.index ?? 0;
    if (index > pos) out.push({ text: code.slice(pos, index), type: "plain" });
    const text = m[0];
    const type: HighlightTokenType =
      /^(\/\/|\/\*|#)/.test(text) ? "comment" :
      /^("|'|`)/.test(text) ? "string" :
      /^\d/.test(text) ? "number" :
      "keyword";
    out.push({ text, type });
    pos = index + text.length;
  }
  if (pos < code.length) out.push({ text: code.slice(pos), type: "plain" });
  return out;
}
