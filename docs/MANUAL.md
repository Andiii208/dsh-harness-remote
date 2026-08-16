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

- [ ] 连接页输入 `host:port` → 点连接 → 状态徽章变为「在线」，自动跳转 Sessions
- [ ] 会话列表出现 mock fixtures 的两个会话（sessions.json），含标题/工作区/投影缩略
- [ ] 进入会话 → 流式气泡按 chat-stream.json 顺序渲染（delta 累积 → complete）
- [ ] 断线重连：关掉 mock-harness 再启动 → 状态「退避重试」→ 自动恢复「在线」
- [ ] 安全警告横幅在连接页可见（"LAN 直连，无鉴权"）

## 2. M1 清单（遥控闭环）

- [ ] 首次启动弹出通知权限；拒绝后 App 不崩溃
- [ ] 审批：mock approval.json 的 server-request 到来 → 本地通知「权限请求」→ 点击深链进审批页 → 批准/拒绝 → mock-harness `receivedResponds` 记录到应答（可在测试中断言）
- [ ] 提问：通知「提问」→ 深链 → 输入回答或「跳过」
- [ ] 通知去重：同一 rpcId 不重复弹
- [ ] goal 控制：进入有 goal 投影的会话 → GoalCard 显示 objective/todos → 「暂停」→ 状态变 paused（乐观）→「恢复」
- [ ] 发消息：聊天页输入 → 发送 → 输入框清空（mock 回放 `session.prompt` 返回 `accepted:true`；若返回 NOT_FOUND，App 会把草稿还原到输入框）
- [ ] 后台保活（尽力而为）：App 切后台 >15min 后回来，若离线会自动重连（Android 厂商省电可能限制频率）

## 2.5 日志排查

- Expo 终端：`npx expo start` 的输出；RN 运行时错误会以红框显示，也可在 `adb logcat` 中搜 `ReactNativeJS`。
- Android 真机：`adb logcat -s ReactNativeJS:* ExpoModulesCore:* *:S`（只看 App 日志），或 `adb logcat | findstr /i dsh`。
- App 内协议/通知错误以 `[conn]` / `[notify]` / `[keepalive]` / `[goal]` 前缀输出到 console。
- 连接失败排查顺序：mock-harness 是否在跑 → 绑定地址（Wi-Fi 联调必须 `--host 0.0.0.0`）→ 端口 → Windows 防火墙 → 手机与电脑是否同一网络 / `adb reverse` 是否已建（`adb reverse --list`）。

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
