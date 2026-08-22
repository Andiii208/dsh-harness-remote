# dsh-harness-remote 修复与优化执行计划（2026-08-22）

> 状态：待审批（用户已确认按推荐方案执行）
> 执行方式：新开窗口全自动执行，不需要再问用户
> 目标：把产品推进到「真实 DSH 上真正能用、功能正常、前端设计美观」

---

## 0. 基线与本机真实 DSH 校准结果

### 0.1 仓库基线（已实测）
- `pnpm -r build` 全绿；`pnpm -r test` 退出码 0，mobile 165 / relay 39 / harness-plugin 53 / mock-harness 29 / capture 24 / protocol 127（与 PROGRESS 一致，skipped=0）。
- 构建/测试命令：`pnpm -r build`、`pnpm -r test`、`pnpm -r typecheck`。

### 0.2 本机真实 DSH 环境（2026-08-22 实测）
- `dsh --version` → `0.1.0-rc.7`（CLI）；DSH Desktop 程序版本 `2.0.1`。
- DSH Desktop 正在运行，API 基址由环境变量 `DSH_WEB_URL` 提供：**`http://127.0.0.1:60576`**（注意：端口是动态的，每次启动可能变）。
- `DSH_WEB_URL` 不是用户/机器级持久环境变量；插件运行在 DSH Desktop 内时由 Desktop 注入，因此**插件内桥接探测可用**；但独立运行 `dsh-remote remote` 的普通终端可能没有该变量 → 需要补探测策略。
- 当前 `4090` 端口被本项目插件自动启动的 relay 占用（进程归属 DSH Desktop）；`cloudflared` 隧道也在运行（说明插件自动开隧道逻辑已生效）。
- **探测副作用说明**：校准过程中用空 payload 探测 `session.create` 时，真实 DSH 创建了一个空白会话 `session-39660af4-...`，无害，但会在会话列表里多一条。

### 0.3 真实 RPC 表面（POST /api/<method>，信封 `client-request`）

| 方法 | 实测结果 | App 现状 | 结论 |
|---|---|---|---|
| `host.describe` | ✅ 200，`value.version="0.0.1"` | 可用 | 仅展示，无需改 |
| `session.list` | ✅ 200，`value.items[]`，含 `sessionId/updatedAt(ms)/running/cwd/agentPreset/projections.values` | 解析兼容 | H1 排序 bug 确认 |
| `session.history` | ✅ 200，`value.events[]`（`assistant/chunk` 含 `reasoning-delta` 块） | `applyHistory` 兼容 | 需补 reasoning 展示 |
| `session.models` | ✅ 200，`value.current/groups`，含 `reasoning.efforts` | 解析兼容 | 可用 |
| `session.prompt` | ✅ 存在；`mode` 只接受 `"queue"` 或 `"steer"`（校验错误实证） | 文本发 steer | **H4 方案确认：默认改 queue，加切换** |
| `session.cancel` | ✅ 存在（校验要求 sessionId） | 可用 | 可用 |
| `session.create` | ✅ 存在，空 payload 即创建（返回 `{sessionId, agentPreset}`） | 可用 | 可用 |
| `session.rename` | ✅ 存在（要求 sessionId+title） | 可用 | 可用 |
| `session.fork` | ✅ 存在（要求 sessionId） | 可用 | 可用 |
| `session.selectModel` | ✅ 存在（要求 sessionId+provider+model…） | 可用 | 需实测成功路径 |
| `session.updateQueue` | ✅ 存在（要求 sessionId+itemId+action） | 可用 | 可用 |
| `session.search` | ⚠️ 存在但本部署禁用（`openAt "never"`） | 失败回退本地搜索 | 记录即可 |
| `skill.list` | ✅ 存在（要求已 attach 的 sessionId） | 可用 | 需真实 sessionId 验证 |
| `agentPreset.list` | ✅ 200，`value.presets[]` | 可用 | 可用 |
| `agentPreset.select` | ✅ 存在（要求 sessionId+agentPreset） | 可用 | 需实测成功路径 |
| `workspace.list` | ✅ 200，`value.items[]` | 解析兼容 | 可用 |
| `workspace.archiveSession` | ✅ 存在（要求 sessionId） | 可用 | 可用 |
| `settings.describe` | ✅ 200，`value.writable/hasDocument/namespaces[]`，每个 ns 都有 `value/revision/applies` | 解析兼容 | 可用 |
| `settings.mutate` | ✅ 存在（要求 ns+ops） | 可用 | **需实测成功路径**（我们多传了 expectedRevision） |
| `settings.update` | ✅ 存在（要求 ns+patch） | 未用 | 备用 |
| `host.settings.get` | ❌ 404 | App 隐藏分组 | 默认模型/思考强度需改用 settings 命名空间 |
| `host.settings.set` | ❌ 404 | App 隐藏分组 | 同上 |
| `plugin.list` | ❌ 404 | App 空态 | 插件页真实宿主为空，设置入口应隐藏 |
| `commands/execute` | ✅ 存在；报错「Remote payload must contain exactly one plain-object args field」→ 我们发 `{args:{agentId,line}}` 形状正确 | 需实测成功路径 | 权限切换 `/permission` 需真实验证 |

### 0.4 用户已拍板的决策
1. 用本机真实 DSH 做 Phase 0 校准（已完成大部分探测，执行阶段继续补齐成功路径验证）。
2. 所有推荐方案照做：
   - N5 安全：插件**默认不自动开公网隧道**，改为设置页手动开启。
   - H4：普通消息默认 `mode:"queue"`，composer 增加 queue/steer 切换。

---

## 1. 问题台账（合并两轮深查，按优先级）

### 高优先级（正确性/真实宿主接缝）
| ID | 问题 | 位置 |
|---|---|---|
| H1 | 会话排序尺度混用：`applySessionList` 用服务器 ms `updatedAt` 覆盖排序字段，实时事件又用自增 tick，新活跃会话被排到底部（真实 DSH 已确认返回 ms） | `SessionStore.ts:379-388, 303-364` |
| H2 | 实时事件不记 seq，重载历史可重复消息 | `SessionStore.ts:275-300, 670-783` |
| H3 | 流式暂停把已显示的部分内容从视图抹掉 | `chat/[sessionId].tsx:277` |
| H4 | 文本消息硬编码 `mode:"steer"`；真实 DSH 支持 queue/steer，默认应为 queue 且可切换 | `ConnectionProvider.tsx:314-318` |
| N1 | 默认模型/思考强度走 `host.settings.get/set`，真实 DSH 404；应改走 `settings.describe` 的 `agent-default-model` 等命名空间 | `ConnectionProvider.tsx:466-487`、`settings.tsx` |
| N2 | 通知分类器只认旧格式：Desktop 对象事件、`{key,value}` 投影、`approval/requested`/`question/requested` 帧都会漏报 | `notify/classifier.ts` |
| N3 | `commands/execute` 载荷形状已确认正确（`args` 对象），但成功路径/返回形状未实测；`/permission` 权限切换需真实验证 | `ConnectionProvider.tsx:641-659` |
| N4 | `settingsMutate` 多传 `expectedRevision`，真实 DSH 未验证是否接受；`settings.update` 可作为替代 | `ConnectionProvider.tsx:788-801` |

### 中优先级（UI 与功能不一致/未完成）
| ID | 问题 | 位置 |
|---|---|---|
| M1 | i18n 无切换入口（`setLocale` 无人调用）；审批三页、`formatSessionTime` 星期、`STATE_LABEL` 硬编码中文 | `i18n/index.tsx`、`approval/*`、`sessionViews.ts`、`ConnectionProvider.tsx` |
| M2 | 连接首页不是整屏品牌画布（v9） | `index.tsx` |
| M3 | composer 缺控制行（权限/模型/思考等级/上下文环） | `chat/[sessionId].tsx:765-850` |
| M4 | 无 `/` 命令面板、无 `@` 触发技能 | `chat/[sessionId].tsx` |
| M5 | 历史分页 UI 未接 `beforeSeq` | `chat/[sessionId].tsx:316` |
| M6 | 后台任务只有胶囊，无 Sheet/停止 | `chat/[sessionId].tsx:424-431` |
| M7 | todos/plan 投影不渲染；无目标编辑 Sheet | `chat/[sessionId].tsx` |
| M8 | 队列 edit 是伪编辑（只填草稿） | `chat/[sessionId].tsx:472` |
| M9 | reasoning（思考过程）被 SessionStore 丢弃，真实 DSH 大量 `reasoning-delta` 不展示 | `SessionStore.ts:701-711` |
| M10 | 插件页真实宿主 `plugin.list` 404，设置入口应整行隐藏；插件页空态说明更新 | `settings.tsx:377-384`、`plugins.tsx` |
| M11 | 设置页「模型与权限」离线也出现空组 | `settings.tsx:273` |

### 低优先级（视觉/体验）
| ID | 问题 | 位置 |
|---|---|---|
| L1 | 轨迹泳道按索引等宽，无 Turn 分组 | `TrajectoryView.tsx:142-160` |
| L2 | 应用内事件列表页未实现 | `settings.tsx` |
| L3 | 工作区只有筛选 Sheet，无目录浏览/添加（真实 DSH 有 `workspace.list`，先按现有能力做，目录浏览待探测） | `sessions.tsx` |
| L4 | 插件「加载即自动开公网隧道」安全/UX 风险（用户已拍板：改手动） | `apply.ts:66-71` |
| L5 | 独立 CLI `dsh-remote remote` 在普通终端可能没有 `DSH_WEB_URL`，探测列表 56734/3080 已过时 | `dsh-bridge.ts:67-86` |
| L6 | 空态/骨架缺品牌画布深色变体 | `EmptyState.tsx`、`SkeletonRow.tsx` |

---

## 2. 阶段计划

> 顺序执行：Phase 0 → 1 → 2 → 3 → 4 → 5。每个 Phase 结束必须 `pnpm -r build && pnpm -r test` 全绿，截图证据落 `.shots/`，并在 `PROGRESS.md` 顶部追加阶段完成记录。不允许写跳过/待办占位测试。

### Phase 0：真实宿主接缝校准与修复（本机 DSH 实测）

**目标**：让 App 在当前真实 DSH（`DSH_WEB_URL`，动态端口）上核心链路全部真实可用。

| 任务 | 做法 | 文件 | 验收 |
|---|---|---|---|
| P0-1 | 把 0.2/0.3 的探测结果回填 `docs/COMPATIBILITY.md`：更新真实宿主矩阵（DSH Desktop 2.0.1，API 动态端口，`host.describe.version="0.0.1"`）；标注 `host.settings.get/set`、`plugin.list` 为 404；标注 `session.search` 部署禁用 | `docs/COMPATIBILITY.md` | 矩阵每项有实测依据 |
| P0-2 | `settingsMutate` 真实成功路径验证：用 `settings.mutate` 对一个无害命名空间做一次 set 再改回，确认多传 `expectedRevision` 是否被接受；若被拒，改为先 `settings.describe` 拿 revision 后再 `settings.update` 或去掉多余字段。最终把权限默认预设写路径在真实 DSH 跑通 | `ConnectionProvider.tsx`、`settings.tsx` | 真实 DSH 上默认权限写成功，UI 状态更新 |
| P0-3 | 默认模型/思考强度改走真实设置面：从 `settings.describe` 读取 `agent-default-model`（模型）与思考强度所在命名空间；用 `settings.mutate/update` 写回。删除/隐藏 `host.settings.get/set` 路径（保留能力探测，读不到隐藏） | `ConnectionProvider.tsx`、`settings.tsx`、`settingsDefaults.ts` | 真实 DSH 上默认模型/思考强度可读写 |
| P0-4 | `commands/execute` 成功路径验证：用无害命令（如 `/help` 或返回文本的命令）实测，确认请求 `{args:{agentId,line}}` 与返回形状；修正 `executeCommand` 解析。随后用真实会话验证 `/permission workspace-write` 能切换权限 | `ConnectionProvider.tsx` | 真实 DSH 权限切换成功，UI 反映当前权限 |
| P0-5 | `dsh-bridge` 探测策略补强：保留 `DSH_WEB_URL` 优先，新增 Windows 兜底——枚举 DSH Desktop 进程的 127.0.0.1 监听端口，逐个 `POST /api/host.describe` 探活（只探测不写）；更新 56734/3080 为「历史兼容」。同步修 `remote-access.ts`/`dsh-bridge.ts` | `dsh-bridge.ts`、`remote-access.ts` | 普通终端跑 `node harness-plugin/dist/cli.js remote` 能自动找到 DSH API |
| P0-6 | `session.prompt` 模式校准：确认 queue/steer 都合法（已实测），把 `sendMessage` 默认改 `mode:"queue"`；`ConnectionApi` 增加 `promptMode` 参数 | `ConnectionProvider.tsx` | 单测 + 真实 DSH 发一条 queue 模式消息成功 |

### Phase 1：数据与消息正确性（H1–H3、M9）

| 任务 | 做法 | 文件 | 验收 |
|---|---|---|---|
| P1-1 (H1) | `SessionStore` 排序与展示分离：新增单调 `sortKey`（tick）用于排序；服务器 `updatedAt` 仅存为 `serverUpdatedAt` 供展示，不再覆盖排序字段 | `SessionStore.ts` | 单测：`applySessionList`（毫秒时间戳）后再实时事件，排序仍正确 |
| P1-2 (H2) | 实时事件带 seq 时登记到 `historySeqs`；`applyHistory` 对已有 seq 跳过；修复历史加载尾部 streaming 快照可能产生的重复 | `SessionStore.ts` | 单测：历史→实时 seq N→重载历史，无重复 |
| P1-3 (H3) | 流式暂停改为冻结快照：`streamPaused` 时把 live 内容保留在渲染列表（本地快照），恢复后继续 live 累积 | `chat/[sessionId].tsx` | Playwright：暂停后部分内容仍可见 |
| P1-4 (M9) | `SessionStore` 折叠 `assistant/chunk` 的 `reasoning-delta`/`block-start` 为思考内容；`MessageBubble` 增加默认折叠的「思考」块（v9 规则） | `SessionStore.ts`、`MessageBubble.tsx` | 单测 + Playwright：真实 history 回放能显示思考折叠行 |

### Phase 2：聊天核心功能补全（M3–M8）

| 任务 | 做法 | 文件 | 验收 |
|---|---|---|---|
| P2-1 (M3) | composer 控制行：权限盾牌（弹 Sheet）、模型名+思考等级胶囊（弹模型 Sheet）、上下文环（`contextPercent` 点击弹用量 Sheet）；header「⋯」只留重新加载历史 | `chat/[sessionId].tsx` | Playwright `.shots/composer-control.png` |
| P2-2 (M4) | `/` 命令面板：输入 `/` 弹面板（`/permission`、`/queue`、`/steer`，无能力隐藏），选中填入 | `chat/[sessionId].tsx` | Playwright `.shots/slash-panel.png` |
| P2-3 (M4) | `@` 触发技能面板：输入 `@` 自动打开技能选择（复用现有 picker） | `chat/[sessionId].tsx` | Playwright `.shots/at-skill.png` |
| P2-4 (M8) | 队列 edit：弹输入框 → `updateQueue(id, itemId, {kind:"edit", content:[{type:"text",text}]})` | `chat/[sessionId].tsx` | 单测 + Playwright |
| P2-5 (M5) | 历史分页 UI：滚动到顶（`contentOffset.y < 60`）自动 `loadHistory(id, 500, beforeSeq)`（beforeSeq 取当前最早 seq）；顶部显示「正在加载历史…」 | `chat/[sessionId].tsx` | 500+ 消息 fixture，截图 `.shots/history-load-more.png` |
| P2-6 (M6) | 后台任务 Sheet：点胶囊弹列表（状态/耗时）；停止动作先探测宿主能力（如 `session.updateQueue` 或任务 RPC），无能力则只读 | `chat/[sessionId].tsx` | Playwright `.shots/jobs-sheet.png` |
| P2-7 (M7) | todos/plan 渲染：目标卡下渲染 todos checkbox 行（只读）；`plan` 投影显示「计划模式」眉标；目标编辑 Sheet 调 `goal.edit` | `chat/[sessionId].tsx` | Playwright `.shots/goal-todos.png` |

### Phase 3：通知与 i18n 收尾（N2、M1、M10、M11、L2）

| 任务 | 做法 | 文件 | 验收 |
|---|---|---|---|
| P3-1 (N2) | `classifier` 兼容三种真实格式：Desktop 对象事件（`f.event.type`）、Desktop 投影（`{key,value}` 中 goal/context）、`approval/requested`/`question/requested` 帧 | `notify/classifier.ts` | 单测：三种真实格式都产出通知事件 |
| P3-2 (M1) | 设置页「显示」加语言切换（zh-CN / en）接 `setLocale`；审批三页接入 `useI18n`；`formatSessionTime` 星期走翻译；`STATE_LABEL` 走翻译 | `settings.tsx`、`approval/*`、`sessionViews.ts`、`ConnectionProvider.tsx`、`translations.ts` | i18n parity 测试 + 中英截图 |
| P3-3 (L2) | 应用内事件列表页：设置「未读事件 N」可点击进入列表（类型图标+标题+时间+跳转） | `settings.tsx`、新增 `app/events.tsx` | Playwright `.shots/events.png` |
| P3-4 (M10) | 插件入口：`plugin.list` 读不到/空时设置页整行隐藏；插件页空态文案更新为「当前 DSH 未提供插件清单」 | `settings.tsx`、`plugins.tsx` | 单测（可见性纯函数） |
| P3-5 (M11) | 设置页「模型与权限」组：离线或无任何数据时整组隐藏 | `settings.tsx` | 单测 |

### Phase 4：视觉统一 v9 与体验（M2、L1、L3、L4、L6）

| 任务 | 做法 | 文件 | 验收 |
|---|---|---|---|
| P4-1 (M2) | 连接首页整屏品牌画布：`DeepOceanBackground` 全屏 + hero 文案 + `heroCard/heroStroke` 表单卡 + 品牌 header；状态栏 light | `index.tsx` | 浅/深色截图 `.shots/connect-brand-*.png` |
| P4-2 (L1) | 轨迹泳道按 `durationMs/totalMs` 分段；增加 Turn 分组列表（Turn 头+步骤行） | `TrajectoryView.tsx`、`trajectory.ts` | 单测 + `.shots/trajectory-v2.png` |
| P4-3 (L3) | 工作区 Sheet 增强：保留筛选；若探测到真实 DSH 目录能力则做目录浏览，否则记录为不支持并隐藏入口 | `sessions.tsx` | 视探测结果验收 |
| P4-4 (L6) | `EmptyState`/`SkeletonRow` 增加 `variant="hero"` 深色变体并在 sessions 使用 | `EmptyState.tsx`、`SkeletonRow.tsx`、`sessions.tsx` | 截图 |
| P4-5 (L4) | 插件默认不自动开公网隧道：`apply.ts` 改为默认 `autoStart:false`；设置页面板提供「开启远程访问」主按钮；CLI `dsh-remote remote` 保持显式开启 | `apply.ts`、`remote-service.ts`、`web-rpc.ts`、`client/` | 测试更新；行为变化写入 `SECURITY.md`/`README.md` |

### Phase 5：收尾与发布门禁

| 任务 | 做法 | 文件 | 验收 |
|---|---|---|---|
| P5-1 | 全仓回归：`pnpm -r build && pnpm -r typecheck && pnpm -r test`，skipped=0，测试数 ≥ 基线（protocol 127 / mobile 165 / mock 29 / relay 39 / harness-plugin 53 / capture 24） | 全仓 | 全绿 |
| P5-2 | 全页面 Playwright 证据刷新（连接/会话/聊天/轨迹/审批/设置/插件/事件），浅色+深色 | `.shots/` | 文件齐全 |
| P5-3 | 文档收尾：`PROGRESS.md` 顶部追加本次所有阶段记录；`BLOCKED.md` 更新（真实 DSH 已校准，移除过时阻塞，保留 iOS/EAS/真机推送阻塞）；`README.md` 如有行为变化同步 | 文档 | 与实际一致 |
| P5-4 | 可选：真实 DSH 端到端冒烟（手机或 Web 经 `dsh-remote remote` 连接本机 DSH，完成 连接→会话列表→进会话→发消息→审批 全链路） | 全链路 | 证据 `.shots/real-e2e-*.png` |

---

## 3. 执行边界（新窗口必须遵守）

1. 只允许改：`apps/mobile/app`、`apps/mobile/src`、`apps/mobile/test`、`mock-harness/fixtures`、`mock-harness/src`（仅新增回放分支，不碰既有测试断言）、`harness-plugin/src`、`harness-plugin/test`、`relay/src`、`relay/test`、`packages/protocol/src`、`packages/protocol/test`、`docs`、`.shots`、`PROGRESS.md`、`BLOCKED.md`、`README.md`。
2. 不新增 npm 依赖；不碰 `pnpm-lock.yaml`、CI/发布 workflow、`.github`。
3. 不写跳过/待办占位测试；不 mock 被测对象；不删测试；不放宽断言；不 `|| true`。
4. 不自动 `git add/commit`，除非用户明确指示。
5. 每个 Phase 完成立即更新 `PROGRESS.md`；卡住写 `BLOCKED.md` 并继续下一项；同一验收连败 3 次换下一项。
6. 真实 DSH 写操作只在「无害且可回滚」的前提下执行（如修改设置后要改回；不删除用户会话；`session.prompt` 只在用户明确授权的会话里测试，或使用 mock 验证 payload 形状）。
7. 涉及真实 DSH 的破坏性操作（归档/重命名/派生/权限切换）必须先保存现场值，验证后恢复。

## 4. 完成定义（Definition of Done）

- [ ] Phase 0–5 全部任务完成并记录在 `PROGRESS.md`
- [ ] `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿，skipped=0，测试数 ≥ 基线
- [ ] 真实 DSH 上：连接、会话列表、聊天历史、发送消息（queue 模式）、权限切换、默认模型读写、审批（如可触发）核心链路验证通过，证据落 `.shots/`
- [ ] 通知分类器对真实 DSH 三种帧格式有单测覆盖
- [ ] i18n 可切换，中英界面无硬编码残留（审批页/状态标签/时间格式）
- [ ] 连接页与 sessions 页视觉统一为 v9 品牌画布；composer 控制行齐全
- [ ] 插件默认不自动开公网隧道，改为设置页手动开启，安全文档更新
- [ ] `docs/COMPATIBILITY.md` 真实宿主矩阵更新为 2026-08-22 实测结果
