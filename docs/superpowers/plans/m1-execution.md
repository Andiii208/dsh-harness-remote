# dsh-remote M1 执行计划（遥控闭环：通知 / 保活 / 审批提问 / 消息 / goal-todo）

- 日期：2026-08-16
- 规格来源：`docs/superpowers/specs/2026-08-16-dsh-remote-mobile-design.md` §5 M1 + §3.3 数据流
- 依赖：M0 已交付（protocol 59 / capture 24 / mock-harness 13 / mobile 13 测试全绿；mock-harness 可联调）
- 分支策略：main 直接推进（用户已同意）；SDD 流程：每任务独立实现（控制器）+ 评审子代理把关
- 工作区：`.superpowers/sdd/m1-execution/`（ledger / briefs / reports / reviews）

## Global Constraints（沿用 M0）

1. 不变式：宽容解码、HTTP 仅载体、WS 仅下行、特权 loopback-only（App 网络连接时只读 + 横幅）。
2. `packages/protocol` 纯 TS 零依赖；全仓 strict；测试验证真实行为、输出干净。
3. UI 遵循 `docs/design/UI-SYSTEM.md`（暗色终端质感、无 AI 味）。
4. M1 不做：设置/凭据/子代理目录（M2+）；中继（M3）。
5. 本地通知仅在前台/后台 App 存活时可靠；锁屏通知依赖系统调度（保活为尽力而为，文档注明限制）。

## 任务列表

### M1-T1 — 本地通知接入（expo-notifications）
- 内容：`src/notify/notifications.ts`——请求权限、通知通道（Android channel）、把 `NotificationClassifier` 事件映射为本地通知（标题/正文/深链 data：`approval/<rpcId>`、`chat/<sessionId>`）；`ConnectionProvider` 在 pump 循环里调用；通知点击 → router 深链。devDep 无需（expo-notifications 为 runtime dep）。
- 验收：classifier 事件 → 通知参数映射单测（纯函数抽出）；权限拒绝时不崩溃；`pnpm --filter @dsh-remote/mobile test` + typecheck 绿。

### M1-T2 — 后台任务保活（expo-background-task）
- 内容：注册后台任务：定期 ping（如 15min 间隔）保持/恢复连接——真实行为：App 进后台后 WS 可能被 OS 断开，`ConnectionLoop` 恢复在线时重连；后台任务仅做「心跳探测 + 触发前台可见的重连」；`app.json` 配置 backgroundTask 权限；文档注明 Android 厂商省电限制。
- 验收：后台任务注册代码 + 配置合法（expo config 校验）；逻辑抽纯函数可单测（决策：何时需要重连）；不承诺真机锁屏推送（文档明示）。

### M1-T3 — goal/todo 查看与暂停
- 内容：`goals/*` typert 调用——`goal.list`（或按已折叠投影展示）+ 暂停/恢复（方法名以 mock-harness 扩展为准：新增 goal 相关 unary fixture 到 mock-harness，先定契约再实现）；UI：会话页 goal/todo 折叠卡（投影派生）+ 暂停/恢复按钮；SessionStore 已折叠 goal/todos，扩展 actions。
- 验收：mock-harness 加 goal fixtures（goal/list、goal/pause、goal/resume 回放）；App 端暂停/恢复调通（对 mock-harness 集成测试或逻辑单测）；测试绿。

### M1-T4 — 审批/提问闭环完善
- 内容：通知深链到 `approval/<rpcId>`（已建页面）→ 响应后 `resolvePending` + 通知消除；应答超时/已处理态；提问页补「跳过」。
- 验收：classifier+store 逻辑单测覆盖「响应后去重/清理」；typecheck/test 绿。

### M1-T5 — 真机联调清单与文档
- 内容：`docs/MANUAL.md`——M0/M1 手动清单（adb reverse、真机 Wi-Fi 连 mock-harness、通知/审批/暂停操作路径）；README 更新 M1 状态。
- 验收：清单步骤可执行、与实现一致（评审核对）。

## 验证顺序

1. `pnpm -r typecheck` + `pnpm -r test`（全仓）
2. mock-harness 扩展后 CLI 冒烟（goal fixtures 回放）
3. `npx expo config` 合法
4. 增量提交 + 推送 GitHub；最终全仓评审
