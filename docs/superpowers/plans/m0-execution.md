# dsh-remote M0 执行计划（monorepo 骨架 + 协议核心 + 测试桩 + 文档 + App 壳）

- 日期：2026-08-16
- 规格来源：`docs/superpowers/specs/2026-08-16-dsh-remote-mobile-design.md`（v0，已确认）
- 分支策略：直接在 `main` 上提交（用户已同意）
- 工作区（git-ignored）：`.superpowers/sdd/m0-execution/`（ledger / briefs / reports / review packages）

## Global Constraints（所有任务与评审的绑定约束）

1. 协议基线：DSH harness `0.1.0-rc.5`；宽容解码——未知 key 忽略，未知事件/帧/卡片类型降级为 `Unknown*` 透传，线上层永不因未知数据崩溃。
2. HTTP 状态码只是载体；业务失败以 `ok:false` + 类型化 error code 到达。
3. WebSocket 双流仅下行，客户端绝不发送（发送即 1008 断连）。
4. 特权功能（设置/凭据/宿主原生方法）loopback-only；网络连接时 app 只读呈现 + 横幅。MVP 不做设置/凭据/子代理目录。
5. `packages/protocol` 为纯 JS TS 包，零 RN/平台依赖；全仓 TypeScript strict。
6. 许可证 MIT；仓库结构严格遵循设计文档 §3.1。
7. 每个包/工具含测试（vitest），测试验证真实行为；验收命令输出须干净（无 stray 警告）。

## 任务列表

### Task 1 — monorepo 根骨架
- 内容：根 `package.json`（private, workspaces 由 pnpm-workspace.yaml 管理, scripts: build/test/typecheck）、`pnpm-workspace.yaml`（apps/*, packages/*, mock-harness, tools/*）、`tsconfig.base.json`（strict, ESM, NodeNext）、`README.md`（项目一句话 + 结构 + 快速开始）、`LICENSE`（MIT）、`.editorconfig`。
- 说明：`.gitignore` 已由控制器预置（含 `.superpowers/`），不要删除或重写为不含该条目的版本。
- 验收：`pnpm install` 在根目录成功；`pnpm -r list` 能识别空 workspace；提交。

### Task 2 — packages/protocol：包骨架 + envelopes + codec + dto
- 内容：`packages/protocol` 包（package.json name `@dsh-remote/protocol`, vitest, tsconfig extends 根 base）；`src/envelopes.ts`（client-request / server-response / server-request / client-response 四类信封类型，rpcId 回显语义）；`src/codec.ts`（lenient 解码：未知 key 忽略、未知 type 降级 `Unknown*`、类型校验降级）；`src/dto/`（DSH schemas 的 TS 移植：会话事件、投影 permissions/sessionStats/tokenUsage/contextPressure/goal/todos/plan、server-request 审批/提问、`ok:false` 错误码——按设计文档 §1.3 事实 + rc.5 基线，能确定的字段对齐，不确定的宽容）。
- 验收：`pnpm --filter @dsh-remote/protocol test` 全绿；`tsc --noEmit` 通过；测试覆盖 lenient 降级路径。

### Task 3 — packages/protocol：rpc + ws + transport + loop
- 内容：`src/rpc.ts`（RpcClient：`POST /api/<method>` unary、`POST /api/respond` 应答 server-request、typert 网关 `POST /api/<namespace>/<method>`；fetch 实现、超时、ok:false 类型化错误）；`src/ws.ts`（WsDownlink：`/api/events.mux` + `/api/events.host` 双流、仅下行、合并为一个 AsyncIterable<Frame>）；`src/transport.ts`（Transport/Connection 接口 + LanTransport 实现：host:3080、HTTP POST + WS）；`src/loop.ts`（ConnectionLoop：就绪握手=双流打开 + `host.describe` 成功；断线指数退避 500ms×2 上限 10s + 抖动；重同步；连接状态机连接中/在线/离线/退避）。
- 验收：单测覆盖握手/退避/重同步/仅下行断言（发送即错）；`tsc --noEmit` 通过；全部测试绿。

### Task 4 — tools/capture（先定义 fixture 格式）
- 内容：`tools/capture/`：录制真实 DSH 流量（unary 响应、WS 帧序列、审批/投影）→ conformance fixtures 的工具骨架；**fixture 格式规范（meta + unaryResponses + wsFrames + scenarios，宽容读取）**；CLI（record / validate / --help）。无真实 harness 时以本地临时服务器桩 + 结构校验模式交付。
- 验收：CLI 有 `--help` 与校验命令；对样例 fixture 运行校验通过；测试绿。

### Task 5 — mock-harness（消费 Task 4 的 fixture 格式）
- 内容：`mock-harness/`（TS、vitest）：按 conformance fixtures 回放的 `/api`（unary + respond + typert 网关路由）与 WS（events.mux / events.host）测试桩；从 `@dsh-remote/capture` 的格式读取 fixtures 并内置手写样例（会话列表、流式聊天帧、审批 server-request、投影帧、断连序列）；CLI 可启动监听端口（默认 3080）。
- 验收：`pnpm --filter mock-harness test` 全绿；CLI 启动后 `GET /api/host.describe` 返回 ok:true；WS 可连上 events.mux 并收到帧。

### Task 6 — docs
- 内容：`docs/ARCHITECTURE.md`（含 §3.1 结构图与数据流）、`docs/PROTOCOL.md`（信封/端点/WS 帧/握手/退避/错误码，与 Task 2–3 实现一致）、`docs/COMPATIBILITY.md`（协议版本矩阵、fixtures 回归流程）、`docs/SECURITY.md`（MVP LAN 安全模型、信任围栏、loopback-only 特权、M2 配对预告）。README 补「文档导航」。
- 验收：四个文档与实现一致（评审核对事实）；无死链。

### Task 7 — apps/mobile Expo 壳
- 内容：`apps/mobile/`（Expo SDK 最新稳定 + expo-router + TypeScript）：`app/` 页面——连接（host 输入 + 安全警告横幅）、会话列表、聊天（流式渲染，增量消息块 + 中断/间隙标记）、审批/提问应答页；`src/transport/`（LanTransport 实例化 + ConnectionLoop 状态订阅）、`src/data/`（SessionStore 会话折叠）、`src/ui/`（主题 tokens）；`app.json`（EAS 配置）；metro 与 tsconfig 适配 monorepo（watchFolders/nodeModulesPaths）；依赖 `@dsh-remote/protocol`。
- 验收：`tsc --noEmit` 通过；`npx expo config` 输出合法；在 mock-harness 下可连接并渲染会话列表与流式聊天（实现者以 node 层冒烟或最小 E2E 说明为准，真机演示留给 M0 手动清单）。

## 验证顺序（控制器最后统一跑）

1. `pnpm install`（全仓，后台）
2. `pnpm -r typecheck` 或逐包 `tsc --noEmit`
3. `pnpm -r test`（vitest）
4. mock-harness CLI 冒烟（启动 + host.describe + WS 帧）
5. 增量提交已在各任务完成；最后 `git log --oneline` 汇总
