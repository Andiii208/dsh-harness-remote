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

- Android 真机：手机与电脑同一 Wi-Fi，或 `adb reverse tcp:3080 tcp:3080`（USB 时连接 127.0.0.1:3080）。
- iOS 真机：同一 Wi-Fi，连接电脑局域网 IP。

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
- [ ] 后台保活（尽力而为）：App 切后台 >15min 后回来，若离线会自动重连（Android 厂商省电可能限制频率）

## 3. 已知限制（如实告知用户）

- 锁屏推送依赖系统调度；厂商省电策略（小米/华为/OPPO）可能延迟或阻止后台任务。
- iOS 后台任务频率由系统决定，不可保证。
- 后台保活期间状态快照可能冻结：App 被挂起时 `stateRef` 不更新，若 WS 已被 OS 断开，恢复后下一次心跳（≥15min）才判定离线并重连——这是尽力而为的边界。
- 通知深链：warm tap 与冷启动均经 expo-notifications 响应监听处理；若系统延迟投递初始响应，可能漏一次跳转。

## 4. 回归命令

```bash
pnpm -r typecheck && pnpm -r test   # 全仓
```
