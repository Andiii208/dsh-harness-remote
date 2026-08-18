// dsh-harness-remote 网页客户端打包：client/index.jsx → client/client.js
// 打包后由 DSH client module loader（window.__ModuleLoader__.load）加载。
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const sourceDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(sourceDir, '..');
const outputPath = resolve(packageRoot, 'client/client.js');
const loaderId = process.env.DSH_REMOTE_CLIENT_ID ?? 'dsh-harness-remote';

const result = await build({
  entryPoints: [resolve(sourceDir, 'index.jsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome100'],
  jsx: 'transform',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  write: false,
  minify: process.env.NODE_ENV === 'production',
  legalComments: 'none',
});

const bundled = result.outputFiles?.[0]?.text;
if (!bundled) throw new Error('esbuild did not produce a client bundle');

const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(loaderId)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    // DSH client module system 以模块形式提供 react；classic JSX 会生成
    // 裸 React.createElement 调用，因此这里必须把 React 绑定到 bundle 作用域。
    var React = require("react");
${bundled}
    return module.exports;
  }
});
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, wrapped, 'utf8');
console.log(`Wrote ${outputPath}`);
