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
});

await build({
  ...common,
  entryPoints: ["src/cli.ts"],
  outfile: "dist/cli.js",
  banner: { js: "#!/usr/bin/env node\n" },
});

// 设置页 web 客户端（client/index.jsx → client/client.js，DSH ModuleLoader 包装）。
await import("../client/build.mjs");
