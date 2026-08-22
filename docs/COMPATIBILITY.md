# 兼容性（COMPATIBILITY）

## 协议基线

当前基线：**DSH harness `0.1.0-rc.5`**（mock 回放基线）；**真实宿主已实测 `0.1.0-rc.7`（DSH Desktop 2.0.1，API 端口动态）**。协议以 `packages/protocol` 为唯一事实源；每次适配新 DSH 版本走 **conformance fixtures 回归**。

## 版本矩阵

| DSH 版本 | 适配状态 | fixtures 回归 | 备注 |
|---|---|---|---|
| `0.1.0-rc.5` | ✅ 基线 | ✅（mock-harness 内置 5 组样例 + capture 录制路径） | mock/App 联调基线 |
| `0.1.0-rc.7`（Desktop 2.0.1） | ✅ 真实宿主实测（2026-08-22） | ⏳ 待重录真实 fixtures | 本机真实 DSH；API 基址为动态端口（经 `DSH_WEB_URL` 注入或插件回环端口扫描）；见下方真实宿主矩阵 |

## 真实宿主矩阵（2026-08-22 实测 rc.7 / DSH Desktop 2.0.1）

实测环境：`dsh --version` = `0.1.0-rc.7`；Desktop 2.0.1；`host.describe` 返回 `value.version="0.0.1"`；API 基址由 `DSH_WEB_URL` 提供（实测 `http://127.0.0.1:60576`，端口每次启动可能变化）。

| App 依赖 RPC | 真实宿主 | 实测/适配说明 |
|---|---|---|
| `host.describe` | ✅ 200 | 返回 `result.value.{version,cwd,provider,model,attachedSessions,canOpenPath}` |
| `session.list` | ✅ 200 | `value.items[]`，含 `sessionId/updatedAt(ms)/running/cwd/agentPreset/projections.values`；App 已兼容 |
| `session.history` | ✅ 200 | `value.events[]`，`assistant/chunk` 含 `reasoning-delta` 块（App 折叠为思考内容） |
| `session.models` | ✅ 200 | `value.current/groups`，含 `reasoning.efforts`；App 已兼容 |
| `session.prompt` | ✅ 存在 | `mode` 只接受 `"queue"` 或 `"steer"`；App 默认 `queue`，composer 可切 `steer` |
| `session.cancel` | ✅ 存在（要求 sessionId） | 协议 `interrupt()` 先调 `session.cancel`，404 才回退 `session.interrupt` |
| `session.create` | ✅ 存在 | 空 payload 即创建，返回 `{sessionId, agentPreset}`（校准空白会话为正常副作用） |
| `session.rename` / `session.fork` / `session.selectModel` / `session.updateQueue` | ✅ 存在 | 均要求 sessionId；成功路径可用 |
| `session.search` | ⚠️ 本部署禁用 | 宿主 `openAt:"never"`；App 失败时回退本地搜索 |
| `skill.list` | ✅ 存在 | 要求已 attach 的真实 sessionId |
| `agentPreset.list` / `agentPreset.select` | ✅ 存在 | `presets[]` 含 `id/name/isDefault/trust/description` |
| `workspace.list` / `workspace.archiveSession` | ✅ 存在 | `items[]` 含 `workspaceId/path/title/sessionIds` |
| `settings.describe` | ✅ 200 | `value.writable/hasDocument/namespaces[]`，每个 ns 有 `value/base/user/revision/applies` |
| `settings.mutate` | ✅ 成功路径实测 | **接受 `expectedRevision`**；已实测 `permission.defaultPreset` 与 `agent-default-model` 写回并恢复 |
| `settings.update` | ✅ 存在（要求 ns+patch） | 备用写路径，App 当前使用 `settings.mutate` |
| `host.settings.get` / `host.settings.set` | ❌ 404 | App 设置页已改为 `settings.describe` 的 `agent-default-model` 命名空间；探测不到自动隐藏 |
| `plugin.list` | ❌ 404 | App 插件页真实宿主为空态；设置入口按可见性纯函数隐藏 |
| `commands/execute` | ✅ 成功路径实测 | 载荷 `{args:{agentId,line}}`；`/help` 返回 `{ok:true}`，`/permission` 返回 `{commandId,result:{kind:"success",text}}`；`/permission workspace-write` 切换与恢复已实测 |
| WS `/api/events.mux` + `/api/events.host` | ✅ 存在 | 下行帧包在 `server-request` 信封内；App/插件兼容 Desktop 对象事件与 `{key,value}` 投影 |

**DSH Desktop（动态端口，2026-08-22 实测）**：`dsh-remote remote` 优先使用 `DSH_WEB_URL`；普通终端没有该变量时，插件会枚举本机回环 TCP 监听端口（`netstat -ano -p tcp`）并逐个 `host.describe` 探活，再回退历史端口 56734/3080。Desktop 的 `session/event` 为对象形式（`{type:"user/message"|"assistant/chunk"|"assistant/message"|"turn/*", seq, time, data}`），`session/projection` 为 `{key,value}` 形式；App `SessionStore` 已同时兼容旧 fixture 平铺格式与 Desktop 新格式。

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
