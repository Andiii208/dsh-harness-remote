# @dsh-remote/harness-plugin — DSH 宿主配对插件（M2）

在 DSH 宿主侧把「信任围栏」升级为「配对围栏」：宿主生成一次性**配对 token**（默认 15 分钟过期），手机 App 携带 token 访问 `/api`；回环请求保持放行（特权功能继续 loopback-only），**非回环请求必须带有效 token**，否则 `ok:false UNAUTHORIZED`。

## 组件

- `src/token.ts` — `PairingTokenStore`：签发/校验/过期/吊销（纯 TS，可注入时钟与随机源）。
- `src/gate.ts` — `decideAccess` 访问决策 + `extractToken` 头解析（纯函数）。
- `src/plugin.ts` — `createPairingPlugin`：接线骨架（issueToken / revoke / authorize / extractToken）。

## 安装（user patch 层，不改 DSH 源码）

```bash
pnpm --filter @dsh-remote/harness-plugin build
```

1. 构建产物 `dist/` 供宿主加载。
2. 在 `<harness-home>/profiles/<profile>/cordis.patch.yml` 按宿主插件约定声明本插件入口（⚠️ 插件接缝细节以 DSH rc.5 插件文档为准——见下方校准说明）。
3. 重启 DSH；通过宿主命令/接口调用 `issueToken()` 获取一次性 token，展示二维码或文本给手机 App。

## ⚠️ 校准说明（诚实声明）

- DSH 为 developer preview（`0.1.0-rc.5`），插件加载/钩子细节可能变化；本包按自洽契约交付（协议层闭环由 mock-harness 配对场景覆盖）。
- 拿到真实 harness 后：校准插件挂接点（中间件注入位置）、token 头格式、回环判定，并重录 conformance fixtures 回归。

## 安全边界

- token 仅存内存（重启失效）；15 分钟过期；单 token 轮换（新签发即吊销旧的）。
- token 是短期门禁凭证，非长期密钥；M3 中继升级为 E2E 密钥交换。
- 日志绝不输出 token。
