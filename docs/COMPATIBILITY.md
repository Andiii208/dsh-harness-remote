# 兼容性（COMPATIBILITY）

## 协议基线

当前基线：**DSH harness `0.1.0-rc.5`**（mock 回放基线）；**真实宿主已实测 `0.1.0-rc.7`**。协议以 `packages/protocol` 为唯一事实源；每次适配新 DSH 版本走 **conformance fixtures 回归**。

## 版本矩阵

| DSH 版本 | 适配状态 | fixtures 回归 | 备注 |
|---|---|---|---|
| `0.1.0-rc.5` | ✅ 基线 | ✅（mock-harness 内置 5 组样例 + capture 录制路径） | mock/App 联调基线 |
| `0.1.0-rc.7` | ✅ 真实宿主实测（P0） | ⏳ 待重录真实 fixtures | 本机真实 DSH；见下方真实宿主矩阵 |

## 真实宿主矩阵（P0，2026-08-18 实测 rc.7）

| App 依赖 RPC | rc.7 真实宿主 | 适配说明 |
|---|---|---|
| `host.describe` | ✅ 存在（POST `/api/host.describe`，返回 `result.value`） | 协议已兼容 `type:"server-response"` 信封 |
| `session.list` | ✅ 存在（返回 `result.value.items[]`） | App 已兼容 `sessionId/projections.values.title/cwd` |
| `session.prompt` | ✅ 存在（要求 `mode` + `content[]`） | App 发送 `{sessionId, mode:"steer", content:[{type:"text",text}]}` |
| `session.interrupt` | ⚠️ 不存在，真实方法为 `session.cancel` | 协议 `interrupt()` 先调 `session.cancel`，404 回退 `session.interrupt`；harness-plugin `host-adapter` 提供映射 |
| `respond` | ✅ 存在（要求 `type:"client-response"` + `result.{ok,value}`） | App 按审批/提问结构包装；`RpcClient.respond` 解析 `{accepted}` 回执 |
| `goals/*` | ⚠️ 不存在；真实方法为 `goal.pause/resume/create/edit/complete/clear`（`sessionId+ref`） | harness-plugin `host-adapter` 提供命名映射；App 未暴露 goal 操作 UI 时自动隐藏 |
| `host.settings.get/set` | ⚠️ 不存在；真实设置面为 `settings.describe/update`（特权回环 API） | App 探测不到时隐藏；`host-adapter` 提供映射参考 |
| `plugin.list/exec` | ⚠️ 非核心 RPC；DSH 插件清单走 `dsh-host-plugin-inventory` remote | App 探测不到时隐藏；harness-plugin `plugin-catalog` 提供参考实现 |
| WS `/api/events.mux` + `/api/events.host` | ✅ 存在（WebSocket 下行，帧包在 `server-request` 信封内） | `WsDownlink` 自动解包并保留外层 `rpcId` |

**DSH Desktop（`127.0.0.1:56734`，2026-08-18 实测）**：`dsh-remote remote` 会经 `DSH_WEB_URL` / 默认端口自动探测并桥接该宿主。Desktop 的 `session/event` 为对象形式（`{type:"user/message"|"assistant/chunk"|"assistant/message"|"turn/*", seq, time, data}`），`session/projection` 为 `{key,value}` 形式；App `SessionStore` 已同时兼容旧 fixture 平铺格式与 Desktop 新格式。

**信封适配（关键）**：真实 DSH 请求体必须带 `type:"client-request"`；响应为
`{"type":"server-response","rpcId":…,"result":{"ok":true,"value":…}}` 或
`{"ok":false,"error":…}`；`/api/respond` 必须带 `type:"client-response"`。
`packages/protocol` 的 `codec/decodeEnvelope` 与 `RpcClient` 已同时兼容旧 mock
无 `type` 信封与真实 DSH 带 `type` 信封。

## 配对围栏（M2）

- `mock-harness` 支持 `pairToken` 配置模拟配对围栏：HTTP 要求 `Authorization: Bearer <token>`（或 `X-DSH-Pair-Token`），WS 要求 `?pairToken=` query；未匹配 → `ok:false UNAUTHORIZED` / 拒绝升级。
- `harness-plugin` 提供真实宿主侧实现（token 签发/校验/过期/回环豁免），插件接缝待真机校准。
- 协议层：`LanTransport` 在 `auth.token` 存在时自动携带（HTTP 头 + WS query）。

## 发现与二维码配对（P2）

- **自动发现**：`GET /api/host.describe` 作探活端点（只读、无凭据）；App 用本机 IP 推断 /24 候选并发探活。mDNS/Bonjour 为 dev build 增强（react-native-zeroconf），Expo Go 下用子网探测。
- **配对二维码**：`harness-plugin` 的 `pairingUrl(host, port)` 签发一次性 token（15 分钟 TTL）并返回 `dshremote://pair?host&port&token` 深链；宿主将其渲染为 QR。
- **mock-harness**：`GET /api/pairing/qr`（配置 `pairToken` 时启用）模拟宿主侧 QR 载荷；未配置返回 404 `NOT_CONFIGURED`。
- **状态**：协议层与 App 已实现（probeHost / build+parsePairPayload / 扫码 / 深链 / 最近主机 / 自动重连 / 首启引导）；**真实 DSH 的 QR 渲染与插件接缝待真机校准**（属于 P3 剩余项），届时重录 fixtures 并更新本矩阵。

## fixtures 工作流

1. **录制**：`tools/capture`（`dsh-capture record --host … --port 3080 --out ./fixtures --duration 30`）连真实 DSH，采集 unary 响应 + 双流 WS 帧。
2. **校验入库**：`dsh-capture validate ./fixtures`（宽容校验：未知字段忽略、类型错误报告）。
3. **回放**：`mock-harness` 按 fixtures 提供 `/api` + WS；App / protocol 测试与联调全部走它，不依赖真实 harness。
4. **协议漂移 diff**：升级 DSH 后重录 → 对比新旧 fixtures 的字段/帧类型 → 更新本矩阵与 `PROTOCOL.md`。

## 宽容解码如何吸收演进

- 未知 envelope/frame 类型 → `Unknown*` 透传，线上层不崩溃。
- 未知 key 忽略；未知 error code → `UnknownError`（`details.originalCode` 保留原始值）。
- DTO 全可选字段 + `raw` 透传：新字段自动可见。

## 录制注意事项

- 仅可信网络（LAN 直连无鉴权）；录制内容含真实提示词/命令，入库前脱敏检查。
- `record` 需要可达的 DSH（默认 127.0.0.1:3080）。
