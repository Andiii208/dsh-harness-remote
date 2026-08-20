# Harness Remote 下一窗口长程计划

> 本计划承接 `docs/plans/2026-08-18-ui-learning-and-next-plan.md`（已全部完成并通过回归）。
> 目标：把 dsh-harness-remote 移动端从「能看会话、能聊、能审批」推进到「像真正的 AI 工作台」。
> 技术栈不变：Expo RN + TypeScript + @dsh-remote/protocol + mock-harness + Playwright。

## 0. 当前状态（新窗口开工前先核对）

- 基线：`pnpm -r build` 全绿；`pnpm -r test` capture 24 / protocol 127 / mobile 148 / mock-harness 29 / relay 39 / harness-plugin 53；skipped=0。
- 已完成：图片收发与缩略图大图、技能 @ 选择、智能吸底、DeepSeek 风格连接页 hero、mock fixtures（skill.list / session.attachment / image event）、四张 `.shots/plan-*.png` 证据。
- 已修复（本轮深查）：死代码清理、吸底纯函数补测、i18n hero 标题、attachment mediaType 回退、WhaleMark 深色对比、重连后历史不加载。
- 工作区仍有未提交文件，分类见 `PROGRESS.md` Task 6 与「深入复查与修复」；新窗口不要自动 `git add/commit`，除非用户明确指示。

## 1. 已知问题 / 风险

1. 真机未验证：大图 Modal、hero 字体/网格/鲸鱼、智能吸底、技能弹窗只跑过 Web Playwright。
2. mock fixture 只有 1 张 1x1 PNG；多图、JPEG/WebP/GIF、多 attachment 未覆盖。
3. 轨迹数据（tool/call、tool/result、turn/*）已被 `SessionStore` 折叠，但前端没有轨迹视图。
4. 会话写操作（rename/fork/archive）协议已具备，移动端没有入口。
5. 全局默认配置（Agent 预设、默认模型、默认权限）协议已具备，移动端没有 UI。
6. i18n 只覆盖 onboarding + connect；sessions/chat/settings/approval 仍是中文硬编码。
7. 长历史性能：当前 `FlashList` 增量渲染 + 智能吸底可用，但历史分页、事件去重、超大转录的滚动性能还没有压测。
8. P1b 推送通知 + EAS 生产包 + iOS 包：需要 EAS/Apple/FCM 凭据窗口（见 BLOCKED.md）。

## 2. 长程目标与阶段

### Phase A：真机回归与 mock 增强（1 个窗口）
- [ ] A1 真机（Expo Go 或 Android APK）跑通：连接页 hero、sessions、chat、图片大图、技能弹窗、智能吸底。
- [ ] A2 mock-harness fixtures 增加多图会话：`sessions.json` 增加 2 张图（1x1 蓝 + 1x1 绿 PNG base64）的 `user/message`，`session-attachment.json` 增加 `att_2`，验证 `imageRow` 换行与多图大图切换。
- [ ] A3 增加 GIF/JPEG/WebP attachment 回放（可复用 1x1 图转码，不新增依赖），验证 `resolveImageMediaType` 收敛。
- [ ] A4 若真机发现 hero 网格/鲸鱼/字体问题，在 `DeepOceanHero.tsx` 内调整 token 或降级方案。
- 验收：`pnpm -r build` 全绿；`pnpm -r test` ≥ 基线；真机截图 `.shots/real-*.png`；`.shots/plan-*.png` 重新刷新。

### Phase B：轨迹视图（对话/轨迹双视图，核心价值）
- [ ] B1 在 `SessionStore` 增加 `TranscriptStep` 折叠（tool/call、tool/result、turn/start、turn/complete、step/end 事件 → 结构化步骤：type、name、input 摘要、output 摘要、duration 估算、status）。
- [ ] B2 新建 `src/ui/trajectory/TrajectoryView.tsx`：时间线 UI（步骤类型图标、名称、耗时、参数/结果摘要、点开看详情）。
- [ ] B3 `app/chat/[sessionId].tsx` 增加「对话 / 轨迹」左右滑动切换，两个视图独立滚动位置（可用 `FlashList` + 两个 `ref`）。
- [ ] B4 补 `SessionStore` 步骤折叠与 TrajectoryView 纯函数的单测。
- 验收：`pnpm --filter @dsh-remote/mobile build/test` 全绿；Web Playwright 截图 `.shots/trajectory-*.png`。

### Phase C：会话写操作 + 全局默认配置 UI（1 个窗口）
- [ ] C1 `sessions.tsx` 长按菜单接 `renameSession` / `forkSession` / `archiveSession`（现有 store 方法已具备）。
- [ ] C2 设置页或会话页增加「默认模型 / 默认思考强度 / 默认权限」读写（`settings.describe` / `settings.mutate` 或 `agentPreset`）。
- [ ] C3 补 `app/settings.tsx` 与相关纯函数测试。
- 验收：`pnpm -r build/test` 全绿；Playwright 截图 `.shots/settings-defaults-*.png`、`.shots/session-ops-*.png`。

### Phase D：i18n 扩展 + 长历史性能（1 个窗口）
- [ ] D1 `translations.ts` 覆盖 sessions/chat/settings/approval/plugins 全部用户可见文案（保持 en/zh key parity）。
- [ ] D2 历史分页：`session.history` 支持 `beforeSeq`/分页加载，`SessionStore.applyHistory` 按 seq 去重合并。
- [ ] D3 `FlashList` 增量展开可见区（长转录不卡顿），补性能相关单测。
- 验收：全仓回归；i18n parity 测试通过；Playwright 长历史（构造 500+ 消息 fixture）滚动截图。

### Phase E：发布与真机（1 个窗口，需要凭据）
- [ ] E1 EAS 登录，出 Android development/preview 包；真机验证推送通知。
- [ ] E2 iOS 构建（Apple 开发者账号）。
- [ ] E3 把真机截图与发布门禁写入 `docs/MANUAL.md` 与 `PROGRESS.md`。
- 验收：EAS 包产出，真机截图 `.shots/eas-*.png`；`pnpm -r build/test` 全绿。

## 3. 全局约束（沿用）

- 只允许改：`apps/mobile/app`、`apps/mobile/src`、`apps/mobile/test`、`mock-harness/fixtures`、`mock-harness/src`（仅回放分支，不碰测试）、`.shots`、`PROGRESS.md`、`BLOCKED.md`、`docs/plans`。
- 不新增 npm 依赖；不碰 `apps/mobile/package.json`、`pnpm-lock.yaml`。
- 不碰 `packages/protocol`、`relay`、`harness-plugin`、`tools/capture`、CI/验收脚本。
- 不写跳过/待办占位测试、不 mock 被测对象、不删测试、不放宽断言、不 `|| true`。
- 工作区既有 modified 文件（`harness-plugin/*`、`apps/mobile/src/data/goals.ts`、`app/_layout.tsx`、`app/sessions.tsx`、`app/settings.tsx`、`ui/StatusChip.tsx`、`ui/anim.ts`、`ui/chat/GoalCard.tsx`、`test/goals.test.ts`、`.gitignore` 等）除非任务明确要求，否则不要编辑。
- 每个 Phase 完成立即更新 PROGRESS；卡住写 BLOCKED.md；不自动 git add/commit。

## 4. 给新窗口的提示词（直接粘贴）

```text
你是执行者。先按顺序读 PROGRESS.md、BLOCKED.md、docs/plans/2026-08-18-next-window-plan.md。

开工步骤：
1. 读上面三个文件，读 docs/plans/2026-08-18-ui-learning-and-next-plan.md 的 Global Constraints。
2. 核对基线：pnpm -r build 全绿；pnpm -r test 必须 capture 24 / protocol 127 / mobile 148 / mock-harness 29 / relay 39 / harness-plugin 53，skipped=0。数字对不上就停，证据写 BLOCKED.md 最上面。
3. 核对无误后在 PROGRESS.md 顶部追加开工回执，再动工。
4. 按 Phase A → B → C → D → E 顺序执行；每个 Phase 里的 checkbox 逐条做。
5. 每个 Phase 完成立即更新 PROGRESS.md；完成条件按 Phase 验收写。

边界：
- 只允许改：apps/mobile/app、apps/mobile/src、apps/mobile/test、mock-harness/fixtures、mock-harness/src（仅新增回放分支，不碰测试）、.shots、PROGRESS.md、BLOCKED.md、docs/plans。
- 不新增 npm 依赖；不碰 apps/mobile/package.json、pnpm-lock.yaml。
- 不碰判卷标准、测试、验收脚本、CI；不碰 packages/protocol、relay、harness-plugin、tools/capture。
- 不许写跳过/待办占位测试、不许 mock 被测对象、不许删测试、不许放宽断言、不许 || true。
- 会话前已存在的 modified 文件（harness-plugin/*、apps/mobile/src/data/goals.ts、app/_layout.tsx、app/sessions.tsx、app/settings.tsx、ui/StatusChip.tsx、ui/anim.ts、ui/chat/GoalCard.tsx、test/goals.test.ts、.gitignore 等）不要编辑，除非任务明确要求；不要自动 git add/commit，最后报告分类清单等用户决定。

子代理：
- 如需派子代理或使用 agent teams，所有 subagent 统一使用同一供应商的 deepseek-v4-flash-0731 模型。
- 子代理任务必须自包含：给出文件路径、要改什么、验收命令、白名单边界。

完成条件：
- pnpm -r build 全绿。
- pnpm -r test 各包测试数 ≥ 基线（mobile 148，其余 capture 24 / protocol 127 / mock-harness 29 / relay 39 / harness-plugin 53），skipped=0。
- 每个 Phase 的截图证据落在 .shots/，文件存在且可见。
- 每个 Phase 完成立即更新 PROGRESS.md；BLOCKED.md 交付时无则写「无」。
- 在对话里贴实际命令输出（build/test/截图路径），只说做完了不算。
- 卡住就写 BLOCKED.md 继续做别的；同一条验收连败 3 次换下一项。
```
