# PROGRESS

## Phase 9：远程优先 + 插件能力面 + 设置迁移 + 一键远程（完成，2026-08-18）
- R1 远程优先首屏：`apps/mobile/app/index.tsx` 默认远程模式；横幅文案随模式切换，[远程模式]/[局域网模式] 分段选择；远程模式只填 relay 地址（裸主机自动补 `ws://…:4090`）+ 可选 6 位配对码；LAN 保留主机/端口/token（token 收进高级）。`relayMode.ts` 增补裸主机/默认端口/IPv6 规则 + 单测（mobile 113）。
- R5a `relay.pair.code`/`relay.pair.code.ack`：协议加类型与 `makePairCode`；relay 服务器处理（未认证拒绝、console 取码、码一次性）；`RelayClient.requestPairCode()`；联调脚本改走协议取码。protocol 110 / relay 34 / harness-plugin 30（阶段内计数）。
- R2 插件能力面：protocol `plugin.ts`（PluginCommand/PluginSetting/PluginListResult + lenient 读取器）；harness-plugin `plugin-catalog.ts` 参考实现（DSH 注册表接缝 + 本地 manifest 目录 + 默认清单）；mock-harness `fixtures/plugins.json`；App 会话长按菜单动态展示插件指令 + `app/plugins.tsx` 插件页（单屏克制）。
- R3 设置迁移：设置页扩展为「连接 / 模型与权限 / 插件 / 显示 / 关于」；`host.settings.get/set` 能力可探测（读不到自动隐藏）；模型选择、思考强度、上下文容量细进度条、审批权限状态；App 本地字体大小（小/标准/大，影响聊天正文与列表正文）；检查更新走 GitHub Releases 对比。protocol `host-settings.ts` + mock `fixtures/settings.json`。
- R4 一键远程：`harness-plugin/src/cli.ts` 提供 `dsh-remote remote`：自动启动内置 relay（4090 被占用时自动选空闲端口）→ 注册 console → `relay.pair.code` 取 6 位码 → 打印小白卡片（relay 地址 + 配对码 + 操作说明）→ 配对成功提示 `已配对 device-xxx` → Ctrl+C 关闭。package.json 增加 bin 与 relay workspace 依赖。
- 动效：模式切换/表单 180–240ms 淡入淡出 + 轻上移；主按钮按下 scale 0.98 + opacity 0.85；尊重系统「减弱动态」。
- 集成联调：`.shots/relay-pair-integration.mjs` 组合 sessions/settings/plugins fixtures + relay + mock-harness + console；Playwright 在连接页输入 `127.0.0.1` + 6 位码完成配对，截图 `.shots/relay-mode-01-home.png` … `.shots/relay-mode-06-paired-home.png`（含设置页/插件页），find 证据 `.shots/relay-mode-find.txt`（插件指令/Ping 宿主/通知级别）。
- 全仓回归：protocol 110 / mobile 113 / harness-plugin 30 / relay 34 / mock-harness 29 / capture 24，build/typecheck/test 全绿；CI 最新 run 全绿。
- 明确不纳入：dsh-remote 自身不做插件宿主；用户 DIY 插件通过 DSH 插件系统 + R2 能力面在手机端呈现。

## Phase 8：UI 精简美化（DeepSeek 手机版风格，完成）
- 连接页：首屏只保留品牌、状态、主机/端口/可选配对码与主连接按钮；「高级」折叠 token；历史主机默认折叠；自动发现/扫码为次级文字入口。
- 引导页：3 步改为 1 屏（鲸鱼 + harness remote + 一句话 + 开始使用）。
- 会话页：标题「会话」+ 状态；搜索默认收起；pending 改轻量文字行；行只留标题/最近消息/时间，workspace 仅在分组头；上下文仅 ≥70 显示。
- 聊天页：移除 GoalCard 大卡与状态眉标，顶部小字会话标题 + goal 小 pill；输入区只保留输入框 + 圆形发送；暂停/恢复仅流式时显示为小文字按钮。
- 审批页：中文标签，去粗色条，底部只保留批准/拒绝主按钮，跳过提问弱化。
- 设置页：合并为一张主设置卡 + 关于分组，去掉英文 mono 眉标。
- 导航标题：会话/对话/请求/设置，系统字体、无阴影。
- Android 真机（Expo Go，MXW-AN00 Android 10）实测：连接页加载、连接到 mock-harness、会话列表显示 2 个 mock session（截图 `.shots/android-main.png` / `.shots/android-sessions.png`）。
- 文档截图：docs/screenshots/connect.png、sessions.png、chat.png 已同步为新 UI。

## Phase 7：M3.7 发布闸门前置（无真机部分完成）
- CI 升级 Node 24（`.github/workflows/ci.yml`）。
- `pnpm audit --prod`：仍为 3 个 Expo 工具链传递漏洞（image-size ≤2.0.2 ×2 high、uuid <11.1.1 ×1 moderate），均非运行时；记录在 SECURITY.md 发布检查清单，等待 Expo SDK 上游升级。
- `relay/src/sqlite-store.ts`：可选 SQLite 持久化 store（`node:sqlite`，`createSqliteRelayStore(path)`；`RelayServerOptions.store` + CLI `--store <path>`）。测试 3 个（重开保留 client/pair、online 持久化、配对码一次性/TTL）。relay 测试 29（原 26）。
- `relay/test/relay-multi.test.ts`：多 console/device 隔离测试 2 个（在线路由只投配对 peer、离线队列按 peer 隔离）。relay 测试 31（原 29）。
- TLS 部署实测：Docker Desktop daemon 未启动，已写 BLOCKED.md；启动后需按 MANUAL 2.8 用 Caddy 容器验证 WSS。

## Phase 6：M3.5 中继配对闭环 + 密钥持久化（完成）
- T1 protocol：`RelayTransportOptions` 新增 `pairCode`/`onPairAck`；未注入私钥时自动生成 ECDH P-256 keypair，register 携带 publicKey；配对码握手后发 `relay.pair` 并等 `relay.pair.ack`，派生会话密钥后启用加密数据面；未配置 pairCode 时明文路径不变。protocol 测试 100（原 97，+3）。
- T2 relay：`relay.pair` 成功后复用 `relay.pair.ack` 向被配对 console 推送 `{deviceId, peerPublicKey?}`；console 离线则入离线队列，重连 drain 投递；新增 `pair_notify` audit。relay 测试 26（原 24，+2）。
- T3 mobile：新增 `src/relay/relayDeviceStore.ts`（SecureStore → localStorage → 内存降级）持久化 deviceId/privateKeyJwk/publicKeyJwk；`ConnectionProvider` 使用持久化身份并支持可选 `pairCode`、`onPairAck`、`relayPeerId`；连接页 relay 模式显示 6 位配对码输入框，配对成功显示 `consoleId · paired`。mobile 测试 109（原 106，+3）。
- T4 harness-plugin：`RelayClient` 未注入私钥时自动生成 keypair，register 携带公钥；收到 `relay.pair.ack` 通知后派生会话密钥并回调 `onPaired`；M3.2 注入路径保持。harness-plugin 测试 23（原 21，+2）。
- 联调：`.shots/relay-pair-integration.mjs` 启动 relay + mock-harness + console（harness-plugin RelayClient）并打印 6 位配对码；Playwright 在连接页输入 `ws://127.0.0.1:4090` + 配对码完成配对，Sessions 出现 2 个 mock session；截图 `.shots/relay-pair-connect.png`/`.shots/relay-pair-sessions.png`，证据 `.shots/relay-pair-find.txt`/`.shots/relay-pair-sessions-find.txt`/`.shots/relay-pair-route-payload.txt`（route payload 仅 `{to, ciphertext, nonce}`）。
- 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿；测试数：protocol 100 / mobile 109 / harness-plugin 23 / relay 26 / mock-harness 29 / capture 24。真机 APNs/FCM 留待设备/账号窗口。

## Phase 5：M3.4 硬化与自部署（完成）
- `relay/src/rate-limit.ts`：令牌桶（默认 120/分钟、突发 240），超限 E_RATE；`relay-server.test.ts` 15 测试 + `rate-limit.test.ts` 3 测试。
- 审计日志：`audit` 回调（默认 JSON 行，仅 event/from/to/ts/ok，无 payload）。
- 版本协商：hello.ack 带 relayVersion/protocolVersion，不兼容附 compatible:false。
- `docs/MANUAL.md` 增补 relay 部署章节（TLS 终止、Caddy/Docker 示例、配置项）；README 更新 M3 状态。
- 全仓回归绿：protocol 97 / mobile 106 / harness-plugin 21 / relay 24 / mock-harness 29 / capture 24。真机推送与 relay 真机回归留待设备/账号窗口。

## Phase 4：M3.3 推送与离线队列（完成）
- `relay/src/push.ts`：PushProvider 接口 + MockPushProvider + NoopPushProvider（真推送留待设备/账号窗口）。
- `relay/src/queue.ts`：离线队列（TTL 2 分钟、每 peer 上限 50、满丢最旧、drain/expire）。
- relay 服务器：目标离线 route 入队 + push wake（失败降级），重连后 drain 投递；relay-server.test.ts 12 测试 + push-queue.test.ts 6 测试。
- `RelayTransport` / `RelayClient` 增加 pushToken 注册；mobile 增 Expo push token 守卫获取（Expo Go 降级 null）并传入 RelayTransport。
- 测试计数：relay 18 / protocol 97 / mobile 106 / harness-plugin 21；全仓 build/typecheck/test 全绿。

## Phase 3：M3.2 E2E 加密（完成）
- `packages/protocol/src/relay-crypto.ts`：ECDH(P-256) + HKDF-SHA256 + AES-256-GCM 纯函数（generateRelayKeyPair/deriveRelaySessionKeys/sealRelayPayload/openRelayPayload，WebCrypto 注入可测）+ 7 单测。
- `RelayTransport` 接入加密数据面（配置 privateKeyJwk/peerPublicKeyJwk 时 seal/open；未配置保持 M3.1 明文路径）；relay-transport.test.ts 新增 3 测试，protocol 96 tests 全绿。
- `harness-plugin/src/relay-client.ts` 同步接入加密（send 密封、收到密文解密回调、篡改触发 onError）+ 2 新测试；harness-plugin 20 tests 全绿。
- relay 服务器只读 `payload.to`，ciphertext/nonce 透明转发不解析；pair.ack 增补 peerPublicKey；relay-server.test.ts 增补 2 测试，relay 9 tests 全绿。
- 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿；SECURITY.md 更新 M3 为「E2E 已实现」；RELAY-M3.md 回填 M3.2 实现现状。

## Phase 2：M3.1 中继控制面 MVP（完成）
- 新包 `relay/`：credential（HMAC 短时凭证）、store（内存注册/配对/在线）、server（WS 控制面 hello/register/pair/route/heartbeat + /healthz；日志仅元数据）、cli（relay --port 4090）；7 单测（含安全红线：未认证 E_AUTH / 未配对 E_PAIR / 过期凭证被拒）。
- `packages/protocol/src/relay.ts` 增补：makeHello/makeRegister/makePair/makeHeartbeat 构造器；RelayTransport（单 WS、hello/register 握手、?credential=/?peerId=、M3.1 明文 relay.route 转发；unary 请求/响应匹配）。relay-transport.test.ts 7 单测，protocol 86 tests 全绿。
- `apps/mobile`：连接页 HOST 支持 relay:// / ws:// / wss:// URL（Relay 模式，端口忽略）；ConnectionProvider 自动选 RelayTransport，LAN 路径不变；relayMode 纯函数 + 3 单测；mobile 103 tests 全绿。
- `harness-plugin/src/relay-client.ts`：出站中继客户端接线桩（注册/心跳/收发信封）+ 4 单测。
- 联调：`.shots/relay-integration.mjs`（relay + mock-harness + console 桥）跑通；手机经 relay 看到 2 个 session（截图 `.shots/relay-connect.png`、`.shots/relay-sessions.png`，find 证据 `.shots/relay-sessions-find.txt`）。
- 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿；RELAY-M3.md 已回填「实现现状」；README 已同步。

## Phase 1：流式真中断（完成）
- 已完成：`RpcClient.interrupt(sessionId)`（`/api/session.interrupt`，与 `unary` 同构）；`Connection.interrupt?` 可选字段 + `LanTransport` 接线；`ConnectionApi.interruptStream` + 聊天页暂停按钮「先发中断，失败回退本地暂停」分流（成功提示「已发送中断请求」）。
- 宿主侧接线桩：`harness-plugin/src/interrupt.ts`（入参校验 + 响应构造，待 DSH 真机实现接入）。
- 联调 fixture：`mock-harness/fixtures/sessions.json` 增补 `session.interrupt` 成功响应与 `session/event interrupted` 帧；`.shots/phase1-interrupt-fixture.json` 为截图专用长流 fixture。
- 验证：mobile test 100 全绿 / protocol test 79 全绿 / mock-harness 29 / harness-plugin 14；全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿；Web 截图 `.shots/phase1-interrupt.png`（点击暂停后显示「已发送中断请求」，find 证据 `.shots/phase1-interrupt-find.txt`）。
- BLOCKED.md 唯一阻塞项已关闭。

## 任务 0 开工回执（2026-08-17 实测）
- 目标：按 C→A→B→M3(设计)→质量工程 顺序交付。
- 基线核对：mobile test 85 全绿 / mobile typecheck 退出 0 / protocol test 73 全绿。
- dist-web-v7 可重建（expo export 成功，仅 metro 缓存 warning）。
- 最大风险：静态导出下 Web 路由/截图验证受 SPA fallback 限制；协议无主动中断 RPC（流式暂停只能本地渲染）。

## C 审批流程（进行中 → 基本完成）
- 已完成：approvalHistoryStore 纯 TS + 单测（4）；/approval 列表页（多选批量批准/拒绝、提问批量跳过）；/approval/history 历史页（时间倒序）；设置页入口；sessions banner 改跳 /approval。
- respond 成功后写入历史；通知深链沿用 approval/:rpcId。
- 验证：mobile test 89 全绿；typecheck 0；浅深截图已存 .shots/approval-light.png、approval-dark.png。
- 待办：提交 feat commit。

## A 会话列表（完成）
- 已完成：sessionViews 纯函数（filterSessions/groupByWorkspace/pressureTier）+ 5 单测；sessions.tsx 搜索框（v7 Field）、SectionLabel 组头、miniBar 分档（<70 success / 70–85 warn / ≥85 danger）+ 文案。
- 验证：mobile test 94 全绿；typecheck 0；浅深截图 .shots/sessions-light.png、sessions-dark.png。
## B 聊天体验（完成）
- 已完成：highlight(code, lang→已并入 highlight 四类着色) 纯函数 + 3 单测；MessageBubble 长按操作菜单（复制全文/按代码块复制）；代码块默认展开 + 折叠按钮 + 轻量高亮；流式本地暂停（协议无主动中断 RPC，见 BLOCKED）。
- 验证：mobile test 97 全绿；typecheck 0；浅深截图 .shots/chat-light.png、chat-dark.png（含代码块高亮/折叠按钮），sessions 截图已重取含压力文案。
## M3 中继（完成设计+协议最小验证）
- 已完成：docs/design/RELAY-M3.md（控制面协议/注册/配对/路由/心跳/错误码、E2E 密钥交换、RelayTransport 签名与 App 接入点、部署与安全边界、M3.1–M3.4 计划）；packages/protocol/src/relay.ts 新增类型 + parseRelayEnvelope/isRelayEnvelope/normalizeRelayError（新增导出，未改已有行为）+ 4 单测。
- 验证：protocol build 通过；protocol test 77 全绿（≥76）；protocol typecheck 0；mobile test 97 / typecheck 0 不降。
- 评审前不写 relay 服务器实现。
## 质量工程（完成）
- README 功能清单已同步（审批/搜索分组压力/聊天体验/M3 设计）。
- 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿（build 先行）。
- 截图回归：.shots/approval-light.png、approval-dark.png、sessions-light.png、sessions-dark.png、chat-light.png、chat-dark.png（不入库）。
- 断线重连/保活已有单测（autoReconnect/keepalive/pipeline）未涉及本次改动，无需补。
