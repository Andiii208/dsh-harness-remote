/**
 * dsh-harness-remote 打包脚本：
 * - lib/index.js  = 宿主插件入口（apply 等），把 relay + @dsh-remote/protocol + qrcode 全部打进单文件。
 * - dist/cli.js   = `dsh-remote remote` CLI（单文件，带 shebang）。
 *
 * 发布后不依赖 workspace 包；qrcode / qrcode-terminal 也一并打入，保持“单包即用”。
 */
import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("lib", { recursive: true }).catch(() => {});
await mkdir("dist", { recursive: true }).catch(() => {});

// esbuild 的 ESM 输出会为 CJS 依赖生成 __require()；Node ESM 里没有 require，
// 会导致 "Dynamic require of ... is not supported"。这里在 bundle 顶部注入
// createRequire，让 __require 对内置模块（events/fs/...）可用。
const esmRequireBanner = 'import { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);\n';

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true,
  logLevel: "info",
};

await build({
  ...common,
  entryPoints: ["src/index.ts"],
  outfile: "lib/index.js",
  banner: { js: esmRequireBanner },
});

await build({
  ...common,
  entryPoints: ["src/cli.ts"],
  outfile: "dist/cli.js",
  // 源文件已有 shebang，esbuild 会自动保留到第一行；这里只注入 require shim。
  banner: { js: esmRequireBanner },
});

// 设置页 web 客户端（client/index.jsx → client/client.js，DSH ModuleLoader 包装）。
await import("../client/build.mjs");
