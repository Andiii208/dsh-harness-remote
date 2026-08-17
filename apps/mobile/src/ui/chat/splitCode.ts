/**
 * splitCode — 转录内容按 ``` 围栏切分为 文本/代码 段（纯函数，可单测）。
 * 仅代码段剥离首行语言标签；文本段原样保留；空段跳过。
 */

export interface CodeSegment {
  code: boolean;
  text: string;
}

export interface CodeSegmentWithLang {
  code: boolean;
  text: string;
  lang?: string;
}

export function splitCode(content: string): CodeSegment[] {
  const parts = content.split("```");
  if (parts.length < 3) return [{ code: false, text: content }];
  const out: CodeSegment[] = [];
  parts.forEach((part, i) => {
    if (part.length === 0) return;
    const code = i % 2 === 1;
    // 代码段：剥离语言标签并 trim；文本段：紧邻围栏的段去掉前导换行。
    const text = code
      ? part.replace(/^[a-zA-Z0-9_+#-]*\n/, "").trim()
      : i > 0
        ? part.replace(/^\n/, "")
        : part;
    if (text.length === 0) return; // 空代码块/空段跳过
    out.push({ code, text });
  });
  return out;
}

/**
 * splitCodeWithLang — 同 splitCode，但保留代码段的语言标签（用于语法高亮）。
 * splitCode 保留原行为不变（已有单测）；新 UI 使用本函数。
 */
export function splitCodeWithLang(content: string): CodeSegmentWithLang[] {
  const parts = content.split("```");
  if (parts.length < 3) return [{ code: false, text: content }];
  const out: CodeSegmentWithLang[] = [];
  parts.forEach((part, i) => {
    if (part.length === 0) return;
    const code = i % 2 === 1;
    if (code) {
      const m = part.match(/^([a-zA-Z0-9_+#-]*)\n?([\s\S]*)$/);
      const lang = m?.[1] && m[1].length > 0 ? m[1] : undefined;
      const text = (m?.[2] ?? part).trim();
      if (text.length === 0) return;
      out.push({ code, text, ...(lang ? { lang } : {}) });
    } else {
      const text = i > 0 ? part.replace(/^\n/, "") : part;
      if (text.length === 0) return;
      out.push({ code, text });
    }
  });
  return out;
}
