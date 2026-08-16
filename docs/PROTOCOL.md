# dsh-remote 协议参考（wire protocol）

> 基线：DSH harness `0.1.0-rc.5`。宽容解码吸收未来演进；本文件描述 `packages/protocol` 实现的契约。所有消息为 JSON 信封，`rpcId` 回显。

## 1. 信封（envelopes）

| 方向 | 信封 | 字段 |
|---|---|---|
| 客户端 → | `client-request` | `{ rpcId, method, payload }` |
| 服务端 → | `server-response` | `{ rpcId, ok:true, result }` 或 `{ rpcId, ok:false, error:{code,message,details?} }` |
| 服务端 → | `server-request` | `{ rpcId, kind:"approval"\|"question"\|…, payload }` |
| 客户端 → | `client-response` | `{ rpcId, result }`（应答 server-request） |

- 判别顺序：`method` → client-request；`ok`（boolean）→ server-response；`kind`（非 `"unknown"`）→ server-request；`result` → client-response；其余 → `UnknownEnvelope` 透传。
- `makeRpcId()` 生成相关性 id（非加密用途）。
- 宽容解码（`codec.ts`）：未知 key 忽略；未知类型降级 `Unknown*`；任意垃圾输入不抛错（幂等——`kind:"unknown"` 原样返回）。

## 2. 端点

| 端点 | 用途 |
|---|---|
| `POST /api/<method>` | 一元调用（`session.prompt`、`commands/execute` 等） |
| `POST /api/respond` | 应答 server-request（审批/提问） |
| `POST /api/<namespace>/<method>` | typert 网关（`commands/*`、`goals/*`、`pluginInventory/*`） |
| `GET /api/session.export` | 会话导出（无信封，直接流 ZIP） |
| `GET /api/events.mux` | WebSocket 下行（会话事件、审批、提问、队列、任务、投影） |
| `GET /api/events.host` | WebSocket 下行（会话/工作区注册表） |

- HTTP 状态码只是载体；业务失败走 `ok:false` + 类型化 code。
- `RpcClient` 行为：请求超时（默认 15s）→ `RpcError("TIMEOUT")`；网络错误 → `NETWORK`；非 JSON 响应 → `HTTP_<status>`；无法解析的信封 → `BAD_RESPONSE`；**rpcId 回显不匹配 → `RPC_ID_MISMATCH`**。

## 3. WebSocket 双流（仅下行）

- `WsDownlink` 同时打开 mux + host，合并为单一 `AsyncIterable<Frame>`。
- 客户端发送 → 服务端以 **1008** 断连（真实 DSH 行为，mock-harness 亦如此）。
- 帧类型白名单：`session/event`、`session/projection`、`session/registry`、`server/request`、`queue/event`、`task/event`、`host/event`；未知 → `UnknownFrame` 透传。
- 断线以流结束暴露给上层；**重连归 ConnectionLoop**。

## 4. 连接生命周期（ConnectionLoop）

```
connecting → (握手失败) → offline → backoff → connecting → online
online → (流结束/断线) → offline → backoff → …
```

- 握手 = 双流打开 + `host.describe` 成功（`LanTransport.connect`）。
- 指数退避：`min(500ms × 2ⁿ, 10s)` + 抖动（0.875×–1.125×）；每次成功连接后 `attempt` 归零。
- 重同步：每次（重）连接成功后 `onResync` 回调（上层重拉会话列表）。
- 状态机：`connecting / online / offline / backoff`，`onStateChange` / `onError` 通知 UI。
- `start()` 幂等；`stop()` 幂等（关闭活动连接、停掉重试）。

## 5. 错误码（dto/errors）

`NOT_FOUND`、`BAD_REQUEST`、`UNAUTHORIZED`、`FORBIDDEN`、`RATE_LIMITED`、`INTERNAL`、`NOT_IMPLEMENTED`、`SESSION_NOT_FOUND`、`SESSION_BUSY`、`SERVICE_UNAVAILABLE`、`TIMEOUT`。

未知 code 解码为 `UnknownError`，原值保留在 `details.originalCode`。

## 6. 会话投影（session/projection）

投影帧字段（全可选、宽容）：`permissions`、`sessionStats`、`tokenUsage`、`contextPressure`、`goal`、`todos`、`plan`、`title`；未知字段经 `raw` 透传。App 从快照派生，不轮询。

## 7. 示例

```json
// 请求：POST /api/host.describe
{ "rpcId": "m8x-3f2a", "method": "host.describe", "payload": {} }

// 响应
{ "rpcId": "m8x-3f2a", "ok": true, "result": { "name": "dsh", "version": "0.1.0-rc.5" } }
```

```json
// 审批 server-request → POST /api/respond
{ "rpcId": "req-1", "kind": "approval", "payload": { "prompt": "允许执行吗？", "command": "git push", "permission": "shell" } }
// 应答
{ "rpcId": "req-1", "result": { "approved": true } }
```
