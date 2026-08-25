#!/usr/bin/env node
/**
 * lint-font-tokens.mjs — 设计令牌走查工具（审计 P1-3）。
 *
 * 扫描 apps/mobile/src 与 app 下的 fontSize 原始值，对比 v8 字号白名单
 * （font 阶梯：10/12/13/14/15/20/24/28），报告越界项。退出码：
 *   --strict 时存在违规 → 1（CI 门禁）；否则 0（走查报告模式）。
 *
 * 用法：node apps/mobile/scripts/lint-font-tokens.mjs [--strict]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WHITELIST = new Set([10, 12, 13, 14, 15, 20, 24, 28]);
const strict = process.argv.includes("--strict");

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".expo") continue;
      out.push(...walk(p));
    } else if (/\.(tsx|ts)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "app"))];
const violations = [];
const re = /fontSize:\s*(\d+(?:\.\d+)?)/g;
// 图标字形（⚙/⋯/›/⌄ 等）不属于字体阶梯，按样式名跳过。
const GLYPH_STYLE = /(icon|arrow|chevron|glyph|emoji|dot)/i;
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  let m;
  while ((m = re.exec(text)) !== null) {
    const v = Number(m[1]);
    if (WHITELIST.has(v)) continue;
    // 向前找最近的样式名（`name: {`）判断是否图标字形。
    const before = text.slice(0, m.index);
    const styleMatch = [...before.matchAll(/(\w+):\s*\{/g)].pop();
    const styleName = styleMatch ? styleMatch[1] : "";
    if (GLYPH_STYLE.test(styleName)) continue;
    const lineNo = text.slice(0, m.index).split("\n").length;
    violations.push({ file: relative(ROOT, file), value: v, line: lineNo, style: styleName });
  }
}

const byFile = new Map();
for (const v of violations) {
  const list = byFile.get(v.file) ?? [];
  list.push(v);
  byFile.set(v.file, list);
}

console.log(`字号白名单: [${[...WHITELIST].join(", ")}]（图标字形样式自动跳过）`);
console.log(`扫描文件: ${files.length}，越界项: ${violations.length}`);
for (const [file, items] of [...byFile.entries()].sort()) {
  const lines = items.map((v) => `L${v.line} ${v.value}(${v.style})`).join(" ");
  console.log(`  ${file}: ${lines}`);
}

if (strict && violations.length > 0) {
  console.error(`\n✗ 存在 ${violations.length} 处字号越界（--strict 门禁失败）`);
  process.exit(1);
}
console.log(strict ? "\n✓ 字号白名单合规" : "\n（报告模式：违规项见上，修复后可用 --strict 门禁）");
