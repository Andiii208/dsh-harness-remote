# PROGRESS

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
