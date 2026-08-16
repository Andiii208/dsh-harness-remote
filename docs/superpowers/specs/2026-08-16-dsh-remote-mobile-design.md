# dsh-remote：手机远程连接 DeepSeek Harness — 设计文档

- 日期：2026-08-16
- 状态：已确认（v0）
- 仓库：`dsh-remote`（工作目录 `D:\dsh-remote`，当前为空，全新项目）

## 1. 背景与调研结论

### 1.1 目标

做一个**开源社区产品**：手机端远程连接 DeepSeek Harness（DSH），让用户离开电脑后仍能盯住 agent、接收通知、审批权限、回答提问、继续对话。对标 Claude Code Remote Control 的定位，但面向 DSH 开源生态。

### 1.2 竞品与既有项目调研

| 产品 | 形态 | 连接方式 | 能否改造适配 DSH |
|---|---|---|---|
| Claude Code Remote Control | 官方 App (iOS/Android) | 出站加密中继 + Push | ❌ 闭源商业服务，绑定 Anthropic 账号，无开放接口 |
| Cursor Agents Web/Mobile | PWA | 云端 Agent + GitHub | ❌ 闭源云端服务 |
| TRAE 移动端 / TraeWork | 原生 App | 字节云端 + 多台 PC | ❌ 闭源，绑定自家账号体系 |
| sorsama/deepseek-harness-mobile | Android 原生 (Kotlin+Compose) | LAN 直连 DSH `/api` (3080) | ✅ 已存在，但早期（5 stars/17 commits）：仅 Android、仅局域网、需手动 LAN 补丁、零鉴权 |
| Orbis | Beta | DSH 插件配对 + E2E 加密中继 | ⚠️ 公开资料极少，无法评估 |

**结论**：没有可直接"拿来改"的成熟产品。大厂产品均为封闭生态；DSH 专属的只有 sorsama 一个早期项目。其**协议研究成果**（/api 接口面、WS 下行事件、连接循环、mock 方案、兼容性方法论）是最宝贵的可复用资产。

### 1.3 关键技术事实（来自 sorsama 文档与 DSH 源码位置）

- DSH Web UI 默认绑定 `127.0.0.1:3080`；`dsh web --host 0.0.0.0` 被**有意屏蔽**（harness 尚无鉴权层）。
- LAN 模式通过**官方 user patch 层**开启：编辑 `<harness-home>/profiles/web/cordis.patch.yml`，restate `webserver` 行绑定 `0.0.0.0:3080`。这是受支持配置接缝，不修改 DSH 源码。
- `/api` 有**信任围栏**（trust fence）：Host 头必须是回环或受信地址，自动信任自身 LAN IP 字面量，主机名需 `--trusted-host`。
- **特权功能**（设置、凭据、宿主目录选择器、agent-preset 编写）默认 loopback-only；网络连接时只读 + 横幅提示。
- 协议：全部 JSON 信封，`rpcId` 回显；`POST /api/<method>` 一元调用；`POST /api/respond` 应答 server-request（审批/提问）；typert 网关 `POST /api/<namespace>/<method>`（`commands/*`、`goals/*`、`pluginInventory/*`）；下载走 `GET /api/session.export`（无信封，直接流 ZIP）。
- 下行事件流：WebSocket `/api/events.mux`（会话事件、审批、提问、队列、任务、投影）+ `/api/events.host`（会话/工作区注册表），**仅下行**，客户端发送即 1008 断连。
- `commands/execute` 是唯一命令写路径；`/` 开头的行若无目录认领 → `session.prompt`（技能调用路径）。
- 会话投影（permissions、sessionStats、tokenUsage、contextPressure、goal、todos、plan、title 等）经 `session/projection` 帧推送，无需轮询。
- 就绪握手 = 双流打开 + `host.describe` 成功；断线指数退避（500ms×2，上限 10s，抖动）+ 重同步。
- DSH 为 developer preview（v0.1），**预期破坏性变更**；宽容解码（未知 key/类型降级为 `Unknown*` 透传）是保命设计。
- 协议基线参考：harness `0.1.0-rc.5`。

## 2. 已确认的决策

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| D1 | 产品定位 | **开源社区产品** | 追求 DSH 生态采用与贡献；文档、兼容矩阵、可测试性为一等公民 |
| D2 | 连接拓扑 | **传输层可插拔，LAN 起步，中继预留** | 先交付可用版本，架构上为中继/公网留接口，不平滑推翻重来 |
| D3 | 目标平台 | **跨端（iOS + Android）** | 开发机为 Windows（iOS 原生不可行）；覆盖更多用户 |
| D4 | 技术栈 | **React Native + Expo（TypeScript）** | EAS 云构建无需 Mac 即可出 iOS 包；DSH 本身是 TS，协议类型零失真对齐；TS 开发者基数最大，开源贡献门槛低 |
| D5 | 与 sorsama 关系 | **协议复用 + 跨端重写** | 复用其协议研究成果/mock 方法论，UI 与传输层全新实现；致谢并保持协议兼容 |
| D6 | MVP 范围 | **最小闭环 + 对话控制** | 查看流式聊天、本地通知、一键审批、回答提问、发消息继续对话、goal/todo 查看与暂停；不做设置/凭据/子代理目录（M2+） |
| D7 | 许可证 | MIT | 与 DSH 生态一致 |

## 3. 架构

### 3.1 仓库结构（pnpm monorepo）

```
dsh-remote/
├── apps/
│   └── mobile/            # Expo RN App（iOS + Android）
│       ├── app/           # expo-router 页面：连接、会话列表、聊天、审批、通知
│       ├── src/
│       │   ├── transport/ # LAN Transport 实例化与状态管理
│       │   ├── data/      # SessionStore：会话镜像、折叠、投影派生
│       │   ├── notify/    # 通知分类器 → 本地通知 + 后台任务保活
│       │   └── ui/        # DSH 设计令牌主题、组件、屏幕
│       └── app.json       # EAS 配置（云构建）
├── packages/
│   └── protocol/          # TS 协议核心（纯 JS，无 RN 依赖）
│       ├── src/
│       │   ├── envelopes.ts      # client-request / server-response / server-request / client-response
│       │   ├── codec.ts          # lenient 解码：未知 key/类型降级 Unknown*
│       │   ├── rpc.ts            # RpcClient（unary + respond + typert 网关）
│       │   ├── ws.ts             # WsDownlink（仅下行双流）
│       │   ├── loop.ts           # ConnectionLoop（握手、退避、重同步）
│       │   ├── transport.ts      # Transport 接口（LAN 实现 + 中继预留插槽）
│       │   └── dto/              # DSH schemas 的 TS 移植（对齐 api/remotes 类型）
│       └── test/
├── mock-harness/          # TS 实现 /api + WS 的测试桩
├── tools/
│   └── capture/           # 录制真实 DSH 流量 → conformance fixtures
├── harness-plugin/        # （预留）dsh-remote 宿主插件：配对 token / 鉴权 / 中继客户端
├── relay/                 # （预留）中继服务器
├── docs/
│   ├── ARCHITECTURE.md
│   ├── PROTOCOL.md
│   ├── COMPATIBILITY.md   # 协议版本矩阵
│   └── SECURITY.md
└── package.json / pnpm-workspace.yaml / tsconfig 等
```

### 3.2 Transport 抽象（D2 的落地）

```ts
interface Transport {
  connect(endpoint: Endpoint, auth: Auth): Promise<Connection>;
}
interface Connection {
  unary(method: string, payload: unknown): Promise<RpcResult>;
  respond(rpcId: string, result: unknown): Promise<void>;
  events: AsyncIterable<Frame>;   // mux + host 双流合并
  close(): void;
}
```

- **LanTransport**：直连 `host:3080`，HTTP POST + WebSocket；MVP 唯一实现。
- **RelayTransport**（M3）：同一接口，走 harness-plugin 出站中继；app 侧零改动切换。
- 连接状态（连接中/在线/离线/重连退避）由 `ConnectionLoop` 统一管理并暴露给 UI。

### 3.3 数据流

1. `ConnectionLoop` 就绪握手（双流 + `host.describe`），帧经 SharedFlow/订阅扇出。
2. `SessionStore` 增量折叠会话事件 → 会话快照（turn/step/message/tool 节点、流式块组装、中断标记、间隙检测）。
3. 投影（permissions、stats、usage、context、goal、todos、plan）**从快照派生**而非轮询，与转录保持同步、零额外往返。
4. 用户操作 → `SessionStore` → `RpcClient`（`POST /api/<method>`、`/api/respond`、typert 网关）。
5. 通知分类器将帧归类为 turn 完成 / goal 完成或受阻 / 审批等待 / 提问等待，去重后发本地通知，深链回会话。

### 3.4 不变式（继承自 sorsama 验证过的设计）

- 线上层永不因未知数据崩溃：未知 key 忽略，未知事件/帧/卡片类型降级 `Unknown*`。
- HTTP 状态码只是载体；业务失败以 `ok:false` + 类型化 error code 到达。
- WS 流仅下行，客户端绝不发送。
- 设置/凭据/宿主原生方法 loopback-only；网络连接时 app 只读呈现 + 横幅。
- 协议基线锁定 + 兼容矩阵；每次适配新 DSH 版本走 conformance fixtures 回归。

## 4. 安全模型（分阶段）

| 阶段 | 措施 |
|---|---|
| MVP (LAN) | 官方 user patch 层开 `0.0.0.0:3080`；沿用信任围栏；文档明示"仅可信网络"；特权功能只读 + 横幅；连接页明示安全警告（仿 sorsama） |
| M2 加固 | `harness-plugin` 配对：宿主生成一次性配对 token，App 扫码/手输，请求带 token 头，插件校验；将"信任围栏"升级为"配对围栏" |
| M3 中继 | 同一插件做设备配对 + E2E 加密出站连接；短时凭证；解决 NAT 穿越与公网推送（APNs/FCM） |

## 5. 里程碑

| 里程碑 | 内容 | 验收标准 |
|---|---|---|
| M0 骨架与协议 | monorepo；packages/protocol（envelope/codec/rpc/ws/loop/transport）；mock-harness；tools/capture + conformance fixtures；LAN 文档；App 壳连真实 DSH | 手机（adb reverse / 真机 Wi-Fi）看到会话列表并实时流式渲染聊天；断线重连演示通过 |
| M1 遥控闭环 | 本地通知 + 后台任务保活；一键审批；回答提问；发消息继续对话；goal/todo 查看与暂停 | 手机在锁屏/切后台时收到通知并可操作审批与提问 |
| M2 跨端与安全 | iOS EAS 云构建 + TestFlight；配对 token 鉴权；兼容矩阵 + 安全文档；开源发布（MIT，`dsh-plugin` 话题，README/贡献指南） | iOS 与 Android 双端可用；无 token 连接被拒；文档齐全 |
| M3 中继（预留） | harness-plugin 配对 + E2E 加密中继 + APNs/FCM 真推送 | 手机在任意网络（4G/公网）可连，推送实时到达 |

M0–M2 为本项目范围；M3 为预留演进方向，不阻塞前序发布。

## 6. 测试策略

- **conformance fixtures**：`tools/capture` 录制真实 DSH 流量（unary 响应、WS 帧序列、审批/投影），固化为 fixtures。
- **mock-harness**：TS 实现的 /api 测试桩，按 fixtures 回放，供 app 与 protocol 包自动化测试。
- **协议基线回归**：每次 DSH 升版本，重录 fixtures，diff 协议漂移，更新 COMPATIBILITY.md。
- **真机冒烟**：连接/重连/通知/审批的端到端手动清单（M0–M2 验收标准）。

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| DSH 预览版破坏性变更 | 宽容解码 + 锁定基线 + 兼容矩阵 + fixtures 回归（已内建） |
| 无 Mac 出 iOS 包 | EAS 云构建；开源项目免费额度覆盖 |
| 公网推送需等 M3 | MVP 用本地通知 + 后台任务保活（sorsama 同款思路） |
| LAN 无鉴权暴露面 | 文档强制"仅可信网络"；连接页安全警告；M2 配对 token 收紧 |
| Windows 防火墙/路由器 AP 隔离挡连接 | 文档化排查清单（sorsama 已验证的 troubleshooting 可直接借鉴） |

## 8. 开源定位与差异化

- 与 sorsama 差异化：iOS+Android 跨端、传输可插拔（中继就绪）、TS 协议包与 DSH 原生类型对齐。
- 协议研究/文档方法论致谢 sorsama（README credit + 保持其协议兼容）。
- 仓库打 `dsh-plugin` 话题、MIT 协议、README/贡献指南/安全政策齐全。

## 9. 范围外（明确不做）

- 不做 DSH 宿主端代码修改（只用 user patch 层与插件接缝）。
- 不做云端 Agent（用户代码留在本机，手机只是视口）。
- M3 中继服务器不承诺托管运营（开源自部署形态）。
