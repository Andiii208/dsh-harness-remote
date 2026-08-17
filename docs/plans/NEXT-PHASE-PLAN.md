# 下一阶段计划（NEXT PHASE PLAN v2）

> 制定日期：2026-08-17。基线：main `e15aba3`，工作区干净。
> 全仓绿：protocol 97 / mobile 106 / harness-plugin 21 / relay 24 / mock-harness 29 / capture 24。
> 原则：价值 × 依赖排序；协议只做加法不改旧行为；每阶段测试 + 截图自证；每阶段 ≥1 条 conventional commit；卡住写 BLOCKED.md 跳过。

---

## 0. 已完成的上一阶段（Phase 1–5）

| 阶段 | 内容 | 提交 |
|---|---|---|
| Phase 1 | 流式真中断（`session.interrupt` RPC + 失败回退本地暂停），BLOCKED.md 唯一阻塞项关闭 | `eda3ae5` |
| Phase 2 | M3.1 中继控制面 MVP：`relay/` 包、`RelayTransport`、App Relay 模式、harness-plugin 中继客户端 | `a3ce361` |
| Phase 3 | M3.2 E2E 加密：`relay-crypto`（ECDH P-256 + HKDF + AES-256-GCM）、RelayTransport/RelayClient 密封数据面、relay 密文透明转发 | `7ba2358` |
| Phase 4 | M3.3 推送与离线队列：`relay/src/push.ts` + `queue.ts`、离线入队/TTL/重连投递、pushToken 上报 | `3c5702c` |
| Phase 5 | M3.4 硬化与自部署：速率限制（E_RATE）、审计日志（仅元数据）、版本协商、MANUAL 部署章节 | `28b53b3` |
| CI 修复 | rate-limit 测试改确定性（burst:0），CI 全绿 | `e15aba3` |

---

## 1. 当前缺口（本窗口要解决什么）

1. **M3 配对闭环缺失**：`relay.pair` 服务端已支持，但 App 没有 relay 配对入口；`RelayTransport` 与 `RelayClient` 注册时 `publicKey: null`，不交换 ECDH 公钥；E2E 密钥目前靠 options 注入（`privateKeyJwk/peerPublicKeyJwk`）——这是开发期捷径，不是真实闭环。
2. **deviceId/私钥不持久化**：mobile 的 relay deviceId 在 web 用 localStorage、原生端用内存随机（`ConnectionProvider.tsx` 的 `getRelayDeviceId`）；私钥完全没有持久化。
3. **console 侧收不到配对结果**：relay 服务器 `relay.pair` 成功后只回执给发起方，console 侧没有拿到 device 公钥，无法派生会话密钥。
4. **真机推送/回归未做**：APNs/FCM 目前是 `MockPushProvider`/`NoopPushProvider` 桩；真机需要 development build + 推送账号。**本窗口不做**，列入后续窗口。

---

## 2. 本窗口目标：M3.5 中继配对闭环 + 密钥持久化（纯代码，无需真机）

**目标**：手机在连接页输入 relay URL + 6 位配对码即可完成配对；配对成功后双方自动交换 ECDH 公钥、派生会话密钥，数据面以 E2E 加密运行。未输入配对码时保持现有 M3.1 明文联调路径不变。

### T1 协议层（`packages/protocol`）

- `RelayTransportOptions` 增加：
  - `pairCode?: string`：连接后自动发起 `relay.pair`。
  - `privateKeyJwk?: JsonWebKey`：未提供时 connect 内部用 `generateRelayKeyPair` 自动生成（注入 `crypto` 可测）。
  - `onPairAck?: (ack: { consoleId: string; peerPublicKey: unknown }) => void`：可选回调（mobile 用来拿 consoleId）。
- `connect()` 流程：
  1. 若没有 `privateKeyJwk`，自动生成 ECDH P-256 keypair。
  2. `makeRegister` payload 携带 `publicKey`（不再 `publicKey: null`）。
  3. 若配置了 `pairCode`：在 hello/register 握手完成后发送 `makePair(from, pairCode, from)`（payload 与现有 `makePair` 签名对齐；若 `makePair` 签名是 `(from, code, deviceId)`，deviceId 传自身 from）。
  4. 收到 `relay.pair.ack`：从 payload 取 `consoleId` 与 `peerPublicKey`，调用 `deriveRelaySessionKeys` 派生 `encKey`，设置 peerId = consoleId，启用加密数据面，并回调 `onPairAck`。
- **兼容约束**：未配置 `pairCode` 且未注入 `peerPublicKeyJwk` 时，行为与现在完全一致（M3.1 明文联调路径不破坏）；`peerPublicKeyJwk` 注入路径仍保留。
- 测试（`packages/protocol/test/relay-transport.test.ts` 或新文件，≥3）：
  - 未注入 key 时 register payload 含 `publicKey`（JWK，非 null）。
  - 配置 `pairCode` 后发送 `relay.pair` 信封，字段正确。
  - 收到 `relay.pair.ack`（含 peerPublicKey）后，`unary` 发出的是密文 route（payload 只有 `to/ciphertext/nonce`）。
  - 未配置 `pairCode` 时 unary 仍为明文 route（现有路径回归）。

### T2 relay 服务器（`relay/`）

- `relay.pair` 成功后，除给发起方回 `relay.pair.ack`（已含 `peerPublicKey`）外，**向被配对 console 的在线 socket 推送一条通知**（复用 `relay.pair.ack` 信封，payload 含 `{ deviceId, peerPublicKey }`；或新增专用 type，二选一并写进 RELAY-M3.md）。
- 若 console 离线，把该通知放进离线队列（复用 M3.3 的 `queue`），console 重连后投递。
- 测试（`relay/test/relay-server.test.ts` 增补 ≥2）：
  - console 在线时收到 pair 通知，且 payload 含 device 的 publicKey。
  - console 离线时 pair 通知入队，重连后收到。

### T3 mobile（`apps/mobile`）

- 新增 `apps/mobile/src/relay/relayDeviceStore.ts`（或放 `src/data/`）：持久化 `{ deviceId, privateKeyJwk, publicKeyJwk }`。
  - 原生端用 `expo-secure-store`（参考 `tokenStore.ts` 的守卫写法）；web 端回退 localStorage；不可用时降级为内存（每次生成新 key，不崩溃）。
- `ConnectionProvider.tsx`：
  - relay 模式 connect 前：从 store 读取/生成 deviceId + keypair，把 `privateKeyJwk`、`pairCode`（来自连接页）传给 `RelayTransport`。
  - 支持 `pairCode` 参数（`connect(host, port, token?, pairCode?)` 或扩展 `ConnectionApi.connect` 签名——保持现有调用方兼容）。
- 连接页 `apps/mobile/app/index.tsx`：
  - 当 host 为 relay URL 时，显示可选的 6 位配对码输入框（数字键盘）。
  - relay 模式连接成功后，显示 consoleId/配对成功状态（可用现有 `describe` 或新状态字段，最小改动）。
- 测试（`apps/mobile/test/relayDeviceStore.test.ts` 或类似，≥2）：
  - 存储不可用时降级不抛错。
  - 同一存储键可读取回同一 deviceId/key。
- 现有 mobile 106 测试不降。

### T4 harness-plugin（`harness-plugin/`）

- `RelayClientOptions` 增加：
  - `privateKeyJwk?: JsonWebKey`：未提供时 connect 前自动生成。
  - `onPaired?: (info: { deviceId: string; peerPublicKey: unknown }) => void`。
- `registerPayload()` 携带 `publicKey`（不再 `null`）。
- 收到 pair 通知（T2 定义的信封）后：取 `deviceId + peerPublicKey`，`deriveRelaySessionKeys` 派生 `encKey`，启用加密数据面，并回调 `onPaired`。
- 测试（`harness-plugin/test/relay-client.test.ts` 增补 ≥2）：
  - register payload 含 `publicKey`（非 null）。
  - 收到 pair 通知后发送 route 为密文（payload 只有 `to/ciphertext/nonce`）。

---

## 3. 验收

- [ ] 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿，且各包测试数不低于基线（protocol 97 / mobile 106 / relay 24 / harness-plugin 21 / mock-harness 29 / capture 24）。
- [ ] Web 联调：更新/新增 `.shots/relay-pair-integration.mjs`——启动 relay + mock-harness + console（RelayClient），打印 6 位配对码；Playwright 在连接页输入 `ws://127.0.0.1:4090` + 配对码 → 配对成功 → Sessions 出现 mock session；截图存 `.shots/relay-pair-*.png`。
- [ ] 日志红线：relay 日志只含元数据；route payload 在 E2E 配对成功后只有 `{to, ciphertext, nonce}`（截图或抓包日志为证）。
- [ ] 文档：`docs/design/RELAY-M3.md` 回填 M3.5；`README.md` 里程碑表更新（M3 状态改为「配对闭环已实现」）；`PROGRESS.md` 增补本窗口记录。
- [ ] 提交：每阶段（T1–T4 + 集成）≥1 条 conventional commit。

---

## 4. 建议执行方式

- **依赖顺序**：T1 先行（T2/T3/T4 依赖 T1 的协议类型与行为）→ T2/T3/T4 并行 → captain 做联调/截图/文档/提交。
- **可选 AgentTeams**：captain 用 `deepseek-v4-pro-0813`，子成员用 `deepseek-v4-flash-0731`（模型名与上一窗口一致）。
- **坑位提醒**：
  - 协议改动后先 `pnpm --filter @dsh-remote/protocol build`，mobile/harness-plugin 依赖其 dist。
  - relay rate-limit 集成测试已改为 `burst: 0`（确定性），不要改回 `burst: 2`。
  - mock-harness 默认 fixtures 与 relay 无关；联调脚本参考 `.shots/relay-integration.mjs`（该脚本是 M3.1 明文桥，M3.5 联调脚本需在其基础上加配对码打印与 keypair 注入）。
  - Windows 本地跑 `pnpm -r test` 时 expoGuard/pushToken 等 stderr 是预期降级日志，不是失败。

---

## 5. 后续窗口（不纳入本窗口）

| 窗口 | 内容 | 验收 |
|---|---|---|
| M3.6 真机推送与回归 | 真实 APNs/FCM 接入（替换 MockPushProvider）、EAS development build、Android 真机 relay 连接/断线重连/离线唤醒/通知去重/后台保活 | 真机锁屏可被唤醒并收到审批通知；真机回归全绿 |
| M3.7 发布闸门 | relay store SQLite 可选持久化、多 console/多设备实测、TLS 部署实测（Caddy/Docker）、CI 升级 Node 24 actions、`pnpm audit --prod`、版本发布 | 自部署文档实测通过；audit 无运行时高危 |
| 体验增强 | relay 配对二维码、E_PAIR/E_EXPIRED/E_RATE 中文文案、设置页 relay 状态页 | 可选，不阻塞发布 |

---

## 6. 每阶段收尾固定动作

1. README/相关文档同步。
2. 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test`。
3. Web 截图回归存 `.shots/`。
4. 每阶段 ≥1 条 conventional commit。
5. 协议改动后先 `pnpm --filter @dsh-remote/protocol build`。
6. 卡住写 `BLOCKED.md` 并继续下一项，不中断窗口。
