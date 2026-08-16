# 贡献指南（CONTRIBUTING）

感谢你愿意参与 dsh-remote！这是一个开源社区产品：手机远程连接 DeepSeek Harness（DSH）。代码与数据都留在用户本机，手机只是视口。

## 开发环境

```bash
pnpm install          # 装全仓依赖（pnpm 11）
pnpm -r typecheck     # 全仓类型检查
pnpm -r test          # 全仓测试（vitest）
```

- Node ≥ 22（协议包用原生 fetch/WebSocket）。
- 改协议相关代码前先读 `docs/PROTOCOL.md` 与 `packages/protocol` 的现有实现。

## 仓库结构

```
apps/mobile        Expo RN App（页面 + SessionStore + 通知/保活 + 配对）
packages/protocol  协议核心（纯 TS，零运行时依赖）
mock-harness       DSH /api + WS 测试桩（回放 conformance fixtures）
tools/capture      录制真实 DSH 流量 → fixtures
harness-plugin     DSH 宿主配对插件（M2）
docs               架构 / 协议 / 兼容矩阵 / 安全 / 设计系统 / 联调清单
```

## 协议改动流程（重要）

1. 先在 `mock-harness/fixtures/` 定义/更新契约（fixture 通过 `@dsh-remote/capture` 校验）。
2. 协议层改动必须有单测（envelopes/codec/rpc/ws/loop/transport 各层）。
3. 更新 `docs/PROTOCOL.md` 与 `docs/COMPATIBILITY.md`（文档与实现必须一致，评审会核对）。
4. 有真实 DSH 环境时：`tools/capture record` 重录 fixtures，diff 协议漂移。

## 提交与 PR

- 提交信息用 conventional commits（`feat:` / `fix:` / `docs:` / `test:` / `chore:`），可带作用域（`feat(protocol):`）。
- 每个 PR 保持小、聚焦；先跑 `pnpm -r typecheck && pnpm -r test` 全绿再提。
- CI（GitHub Actions）会在 push/PR 上自动跑 typecheck + test。

## Web 预览与视觉 QA（改 UI 后必做）

无真机时用 web 预览验证 UI 渲染与交互：

```bash
pnpm --filter mock-harness build && node mock-harness/dist/cli.js --port 3080
cd apps/mobile && npx expo export --platform web --output-dir dist-web
# 任意静态服务器托管 dist-web（SPA 回退到 index.html），如 node 脚本或 npx serve
```

然后用 playwright 驱动页面（连接 127.0.0.1:3080 → 会话 → 审批 → 聊天），截图对照 `docs/design/UI-SYSTEM.md` 逐屏检查。注意 web 预览的限制：通知/保活/安全存储是原生能力，web 上会优雅降级（console.warn，不崩溃）；审批/提问经会话页「待处理请求」横幅进入。

## 行为准则

见 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。安全问题走 [SECURITY.md](SECURITY.md) 的私密披露渠道，不要开公开 issue。
