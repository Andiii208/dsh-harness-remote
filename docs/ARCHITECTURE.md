# dsh-remote 架构

手机远程控制 **DeepSeek Harness（DSH）** 的开源 App：离开电脑后仍能盯住 agent、接收通知、审批权限、回答提问、继续对话。React Native + Expo 跨端，LAN 起步、传输层可插拔（中继预留）。

## 仓库结构

```
dsh-remote/
├── apps/mobile/            # Expo RN App（iOS + Android）
│   ├── app/                # expo-router 页面：连接、会话列表、聊天、审批
│   └── src/                # transport / data(SessionStore) / notify / ui
├── packages/protocol/      # 协议核心（纯 TS，零运行时依赖）
│   └── src/                # envelopes / codec / rpc / ws / transport / loop / dto
├── mock-harness/           # DSH /api + WS 测试桩（回放 conformance fixtures）
│   ├── src/                # api-server / ws-server / fixture-loader / cli
│   └── fixtures/           # 内置样例 fixtures（sessions/chat/approval/disconnect）
├── tools/capture/          # 录制真实 DSH 流量 → conformance fixtures
├── docs/                   # 本目录 + design/
└── .github/workflows/ci.yml# install + typecheck + test
```

## 分层与数据流

```
┌────────────────────────── apps/mobile ──────────────────────────┐
│  UI（连接/会话/聊天/审批）                                        │
│  SessionStore（会话镜像折叠、投影派生）  ← 纯 TS，可单测           │
│  notify（通知分类器 → 本地通知）                                   │
└───────────────┬─────────────────────────────────────────────────┘
                │ Transport 接口（D2：传输可插拔）
┌───────────────▼─────────────────────────────────────────────────┐
│ packages/protocol                                               │
│  ConnectionLoop ── 握手 / 指数退避 / 重同步 / 状态机              │
│   ├─ LanTransport ── HTTP POST + WS 双流（MVP 唯一实现）          │
│   │     ├─ RpcClient ── unary / respond / typert 网关             │
│   │     └─ WsDownlink ── events.mux + events.host 仅下行合并      │
│   └─ codec（lenient）← envelopes ← dto（DSH schemas 移植）        │
└───────────────┬─────────────────────────────────────────────────┘
                │ HTTP / WS（127.0.0.1:3080，信任围栏内）
┌───────────────▼─────────────────────────────────────────────────┐
│ DeepSeek Harness（0.1.0-rc.5 基线）   或   mock-harness（测试桩）  │
└─────────────────────────────────────────────────────────────────┘
```

1. `ConnectionLoop` 就绪握手（双流打开 + `host.describe` 成功），帧经 AsyncIterable 扇出。
2. `SessionStore` 增量折叠会话事件 → 会话快照（turn/step/message/tool 节点、流式块、中断/间隙标记）。
3. 投影（permissions/stats/usage/context/goal/todos/plan/title）从快照派生，零轮询。
4. 用户操作 → RpcClient（`POST /api/<method>`、`/api/respond`、typert 网关）。
5. 通知分类器：turn 完成 / goal 完成或受阻 / 审批等待 / 提问等待 → 本地通知 + 深链。

## 不变式（继承自 sorsama 验证过的设计）

1. **线上层永不因未知数据崩溃**：未知 key 忽略，未知事件/帧/卡片类型降级 `Unknown*` 透传（`codec.ts`）。
2. **HTTP 状态码只是载体**：业务失败以 `ok:false` + 类型化 error code 到达；未知 code 降级 `UnknownError`（`details.originalCode` 保留）。
3. **WS 双流仅下行**：客户端绝不发送（发送即 1008 断连）；`WsDownlink` 不暴露 send。
4. **特权功能 loopback-only**：设置/凭据/宿主原生方法仅回环；网络连接时 App 只读 + 横幅。
5. **协议基线锁定 + 兼容矩阵**：每次适配新 DSH 版本走 conformance fixtures 回归（`COMPATIBILITY.md`）。

## 里程碑

| 里程碑 | 状态 |
|---|---|
| M0 骨架与协议（monorepo + protocol + mock-harness + capture + docs + App 壳） | ✅ 已交付 |
| M1 遥控闭环（通知/保活/审批/提问/消息/goal-todo） | ✅ 已交付 |
| M2 跨端与安全（iOS EAS、配对 token、开源发布） | 进行中 |
| M3 中继（预留：harness-plugin + E2E 加密 + APNs/FCM） | 预留 |

## 安全模型速览

MVP（LAN）：官方 user patch 层开 `0.0.0.0:3080`（`profiles/web/cordis.patch.yml` restate webserver）；沿用信任围栏；文档强制"仅可信网络"；特权只读 + 横幅。M2 升级为配对围栏（token 鉴权）。详见 `SECURITY.md`。
