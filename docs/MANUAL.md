# dsh-remote 真机联调清单（M0/M1 手动验收）

> 目标：在真机上验证「连接 → 会话列表 → 流式聊天 → 通知 → 审批 → goal 控制」全链路。
> 前置：`mock-harness` 已启动（无需真实 DSH 即可联调）；或真实 DSH 已开 LAN（见 SECURITY.md）。

## 0. 准备

```bash
# 终端 1：起 mock-harness（内置 fixtures）
pnpm --filter mock-harness build
node mock-harness/dist/cli.js --port 3080

# 终端 2：起 Expo
cd apps/mobile
pnpm start
```

- Android 真机 USB（推荐，免防火墙/路由器配置）：`adb reverse tcp:3080 tcp:3080` 后 App 连接 `127.0.0.1:3080`，mock-harness 保持默认 `127.0.0.1` 绑定即可。
- Android / iOS 真机 Wi-Fi：手机与电脑同一网络，mock-harness 必须监听所有网卡——`node mock-harness/dist/cli.js --port 3080 --host 0.0.0.0`（Windows 防火墙首次会弹窗，允许专用网络访问）。

## 1. M0 清单（连接与聊天）

- [x] 连接页输入 `host:port` → 点连接 → 状态徽章变为「在线」，自动跳转 Sessions
- [x] 会话列表出现 mock fixtures 的两个会话（sessions.json），含标题/工作区/投影缩略
- [x] 进入会话 → 流式气泡按 chat-stream.json 顺序渲染（delta 累积 → complete）
- [x] 断线重连：关掉 mock-harness 再启动 → 状态「退避重试」→ 自动恢复「在线」
- [x] 安全警告横幅在连接页可见（"LAN 直连，无鉴权"）

## 2. M1 清单（遥控闭环）

- [ ] 首次启动弹出通知权限；拒绝后 App 不崩溃（Expo Go 下通知模块禁用，需 development build 验证）
- [x] 审批：mock approval.json 的 server-request 到来 → 待处理横幅进入审批页 → 批准 → pending 计数减少（Expo Go 下本地通知深链禁用，横幅入口等效）
- [x] 提问：待处理横幅进入提问页 → 输入回答并提交 → pending 清零（同上）
- [ ] 通知去重：同一 rpcId 不重复弹（classifier 单测覆盖；Expo Go 下通知禁用，真机验证待 development build）
- [x] goal 控制：进入有 goal 投影的会话 → GoalCard 显示 objective/todos → 「暂停」→ 状态变 paused（乐观）→「恢复」
- [x] 发消息：聊天页输入 → 发送 → 输入框清空（mock 回放 `session.prompt` 返回 `accepted:true`）
- [ ] 后台保活（尽力而为）：App 切后台 >15min 后回来，若离线会自动重连（Expo Go 限制；前台断线自动重连已真机验证，后台保活待 development build）

## 2.5 日志排查

- Expo 终端：`npx expo start` 的输出；RN 运行时错误会以红框显示，也可在 `adb logcat` 中搜 `ReactNativeJS`。
- Android 真机：`adb logcat -s ReactNativeJS:* ExpoModulesCore:* *:S`（只看 App 日志），或 `adb logcat | findstr /i dsh`。
- App 内协议/通知错误以 `[conn]` / `[notify]` / `[keepalive]` / `[goal]` 前缀输出到 console。
- 连接失败排查顺序：mock-harness 是否在跑 → 绑定地址（Wi-Fi 联调必须 `--host 0.0.0.0`）→ 端口 → Windows 防火墙 → 手机与电脑是否同一网络 / `adb reverse` 是否已建（`adb reverse --list`）。

## 2.6 真机验证记录（2026-08-16）

- 设备：Android 真机（MXW-AN00，USB + `adb reverse tcp:3080 tcp:3080` + `tcp:8081`），Expo Go 57.0.3。
- 连接：USB reverse 通道（此机型 Wi-Fi 直连不稳、adb reverse 经实测可用；Expo Go 加载 exp://127.0.0.1:8081）。
- 已验证（见上方勾选项）：连接/会话列表/流式聊天/发消息/审批/提问/goal 暂停/前台断线自动重连/安全警告横幅。
- 真机发现并已修复的 bug（2 个 bug、3 个提交：be951c5 / 5213b64 / d2b0689）：
  1. `app.json` 的 `extra.eas.projectId: null` 会被 Expo 归一化为 `{}`，@expo/cli 57.0.15 codesigning 路径崩溃 → Expo Go manifest 请求超时（"Failed to download remote update"）→ 已移除该字段。
  2. expo-notifications / expo-background-task / expo-task-manager 在 Expo Go（SDK 53+）require 即触发致命错误且绕过 try/catch → 新增 `src/notify/expoEnv.ts`（`isExpoGo()` 检测）+ 三处适配器前置跳过，dev build 下功能不受影响。
- 待验证（需 development build / EAS）：通知权限与去重、深链、后台保活、锁屏推送。

## 2.7 P2 连接体验（新）

### 首启引导
- 首次启动进入 3 步引导（这是什么 → 电脑装插件 → 扫码/自动发现）；「开始使用」后不再出现。

### 自动发现（同一局域网）
- mock-harness 绑定所有网卡：`node mock-harness/dist/cli.js --port 3080 --host 0.0.0.0`。
- 连接页点「自动发现」→ App 取本机 IP、推断 /24 候选并发探活 `GET /api/host.describe` → 列出可用主机，点选即连。
- 限制：Expo Go / Web 预览下 `expo-network` 不可用或拿不到 IP 时自动发现不可用（真机 Wi-Fi 可用）。

### 扫码配对
- 起带配对 token 的 mock-harness：
  `node mock-harness/dist/cli.js --port 3080 --host 0.0.0.0 --pair-token demo-token`
- 取配对载荷：`curl http://<电脑IP>:3080/api/pairing/qr` → 返回 `{ ok:true, result:{ url:"dshremote://pair?host=…&port=…&token=demo-token" } }`。
- 用任意二维码生成器把该 URL 转成 QR；App 连接页「扫码配对」→ 对准扫码 → 自动保存 token、连接并进入 Sessions。
- 深链等效：在手机上用浏览器/邮件打开 `dshremote://pair?…` 也会触发同一连接流程。
- 限制：Web 预览不支持相机（扫码页会提示）；配对 token 一次性、15 分钟 TTL。

### 最近主机与自动重连
- 连接成功（或扫码）后写入最近主机（最多 5 条，SecureStore）；连接页点击即可一键重连；每个主机可单独记住自己的配对 token。
- 冷启动自动连接最近主机（默认开）；设置页有「自动重连」开关——用户主动断开连接会自动关闭该开关，手动连接后恢复。
- 设置页（Sessions 右上「设置」）可查看当前目标主机/远端实例、切换自动重连、本地通知开关（Expo Go 下禁用）、断开连接。
- 会话列表支持下拉刷新（重拉 session.list 全量校准）；上线后自动刷新一次，断线重连后再次自动刷新。

## 2.8 Relay 部署（M3.4 自部署）

### 启动 relay

```bash
pnpm --filter relay build
node relay/dist/cli.js --port 4090          # 默认 127.0.0.1；对外联调用 --host 0.0.0.0
```

- 健康检查：`curl http://127.0.0.1:4090/healthz` → `{"ok":true,"ts":...}`
- 日志：relay 只输出信封元数据（`type/from/to/ts`），不输出 payload/DSH 明文。

### TLS 终止（必须）

- relay 自身只监听明文 WS/HTTP；公网部署必须在反代层终止 TLS。
- Caddy 示例（`Caddyfile`）：

```caddyfile
relay.example.com {
    handle /healthz {
        reverse_proxy 127.0.0.1:4090
    }
    handle {
        reverse_proxy 127.0.0.1:4090
    }
}
```

- 客户端连接用 `wss://relay.example.com`（App 连接页 HOST 填 `wss://relay.example.com?peerId=<consoleId>`）。
- 控制面必须 TLS；WSS 握手用 `?credential=` 携带短时凭证（与 M2 `?pairToken=` 相同的日志权衡）。

### Docker 示例

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY relay/package.json pnpm-lock.yaml ./
# 实际仓库内用 pnpm install --frozen-lockfile；示例从简
COPY relay/dist ./dist
EXPOSE 4090
CMD ["node", "dist/cli.js", "--port", "4090", "--host", "0.0.0.0"]
```

### 环境变量 / 配置

- CLI 参数：`--port`（默认 4090）、`--host`（默认 127.0.0.1）、`--store <path>`（SQLite 持久化）、`--push expo`（Expo Push API 离线唤醒，可选 `EXPO_ACCESS_TOKEN`）。
- 服务器配置项（`createRelayServer`）：`credentialTtlMs`（短时凭证 TTL，默认 12h）、`queueTtlMs`（离线队列 TTL，默认 2 分钟）、`push`（PushProvider，默认 Noop；生产可用 `createExpoPushProviderFromEnv()`）、`rateLimit`（默认 120/分钟，突发 240）、`audit`（审计回调，默认 console 元数据日志）。

### 版本协商

- 客户端 `relay.hello` 携带 `protocolVersion`；relay `relay.hello.ack` 返回 `{ relayVersion, protocolVersion }`，若客户端协议版本不兼容会附加 `compatible: false`（不断连，由客户端决定是否降级/断开）。

### 配对闭环（M3.5，手机输入 6 位码）

- 开发者联调脚本：`.shots/relay-pair-integration.mjs`（dev-only，不在包内）会同时启动 relay（4090）+ mock-harness + console（harness-plugin `RelayClient`），并打印 `RELAY_PAIR_CODE=<6 位码>`。
- App 端步骤：
  1. HOST 填 `ws://127.0.0.1:4090`（或 `wss://relay.example.com`）；relay 模式会显示可选「配对码 · 可选」输入框。
  2. 输入 6 位配对码，点「连接」。
  3. 配对成功后连接页显示 `consoleId · paired`；Sessions 出现 mock session。
- 安全行为：未填配对码时保持 M3.1 明文联调路径；填入配对码后双方自动交换 ECDH 公钥并启用 E2E 加密数据面（relay 只看到 `{to, ciphertext, nonce}`）。

## 3. 已知限制（如实告知用户）

- 锁屏推送依赖系统调度；厂商省电策略（小米/华为/OPPO）可能延迟或阻止后台任务。
- iOS 后台任务频率由系统决定，不可保证。
- 后台保活期间状态快照可能冻结：App 被挂起时 `stateRef` 不更新，若 WS 已被 OS 断开，恢复后下一次心跳（≥15min）才判定离线并重连——这是尽力而为的边界。
- 通知深链：warm tap 与冷启动均经 expo-notifications 响应监听处理；若系统延迟投递初始响应，可能漏一次跳转。
- 独立构建（EAS production，非 Expo Go）：Android 9+ 默认禁明文 HTTP——Phase C 发布前需加 `expo-build-properties` 插件并设 `android.usesCleartextTraffic: true`（需 `pnpm install` 更新锁文件）；iOS 的 ATS 本地网络豁免与 `NSLocalNetworkUsageDescription` 已在 `apps/mobile/app.json` 的 `ios.infoPlist` 配置。Expo Go / development client 不受此限制。

## 4. 回归命令

```bash
pnpm -r typecheck && pnpm -r test   # 全仓
```
