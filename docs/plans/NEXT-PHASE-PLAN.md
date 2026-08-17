# 后续发展计划（NEXT PHASE PLAN）

> 制定日期：2026-08-17。基线：main `ef27fc7`，工作区干净；mobile 97 用例、protocol 77 用例全绿。
> 原则：价值 × 依赖排序；协议只做加法不改旧行为；每阶段测试 + 截图自证；每阶段 ≥1 条 conventional commit；卡住写 BLOCKED.md 跳过。
> 当前唯一 BLOCKED：流式暂停无协议级中断 RPC（本地暂停渲染，远端仍继续）。

---

## Phase 1：流式真中断（关闭唯一 BLOCKED，1 个窗口）

**目标**：把聊天页「暂停流式」从本地冻结升级为真实中断：有连接时发 `session.interrupt` RPC，失败才回退本地暂停并明确提示。

**范围/文件**
- `apps/mobile/src/transport/ConnectionProvider.tsx`：`ConnectionApi` 增加 `interruptStream(sessionId): Promise<void>`
- `apps/mobile/app/chat/[sessionId].tsx`：暂停按钮逻辑改为「先发中断，成功/失败分流」
- `packages/protocol/src/rpc.ts`：`RpcClient` 增加 `interrupt(sessionId)`（内部走 `/api/session.interrupt`，与 `unary` 同构，不改旧行为）
- `packages/protocol/src/transport.ts`：`Connection` 增加**可选** `interrupt?` 字段；`LanTransport` 返回该字段（测试假连接不破坏）
- `mock-harness/fixtures/sessions.json`：`unaryResponses` 增加 `session.interrupt` 成功响应；`wsFrames` 增加中断场景（供 Web 联调）
- 测试：`packages/protocol/test/rpc.test.ts` 增补 `session.interrupt` 路径（≥2）；mobile 增补 `interruptStream` 离线错误分支（≥1）

**验收**
- mobile test ≥ 98、protocol test ≥ 79、双 typecheck 0
- Web 截图：聊天页点暂停后显示「已发送中断请求」（或 mock 联调看到 `session.interrupt` 被调用）
- `BLOCKED.md` 该条改为已关闭；若 DSH 宿主侧暂无 `session.interrupt` 实现，在 harness-plugin 只做接线桩并保留备注

**风险**：真实 DSH 是否支持 `session.interrupt` 未验证——设计成「发送失败自动回退本地暂停」，不会比现状差。

---

## Phase 2：M3.1 中继控制面 MVP（最大窗口，2–3 个窗口）

**目标**：按 `docs/design/RELAY-M3.md` 把 relay 从占位做到可联调：手机 App 经 relay 看到在线与会话列表（数据面暂为 WSS/TLS 明文转发，**仅限开发联调**，M3.2 前不发布）。

**范围/文件**
- 新包 `relay/`：
  - `package.json`（依赖 `ws`——仓库已有，非新生态）、`tsconfig.json`、`vitest.config.ts`
  - `src/server.ts`：WS 控制面（`hello/register/pair/heartbeat` + 错误码）+ HTTP 健康检查
  - `src/store.ts`：内存版 device/console/pairing/短时凭证存储（纯 TS 可单测）
  - `src/credential.ts`：短时凭证签发/校验（`node:crypto` HMAC）
  - `src/cli.ts`：`relay --port 4090` 启动入口
  - `test/relay-server.test.ts`（≥5）
- `packages/protocol/src/relay.ts` 增补：`RelayTransport`（使用全局 `WebSocket`，注入 `WsCtor` 测试）、请求构造器（`makeHello/makeRegister/makePair/makeHeartbeat` 纯函数）
  - `test/relay-transport.test.ts`（≥4）
- `apps/mobile/src/transport/ConnectionProvider.tsx`：连接模式选择——`LanTransport` / `RelayTransport`（显式切换或 URL 前缀 `relay://`，不碰现有 LAN 路径）
- `apps/mobile/app/settings.tsx` 或连接页：Relay 入口（输入 relay URL，最小改动）
- `harness-plugin/src/relay-client.ts`：出站中继客户端（注册/心跳/收发信封；只做接线桩，真实 DSH 数据面由插件宿主适配）
- `docs/design/RELAY-M3.md`：实现后回填「实现现状」小节

**验收**
- 新增 `relay/` 包 build/typecheck/test 全绿
- 协议/mobile/harness-plugin 全量测试不降；全仓 `pnpm -r build && typecheck && test` 绿
- Web 截图：连接页/设置页出现 Relay 模式；本机 relay + mock-harness 联调，手机列表看到 session（截图留 `.shots/relay-*.png`）
- 安全红线：relay 日志不含 DSH 内容明文；短时凭证过期被拒；未配对路由被拒（单测覆盖）

**风险/边界**：relay 包新增 `ws` 依赖、harness-plugin 新增 relay 出站连接——这是 M3 必需；若评审不接受依赖则写 BLOCKED 改用原生 WebSocket。

---

## Phase 3：M3.2 E2E 加密（依赖 Phase 2，1–2 个窗口）

**目标**：`relay.route` 只转发密文；relay 无法读 DSH 数据。

**范围/文件**
- `packages/protocol/src/relay-crypto.ts`：ECDH(P-256) + HKDF + AES-256-GCM 纯函数（注入 WebCrypto，可单测）；信封加解密 `sealRelayPayload/openRelayPayload`
- `packages/protocol/test/relay-crypto.test.ts`（≥6：握手派生一致、篡改失败、双方向密钥独立、重连复用）
- `relay/`：转发逻辑不解析 `ciphertext/nonce`，只读 `to`
- `apps/mobile`：RelayTransport 接入加密层；`harness-plugin` 同
- 抓包/日志验证：relay 端只能看到信封元数据

**验收**
- 单测证明 relay 无明文；篡改信封被拒；全仓测试不降
- `docs/SECURITY.md` 更新 M3 状态为「E2E 已实现」

---

## Phase 4：M3.3 推送与离线队列（依赖 Phase 3）

**目标**：relay 检测 peer 离线后经 APNs/FCM 唤醒并投递暂存信封。

**范围/文件**
- `relay/src/push.ts`：APNs/FCM 接口 + 注入桩（真推送另开窗口）
- `relay/src/queue.ts`：离线暂存（TTL 默认 2 分钟）
- `harness-plugin`：推送 token 注册；`apps/mobile`：Expo push token 上报（需 development build）
- 测试：离线唤醒/暂存过期/推送失败降级

**验收**：mock push 联调闭环；真机推送留待设备/账号窗口。

---

## Phase 5：M3.4 硬化与自部署（发布闸门）

**目标**：可自部署、可运维。
- TLS 终止说明、Docker/Caddy 示例、速率限制、审计日志、版本协商
- `docs/MANUAL.md` 增补 relay 部署章节；README 更新 M3 状态
- 全仓回归 + 真机回归

---

## 跨阶段质量工程（每阶段收尾固定动作）
1. README/相关文档同步
2. 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test`
3. Web 截图回归存 `.shots/`
4. 每阶段 ≥1 条 conventional commit
5. 协议改动后先 `pnpm --filter @dsh-remote/protocol build`

---

## 建议执行节奏
- **本窗口**：只做 **Phase 1**（最小、直接消 BLOCKED，预计 1 个窗口）
- **下一窗口**：开 **Phase 2**（M3.1 是最大的架构增量，需要完整窗口）
- **再往后**：Phase 3 → 4 → 5 顺序推进，每阶段独立验收
