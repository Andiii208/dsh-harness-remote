# M3 中继设计（Relay）— 控制面协议、E2E 加密与分阶段计划

> 状态：设计评审稿（2026-08-17）。本阶段只交付设计文档 + 协议层最小验证
> （`packages/protocol/src/relay.ts` 类型与纯函数解析 + 单测）；**不实现 relay 服务器**。
> 约束来源：`SECURITY.md` 已定 M3 =「同一插件做设备配对 + E2E 加密出站连接 + 短时凭证 + APNs/FCM」；
> `packages/protocol/src/transport.ts` 已预留 `RelayTransport` 插槽（同接口，App 零改动）；
> `relay/` 为占位；harness-plugin（M2 配对插件）扩展为中继客户端；自部署不托管。

---

## 1. 目标与非目标

**目标**
- 手机离开局域网后，通过自部署 relay 继续控制 DSH（与 LAN 直连同一套 App 代码与 wire protocol）。
- 出站连接由 harness-plugin 发起，无公网入站端口；手机同样出站到 relay。
- 数据在 App ↔ harness 之间 E2E 加密，relay 只看到信封元数据（from/to/时间戳/大小）。

**非目标（本阶段）**
- 不实现 relay 服务器、不接入 APNs/FCM、不修改 harness-plugin（只读预留接口）。
- 不做 NAT 穿透/打洞，不托管任何公共中继服务。
- 不改变现有 `Connection` / `Transport` 接口行为；只新增 `relay.ts` 导出。

---

## 2. 拓扑与角色

```
phone (App) ──WSS──► relay ◄──WSS── harness-plugin (console)
   (RelayTransport)         (harness-plugin relay client)

控制面消息：phone/console ↔ relay（本节协议）
数据面消息：phone ↔ console 的 DSH 帧，加密后经 relay 转发（relay 不解密）
```

- `deviceId`：手机/平板设备的稳定标识（安装后生成）。
- `consoleId`：harness-plugin 实例的稳定标识（DSH 安装/配对后生成）。
- `relay`：自部署服务，只做注册、配对、路由与心跳。

---

## 3. Relay 控制面协议（WebSocket，JSON 信封）

所有消息共用 `RelayEnvelope`（`packages/protocol/src/relay.ts`）：

```ts
interface RelayEnvelope {
  v: 1;
  type: RelayEnvelopeType;
  id: string;          // 关联 id（请求/响应回显）
  from: string;        // deviceId | consoleId | "relay"
  to: string;          // 接收方 id；发给 relay 的控制消息填 "relay"
  ts: number;          // unix ms
  payload?: unknown;
}
```

### 3.1 消息类型

| type | 方向 | 说明 |
|---|---|---|
| `relay.hello` | client → relay | 建立 WSS 后第一条，声明协议版本 |
| `relay.hello.ack` | relay → client | 服务就绪，返回 relay 版本/时间 |
| `relay.register` | client → relay | 注册 deviceId / consoleId（+ 推送 token） |
| `relay.register.ack` | relay → client | 注册成功（含短时凭证 TTL） |
| `relay.pair` | phone → relay | 输入 6 位配对码，请求绑定 consoleId |
| `relay.pair.ack` | relay → phone | 配对结果（成功含对端公钥/推送可用性） |
| `relay.route` | client → relay | 数据面转发：加密信封 + 目标 id |
| `relay.route.ack` | relay → client | 路由结果（delivered / queued / rejected） |
| `relay.heartbeat` | client → relay | 保活/背压（可选 rtt） |
| `relay.heartbeat.ack` | relay → client | 保活响应 |
| `relay.error` | relay → client | 任意请求失败（见 3.3） |

### 3.2 注册 / 配对 / 路由 / 心跳

**注册**
- 客户端 `relay.hello` 后立即 `relay.register`，payload = `RelayRegistration`：
  `deviceId`, `publicKey`（本次 E2E 会话的 ECDH 公钥 JWK）, `pushToken?`, `platform?`, `protocolVersion?`。
- relay 校验 deviceId/公钥格式，签发**短时凭证**（JWT-like，默认 TTL 15 分钟），客户端后续请求通过 `Authorization: Bearer <short-lived-credential>`（HTTP）或 `?credential=`（WSS 握手）携带。
- 短时凭证只授权「该 client 自己的注册信息 + 与其已配对 peer 的路由」，过期返回 `E_EXPIRED`。

**配对**
- phone 输入 6 位配对码（M2 已实现扫码配对；M3 保留同一体验，码由 relay 生成并展示在 console 插件端）。
- `relay.pair` payload = `{ code, deviceId }`；relay 校验码有效性（TTL 10 分钟，一次性），成功后把 device 与 console 绑定。
- 绑定后双方通过 `relay.route` 互发加密信封；relay 拒绝未绑定 pair 的 `relay.route`（`E_PAIR`）。

**路由**
- `relay.route` payload = `RelayRoute`：`{ to, ciphertext, nonce }`（加密信封字节以 base64url 编码，见 §4）。
- relay 仅校验 `to` 是否为本 relay 已注册且与 `from` 绑定的 peer；通过则转发原文，不解读内容。
- 若 peer 离线，relay 按推送 token 尝试 APNs/FCM 唤醒（M3.3），并在 TTL 内暂存信封（默认 2 分钟，满则 `E_RATE`/丢弃）。

**心跳**
- 客户端每 30–60 秒 `relay.heartbeat`（比 WebSocket ping 更可观测），relay `relay.heartbeat.ack` 回显 `rttMs`。
- 超过 3 个心跳周期未收到 → relay 标记离线；harness-plugin 侧同逻辑。

### 3.3 错误码

| code | 含义 | 客户端处理 |
|---|---|---|
| `E_BAD_ENVELOPE` | 信封格式/版本错误 | 丢弃并告警 |
| `E_AUTH` | 凭证缺失/无效 | 重新注册 |
| `E_PAIR` | 未配对或配对码错误 | 提示重新配对 |
| `E_ROUTE` | 目标不存在/不可达 | 排队或 UI 提示离线 |
| `E_EXPIRED` | 短时凭证/配对码过期 | 静默续期/重试 |
| `E_RATE` | 速率/暂存上限 | 退避重试 |
| `E_UNKNOWN` | 兜底 | 退避重试 |

纯函数 `normalizeRelayError` 已实现 lenient 归一化（未知码 → `E_UNKNOWN`）。

---

## 4. E2E 密钥交换与加密信封

**算法基线**：ECDH（P-256）+ HKDF-SHA256 派生 AES-256-GCM 会话密钥；每方向独立密钥（phone→console 与 console→phone 分开）。每次重新注册/断线重连可重新握手，不降低长期安全性。

**握手（App ↔ console，经 relay 转发，relay 不参与密钥）**

1. 双方各自生成 ECDH 密钥对，公钥随 `relay.register` 提交给 relay。
2. phone 用配对码绑定 console 后，relay 在 `relay.pair.ack` 中返回对端公钥；console 同样在收到「有新绑定」事件时得到 phone 公钥（M3.1 最小实现：relay 转发对端公钥）。
3. 双方计算共享密钥：`shared = ECDH(myPriv, peerPub)`；用 HKDF 派生 `encKey`（AES-GCM）与 `macKey`（可选 HMAC，GCM 已带完整性）。
4. 首次绑定后，phone 发送 `hello` 加密信封，console 解密并回 `hello.ack`，完成双向确认。
5. 之后数据面 DSH 帧全部以 AES-256-GCM 加密：`ciphertext = b64url(iv || tag || encrypted)`，`nonce` 独立随信封传输。
6. 断线重连沿用本会话密钥直到注册过期；注册续期时重新握手。

**威胁边界**：relay 能观察到 from/to、信封大小与时间，但无法解密内容；私钥永不出设备；短时凭证只用于 relay 控制面，不参与 E2E 派生。

---

## 5. RelayTransport 接口签名与 App 接入点

`packages/protocol/src/transport.ts` 已定义：

```ts
export interface Transport {
  connect(endpoint: Endpoint, auth: Auth): Promise<Connection>;
}
export interface Connection {
  unary(method: string, payload: unknown): Promise<RpcResult>;
  respond(rpcId: string, result: unknown): Promise<void>;
  events: AsyncIterable<DownlinkFrame>;
  close(): void;
}
```

**M3 新增 `RelayTransport implements Transport`**（签名不变，App 零改动）：

```ts
export interface RelayEndpoint {
  host: string;       // wss://relay.example.com
  port?: number;      // 缺省 443
}

export interface RelayAuth {
  token?: string;        // 短时凭证；为空时先匿名 hello 再注册
  deviceId?: string;
}

export class RelayTransport implements Transport {
  constructor(opts?: RelayTransportOptions);
  connect(endpoint: Endpoint, auth: Auth): Promise<Connection>;
}
```

- 内部：WSS 连接到 relay；信封收发走 `relay.ts` 解析；控制面（注册/配对/心跳）在 `connect` 内完成。
- 返回的 `Connection` 与 `LanTransport` 完全同构：`unary`/`respond` 先加密再经 `relay.route` 转发；`events` 为解密后的 DSH 下行帧异步迭代器。
- **App 接入点**：`ConnectionProvider` 当前 `new LanTransport(...)` 处，仅需按「连接方式选择器」切换为 `new RelayTransport(...)`；`pipeline.ts`、`SessionStore`、UI 均无需改动。

**App 侧最小改动预留**：设置页新增「Relay」连接模式；扫描页二维码可编码 relay URL + 配对码。

---

## 6. 部署形态与安全边界

**部署（自部署不托管）**
- 单文件 Node 服务（`relay/`），WS 优先，HTTP 只做健康检查与短时凭证签发。
- 建议反代 TLS（Caddy/Nginx）；relay 不直接暴露 HTTP 明文。
- 环境变量：`RELAY_BIND`、`RELAY_PUBLIC_URL`、`RELAY_CRED_TTL`、`RELAY_PAIR_TTL`、`RELAY_STORE`（内存/SQLite）。

**安全边界**
- relay 不接触 DSH 数据明文；只转发加密信封。
- 短时凭证与配对码均为一次性/TTL 限制；失败次数限制（防枚举 6 位码）。
- 控制面必须 TLS；WSS 握手用 `?credential=` 携带短时凭证（与 M2 WS 携带 `?pairToken=` 一致，日志泄露面有限）。
- APNs/FCM token 仅用于唤醒，不携带 DSH 内容。
- 默认拒绝未配对路由；默认不持久化 E2E 私钥（App 与插件各存于 Keychain/DSH 配置目录）。

---

## 7. M3.1–M3.4 分阶段计划

| 阶段 | 内容 | 验收 |
|---|---|---|
| **M3.0（本窗口）** | 设计文档 + `relay.ts` 类型/解析/错误码 + 单测 | protocol build/test 全绿，mobile 不降 |
| **M3.1 控制面 MVP** | `relay/` 最小服务（hello/register/pair/heartbeat + 短时凭证）；harness-plugin 扩展为中继客户端（出站 WSS）；App 增加 `RelayTransport`（只连通，不加密转发） | phone 经 relay 看到在线与 session 列表 |
| **M3.2 E2E 加密** | ECDH 握手 + AES-GCM 数据面；重连复用会话密钥；协议增加 `relay.route` 加密信封 | relay 端无法读明文；抓包验证密文 |
| **M3.3 推送与离线队列** | APNs/FCM 唤醒（M2 插件已具备通知基础设施）；relay 短时暂存 + 唤醒后投递 | 手机锁屏可被唤醒并收到审批请求 |
| **M3.4 硬化与自部署** | 速率限制、审计日志、TLS 自部署指南、多设备/多 console、版本协商 | 自部署文档 + 端到端回归全绿 |

**阶段间依赖**：M3.1 完成前不做 M3.2；M3.3 依赖 M3.2 的密文信封；M3.4 作为发布闸门。
**评审前**：不写 relay 服务器实现（本仓库 `relay/` 保持占位）。

---

## 8. 协议层最小验证（本窗口已交付）

- 新增 `packages/protocol/src/relay.ts`（新导出，不改已有行为）：
  - `RelayEnvelope` / `RelayEnvelopeType` / `RelayErrorCode` / `RelayRegistration` / `RelayPairing` / `RelayRoute` / `RelayHeartbeat`
  - `parseRelayEnvelope`（lenient，不抛错）、`isRelayEnvelope`、`normalizeRelayError`
- 新增 `packages/protocol/test/relay.test.ts`：4 用例。
- 验证命令：`pnpm --filter @dsh-remote/protocol build && pnpm --filter @dsh-remote/protocol test`（≥76 且 skipped=0）。

---

## 9. 实现现状（M3.1，2026-08-17 回填）

- `relay/` 包已落地（根目录，workspace 成员）：
  - `src/credential.ts`：HMAC-SHA256 短时凭证签发/校验（`node:crypto`）。
  - `src/store.ts`：内存 device/console/配对码/绑定/在线状态 store（纯 TS）。
  - `src/server.ts`：WS 控制面（hello/register/pair/route/heartbeat + E_* 错误码）+ `GET /healthz`；日志仅 `type/from/to/ts`（无 payload，无 DSH 明文）。
  - `src/cli.ts`：`relay --port 4090` 启动入口。
  - `test/relay-server.test.ts`：7 用例（含安全红线：未认证 E_AUTH、未配对 E_PAIR、过期凭证重连被拒）。
- `packages/protocol/src/relay.ts` 增补：
  - 请求构造器 `makeHello/makeRegister/makePair/makeHeartbeat`（纯函数，id/ts 可注入）。
  - `RelayTransport implements Transport`：单 WSS/WS 连接、hello/register 握手、`?credential=`/`?peerId=` 支持；数据面 M3.1 明文 `relay.route` 转发（unary 请求 `{rpcId,method,payload}` 并等待匹配响应；注释已标明 M3.2 换 `sealRelayPayload`）。
  - `test/relay-transport.test.ts`：7 用例。
- `apps/mobile`：连接页 HOST 支持 `relay://` / `ws://` / `wss://` URL（Relay 模式，端口忽略）；`ConnectionProvider` 按 URL 选择 `RelayTransport`，LAN 路径不变；`relayMode.ts` 纯函数 + 3 单测。
- `harness-plugin/src/relay-client.ts`：出站中继客户端接线桩（注册/心跳/收发信封；真实 DSH 数据面由宿主适配）+ 4 单测。
- 联调：`.shots/relay-integration.mjs`（relay + mock-harness + console 桥）已跑通，手机经 relay 看到 2 个 session（截图 `.shots/relay-sessions.png`、连接页 `.shots/relay-connect.png`）。
- 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿。

### M3.2 E2E 加密（2026-08-17 已实现）

- `packages/protocol/src/relay-crypto.ts`：`generateRelayKeyPair`（ECDH P-256）、`deriveRelaySessionKeys`（HKDF-SHA256 → AES-256-GCM）、`sealRelayPayload` / `openRelayPayload`（GCM 认证，篡改/重放失败）；`relay-crypto.test.ts` 7 用例。
- `RelayTransport` 接入加密数据面：`privateKeyJwk` + `peerPublicKeyJwk` 提供时，`unary/respond` 先 `sealRelayPayload` 再 `relay.route`（payload 仅 `{to, ciphertext, nonce}`）；收到密文 route 先 `openRelayPayload` 再分发；未配置密钥保持 M3.1 明文路径。
- `harness-plugin/src/relay-client.ts` 同步接入 `seal/open`（配置密钥时）。
- relay 服务器只读 `payload.to`，`ciphertext/nonce` 透明转发，日志仅元数据（`relay-server.test.ts` 增补 2 用例）。
- `docs/SECURITY.md` 已更新 M3 状态为「E2E 已实现」。

### M3.3 推送与离线队列（2026-08-17 已实现）

- `relay/src/push.ts`：`PushProvider` 接口 + `MockPushProvider`（可编排成功/失败）+ `NoopPushProvider`；真实 APNs/FCM 另开设备/账号窗口。
- `relay/src/queue.ts`：`createOfflineQueue`（TTL 默认 2 分钟，每 peer 上限 50，满丢最旧；`drain`/`expire` 纯函数）。
- relay 服务器：目标离线时 route 入队 + 有 pushToken 则调用 push provider（失败降级不抛），仍回 E_ROUTE；目标重新 register 后 drain FIFO 投递。
- `RelayTransportOptions.pushToken` / `RelayClientOptions.pushToken`：注册时上报 push token。
- `apps/mobile/src/notify/pushToken.ts`：Expo push token 守卫获取（Expo Go/Web/模块不可用/超时 2s 一律降级 null）；relay 模式连接时传入 RelayTransport。
- 测试：relay 18（push-queue 6 + server 12）、protocol 97、mobile 106、harness-plugin 21；全仓 build/typecheck/test 全绿。

### M3.4 硬化与自部署（2026-08-17 已实现）

- `relay/src/rate-limit.ts`：令牌桶速率限制（默认 120/分钟、突发 240），已认证 clientId 超限回 E_RATE。
- 审计日志：`audit` 回调（默认一行 JSON），只含 `event/from/to/ts/ok` 元数据，不含 payload/明文。
- 版本协商：`relay.hello.ack` 返回 `relayVersion`/`protocolVersion`，不兼容附加 `compatible:false`。
- `docs/MANUAL.md` 增补 relay 部署章节（TLS 终止/Caddy/Docker/配置项/版本协商）；README 更新 M3 状态。
- 全仓回归：protocol 97 / mobile 106 / harness-plugin 21 / relay 24 / mock-harness 29 / capture 24，build/typecheck/test 全绿。
- 真机推送与 relay 真机回归留待设备/账号窗口（见 MANUAL 已知限制）。

### M3.5 中继配对闭环 + 密钥持久化（2026-08-17 已实现）

- **协议层（T1）**：`RelayTransportOptions` 新增 `pairCode` / `onPairAck`；`connect()` 在未注入 `privateKeyJwk` 时自动生成 ECDH P-256 keypair，`relay.register` 携带 `publicKey`（不再 `publicKey: null`）；配置 `pairCode` 时 hello/register 握手完成后发送 `relay.pair` 并等待 `relay.pair.ack`，从 ack 取 `consoleId + peerPublicKey` 派生会话密钥、启用加密数据面、回调 `onPairAck`。未配置 `pairCode` 且未注入 `peerPublicKeyJwk` 时保持 M3.1 明文路径不变。
- **relay 服务器（T2）**：`relay.pair` 成功后除给发起方回 ack 外，复用 `relay.pair.ack` 信封向被配对 console 推送通知（`from=relay`，payload `{ deviceId, peerPublicKey? }`）；console 离线则入离线队列，重连注册后由既有 drain 投递；日志仅元数据，新增 `pair_notify` 审计事件。
- **mobile（T3）**：新增 `apps/mobile/src/relay/relayDeviceStore.ts`（expo-secure-store → localStorage → 内存降级）持久化 `{ deviceId, privateKeyJwk, publicKeyJwk }`；`ConnectionProvider` 移除旧的模块级随机 deviceId，relay 连接前从 store 读取/生成身份并传入 `privateKeyJwk`/`pairCode`/`onPairAck`，`ConnectionApi.connect` 增加可选 `pairCode`，新增 `relayPeerId` 展示 consoleId；连接页 relay 模式显示可选 6 位配对码输入框（数字键盘），配对成功后显示 `consoleId · paired`。
- **harness-plugin（T4）**：`RelayClientOptions` 新增 `onPaired`；未注入私钥时 connect 前自动生成 keypair（失败/无 WebCrypto 降级 `publicKey: null`），`registerPayload()` 携带公钥；收到 `relay.pair.ack` 通知后取 `deviceId + peerPublicKey` 派生会话密钥、启用加密数据面并回调 `onPaired`；M3.2 注入路径保持可用。
- **联调**：`.shots/relay-pair-integration.mjs`（relay + mock-harness + harness-plugin RelayClient 控制台桥）打印 6 位配对码；Playwright 在连接页输入 `ws://127.0.0.1:4090` + 配对码完成配对，Sessions 出现 2 个 mock session；截图 `.shots/relay-pair-connect.png` / `.shots/relay-pair-sessions.png`；find 证据 `.shots/relay-pair-find.txt` / `.shots/relay-pair-sessions-find.txt`；加密 route 证据 `.shots/relay-pair-route-payload.txt`（payload 仅 `{to, ciphertext, nonce}`）。
- 全仓回归：protocol 100 / mobile 109 / harness-plugin 23 / relay 26 / mock-harness 29 / capture 24，build/typecheck/test 全绿。
- 真机 APNs/FCM 仍留待设备/账号窗口。

### R5a 一次性配对码协议（2026-08-18 已实现）

- 协议新增 `relay.pair.code` / `relay.pair.code.ack`（`RelayEnvelopeType` 加类型，`makePairCode` 构造器 + `RelayPairCodeRequest` / `RelayPairCodeAck` 类型）；`parseRelayEnvelope` 识别新类型。
- relay 服务器处理 `relay.pair.code`：未认证 → `E_AUTH`；已认证但非 console → `E_AUTH`；console 成功取码（6 位、默认 TTL 10 分钟）；码一次性（同一码第二次 `relay.pair` 返回 `E_PAIR`）。
- `harness-plugin/src/relay-client.ts` 增加 `requestPairCode(ttlMs?)`，发送 `relay.pair.code` 并等待 `relay.pair.code.ack`。
- 联调脚本 `.shots/relay-pair-integration.mjs` 改为通过 `relay.pair.code` 取码（不再直接调用 `relay.store`）。

### R1–R5 远程优先窗口（2026-08-18 已实现）

- **R1 远程优先首屏**：`apps/mobile/app/index.tsx` 默认远程模式；顶部横幅文案随模式切换，[远程模式]/[局域网模式] 分段选择；远程模式只填 relay 地址（裸主机自动补 `ws://…:4090`）+ 可选 6 位配对码；LAN 保留主机/端口/token（token 收进高级）。`relayMode.ts` 增补 `toRelayWsUrl` 裸主机/默认端口/IPv6 规则 + 单测。
- **R2 插件能力面**：`packages/protocol/src/plugin.ts` 定义 `PluginCommand` / `PluginSetting` / `PluginListResult` / `PluginExecResult` + lenient 读取器；`harness-plugin/src/plugin-catalog.ts` 参考实现（DSH 注册表接缝 + 本地 manifest 目录 + 默认清单）；mock-harness `fixtures/plugins.json`；App 会话长按菜单动态展示插件指令、设置页插件入口 + `app/plugins.tsx` 插件页（单屏克制）。
- **R3 设置迁移**：设置页扩展为「连接 / 模型与权限 / 插件 / 显示 / 关于」；`host.settings.get/set` 能力可探测（读不到自动隐藏）；模型选择、思考强度、上下文容量细进度条、审批权限状态；App 本地字体大小（小/标准/大，影响聊天正文与列表正文）；检查更新走 GitHub Releases 最新版对比。
- **R4 小白一键远程**：`harness-plugin/src/cli.ts` 提供 `dsh-remote remote`：自动启动内置 relay（4090 被占用时自动选空闲端口）→ 注册 console → `relay.pair.code` 取 6 位码 → 打印小白卡片（relay 地址 + 配对码 + 操作说明）→ 配对成功提示 `已配对 device-xxx` → Ctrl+C 关闭。
- **动效**：模式切换/表单 180–240ms 淡入淡出 + 轻上移；主按钮按下 scale 0.98 + opacity 0.85；尊重系统「减弱动态」。
- 集成证据：`.shots/relay-mode-01-home.png` … `.shots/relay-mode-06-paired-home.png`；find 证据 `.shots/relay-mode-find.txt`。

### M3.7 发布闸门前置（无真机部分，2026-08-17 已实现）

- CI 升级 Node 24（`.github/workflows/ci.yml`）。
- `pnpm audit --prod`：3 个 Expo 工具链传递漏洞（image-size ×2 high、uuid ×1 moderate），非运行时，已记录在 SECURITY.md 发布检查清单。
- `relay/src/sqlite-store.ts`：可选 SQLite 持久化 store（`node:sqlite`，`createSqliteRelayStore(path)`；`createRelayServer` 增加 `store` 选项，CLI 增加 `--store <path>`）；重开保留注册/配对/在线状态。
- `relay/test/relay-multi.test.ts`：多 console/device 隔离验证（在线路由只投配对 peer、离线队列按 peer 隔离）。
- TLS 部署实测（Caddy/Docker）因 Docker Desktop daemon 未启动暂阻塞，已写 BLOCKED.md。
