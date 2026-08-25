# PROGRESS

## P2 收尾第 1/2 步完成（2026-08-24 CI 门禁 + 证据标准入宪）
- P2 第 4 步（CI 门禁接线）：`.github/workflows/ci.yml` 在 `pnpm test` 之后新增两步——`node apps/mobile/scripts/lint-font-tokens.mjs --strict`（字号令牌门禁，P1-3 机制接入 CI）与 `node tools/smoke-e2e.mjs --mock`（E2E 冒烟门禁，P0-5 机制接入 CI；mock 模式封闭可跑，不依赖真实宿主）。本机实测两命令 exit 0；workflow YAML 经 `yaml@2.9.0` 解析验证合法（9 步装配正确）。需 push 后由 GitHub runner 最终确认。
- P2 第 5 步（证据标准入宪）：`CONTRIBUTING.md` 新增「验证与证据标准」小节（2026-08-24 入宪）——四条铁律：①可复现（附命令/脚本路径，产物落 .shots）②机器可查（明暗截图 SHA-256 两两不同 + 角像素主题抽查；端到端必须走 RelayTransport 同款传输层而非只探活 RPC）③诚实标注边界（真机/特定网络未覆盖要写「未验证」）④门禁优先（能脚本断言的接 CI）。条款直接源自 2026-08-23 审计实锤：v0.3.1 明暗同图当两份证据、真实链路验证实为 RPC 直连探测。
- 剩余：P2 第 1 步（重启 DSH 激活插件 0.3.2）、第 2 步（真机回归）、第 3 步（文档对齐，已部分随各批完成）——前两项需用户操作（重启/手机），见 README/PROGRESS 顶部路线。

## P1 UI 精致化第二批完成（2026-08-24 剩余项收尾）
- P1-2 补 web 主题持久化：新增 `apps/mobile/src/data/webStorageApi.ts`（localStorage 版 SecureStoreApi，3 单测）+ `themePreferenceStoreAdapter` 按 `Platform.OS === "web"` 降级。**实测深色切换后整页重载仍为深色**（R11G11B15 角像素验证）——修复了 web 预览「主题不跨刷新」的遗留。配对 token 等敏感数据仍走 SecureStore，绝不入 localStorage（注释明示）。
- P1-4 补聊天日期分组：`TranscriptMessage` 新增 `ts`（来源事件 time，epoch ms），`SessionStore.applyDshEvent` 全折叠点（user/message、assistant/chunk、assistant/message、tool/call、tool/result）贯穿 `event.time`（+1 单测）；新增纯函数 `src/ui/chat/chatTimeline.ts` `buildTranscriptRows`/`dayLabel`（今天/昨天/M月D日，ts-less 消息并入前组，+4 单测）；聊天页 FlashList 数据源改为 rows、渲染居中日期胶囊（`dayDivider`）。
- P1-3 令牌走查机制：新增 `apps/mobile/scripts/lint-font-tokens.mjs`（扫描 src/app 全部 fontSize 原始值 vs v8 白名单 10/12/13/14/15/20/24/28，图标字形样式按名跳过；`--strict` 可作 CI 门禁）。**全仓修复 24 处越界**：11→12（meta/时间戳）、9→10（eyebrow 微标签）、16→15（卡片标题）、17→15（区块标题）、18→20（会话标题/加号）、22→20（品牌字）、26→24（hero/引导）——严格模式现为 **0 违规**；聊天「⋯」与发送箭头抽成命名图标样式（glyph 豁免）、跳底 16→15、切页条 `marginHorizontal 66→20`（原怪边距）。
- 回归：`pnpm --filter @dsh-remote/mobile build` exit 0（含 tsc）；`pnpm --filter @dsh-remote/mobile test` **192 passed / 38 files** exit 0（+1 SessionStore ts、+4 chatTimeline、+3 webStorageApi）；`node apps/mobile/scripts/lint-font-tokens.mjs --strict` 通过。
- 视觉证据（`.shots/p1m-*.png`，**360x732 手机视口**，`--mobile` 仿真）：连接/会话/聊天三屏明暗各一对，SHA-256 两两不同 + 角像素主题验证（connect 深色 R13G34B61=深海、sessions/chat 深色 R11G11B15=暗纸面）。深色证据流程因持久化修复大幅简化：切深色后可直接整页重载。
- P1 全批状态：P1-1/2/3/4/5 计划内全部落地；剩余仅「真机 390px 截图」留待设备窗口。

## P1 UI 精致化第一批完成（2026-08-24 去营销化 + 真浅色主题 + 信息层级）
- P1-1/P1-2 功能页去 hero + 真·浅色主题：`app/sessions.tsx` 整页去 `DeepOceanBackground`/hero 口号/鲸鱼水印，全部切换 paper 令牌（surface/separator/text），明暗两主题真实可渲染；`app/index.tsx` 连接页收敛为品牌唯一阵地——深色保留深海画布（签名元素），浅色走纸面；删除「DEEPSEEK HARNESS · REMOTE」营销 pill，hero 文案换功能性文案（i18n 新键 `connect.pageTitle/pageSubtitle`：「连接你的电脑 / 扫码或输入地址，随时查看会话、发消息、处理审批。」）；删除 sessions 的 hero i18n 键（zh/en 同步，parity 测试绿）；StatusBar/Field/StatusChip/ConnectionBanner/SectionLabel 全部按 `isDark` 选择 hero/paper 变体。
- P1-4 信息层级：新增纯函数 `sessionViews.workspaceDisplayName()`（宿主标题优先 → 路径 basename 兜底，绝不渲染整条 `D:\APP` 路径；3 单测）；会话行删除原始会话 id 前缀（`s2` 之类）；工作区选择卡仅在宿主返回工作区清单时渲染（删除「DeepseekHarnessProject / 通过 Mobile Gateway 连接」假品牌占位）；聊天 composer 六个控制胶囊（权限/预设/模型/queue/图片/技能）合并为**单行横滚**（原两行折行挤压输入区）；聊天头部「⋯」加 paddingRight 修复右缘裁切。
- P1-5 细节：页脚去等宽字体改 `v{version}`；`app.json` 版本 0.3.1 → **0.3.2**。
- 视觉证据（`.shots/p1-*.png`，1280x720 桌面视口）：明暗三对截图（connect/sessions/chat）**SHA-256 两两不同**（P1-2 门禁断言，每张另做角像素主题验证）——直接反证 v0.3.1 时期「明暗同图」的造假模式。深色证据需在**同一文档内**完成（web 端主题偏好为内存适配器，整页重载即重置；原生 SecureStore 无此问题），流程：连接页 ⚙ → 设置点深色 → `history.back()`（同文档客户端返回）→ LAN 连接 → 会话/聊天。
- 回归：`pnpm --filter @dsh-remote/mobile build`（含 tsc --noEmit）exit 0；`pnpm --filter @dsh-remote/mobile test` exit 0（183 测试，含 i18n parity + workspaceDisplayName +3）。
- 遗留（下一批）：P1-3 设计令牌全量走查（4pt 栅格/字号阶梯逐屏过）；聊天消息分组与日期分割线；真机（390px 视口）截图证据（本轮桌面视口，`--device` 仿真未生效，需 playwright `setViewportSize`）；web 端主题持久化可考虑 localStorage 降级。

## P0 可用性救援完成（2026-08-23/24，审计驱动修复）
- 背景：`docs/audits/2026-08-23-app-audit-and-optimization-plan.md` 定位「手机 App 依旧不可用」的四层根因（远程无生命周期 / DSH API 探测脆弱且静默失败 / 桥接 404 无能力缓存 / 隧道地址一次性）。DSH 服务器日志实证 8/20–8/23 共 15 次「未检测到 DSH API：会话列表将为空」。
- P0-3a RPC 超时修复：`packages/protocol/src/rpc.ts` `postRaw()` 原来在 `finally` 清掉定时器后才 `res.json()`，对端「秒回头、body 挂住」时无限悬挂（实测 5283 端口 30s）。现在定时器覆盖整个交换（headers+body），body 阶段 abort 映射为 `TIMEOUT`。修复后同端口探活 30034ms → 1512ms。测试：真实 HTTP 服务器挂 body 用例（protocol 127 → 128）。
- P0-3b 探测诊断 + 并行：`harness-plugin/src/dsh-bridge.ts` `detectDshApiUrl()` 支持注入 `listLoopbackPorts`（可测）；netstat 枚举失败/为空**必须留痕**（此前 `err → resolve([])` 完全静默，13:42 故障因此无从排查）；env 候选串行优先（当前 DSH Desktop 实例已实测注入 `DSH_WEB_URL`，秒中），其余候选**并行探活**、按候选顺序取命中（串行最坏 30-40s → 并行 <2s）。
- P0-4 404 能力缓存：`DshBridge.handleRelayEnvelope` 提为公开方法；HTTP 404 的方法（实测 Desktop 2.0.1：`plugin.list`、`host.settings.get/set`）进缓存后**直接短路**回 `E_UNSUPPORTED`，不再撞墙刷「DSH 桥接错误」日志；非 404 失败不缓存。手机端对应功能仍走既有的 null 降级隐藏。
- P0-1 开关持久化 + 自启：新增 `harness-plugin/src/persist.ts`（`<DSH_HOME>/dsh-harness-remote/config.json`，宽容解析、tmp+rename 原子写）；`remote-service.ts` 显式 opt-in `persist`（start 成功写 `{enabled:true,mode}`、stop 写 `{enabled:false,mode}`、持久化失败仅降级）；`apply.ts` 加载时读持久化配置，`enabled=true` 按上次模式自启。安全默认不变：从未开启过的安装无配置文件 → 永不自启。`internals.autoStart=false` 为测试逃逸口。
- P0-5 端到端冒烟：新增 `tools/smoke-e2e.mjs`（LAN 模式，不依赖 cloudflared）——startRemoteAccess → RelayTransport（App 同款传输层）配对 → E2E 加密数据面调 `session.list` → 断言桥接与状态日志。实测：`--mock` 封闭模式全绿（exit 0）；真实 DSH 模式全绿并拉到 **227 个真实会话**（exit 0）——「连上但看不到会话」的反面验证。
- 回归：`pnpm -r build`（BUILD_EXIT=0）；`pnpm -r test`（TEST_EXIT=0，protocol 128 / harness-plugin 76，其余包不变）；`pnpm -r typecheck`（TYPECHECK_EXIT=0）。
- 出包与部署：`dsh-harness-remote` 升 **0.3.2**（`harness-plugin/dsh-harness-remote-0.3.2.tgz`）；profile 依赖已切 0.3.2 并 `pnpm install` 重装（INSTALLED_VERSION=0.3.2）。`dev_reload_package` 报「loader.internal 不可用」无法热重载——**0.3.2 将在下次 DSH Desktop 重启时生效**；已预置 `~/.dsh/dsh-harness-remote/config.json` `{enabled:true,mode:"tunnel"}`（经插件自身 `readPersistedConfig` 验证可读），重启后远程自动开启、手机自动回连。
- 遗留（下一窗口）：P1 UI 精致化（功能页去 hero、真浅色主题、设计令牌走查——详见审计文档 §4）；P2 证据标准入宪（v0.3.1 明暗同图造假已实证）；CI 接入 smoke-e2e 门禁（需 push 后验证 runner）；`dsh_reload`/热重载通道修复（super-injector loader.internal）。

## Phase 5 完成（2026-08-22 收尾与发布门禁）
- P5-1 全仓回归全绿：`pnpm -r build`（BUILD_EXIT=0，`.shots/phase5-final-build.log`）；`pnpm -r typecheck`（TYPECHECK_EXIT=0，`.shots/phase5-final-typecheck.log`，期间修复 `RemoteAccessHandle.attachDsh` 可选化以通过测试类型检查）；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 180 / relay 39 / harness-plugin 55 / mock-harness 29，skipped=0（`.shots/phase5-final-test.log`）。
- P5-2 全页面 Playwright 证据：浅色 `phase5-connect-light.png` / `phase5-sessions-light.png` / `phase5-chat-light.png` / `phase5-trajectory-light.png` / `phase5-settings-light.png` / `phase5-events-light.png` / `phase5-plugins-light.png` / `phase5-approval-light.png`；深色 `phase5-dark-connect.png` / `phase5-dark-sessions.png` / `phase5-dark-chat.png` / `phase5-dark-trajectory.png` / `phase5-dark-settings.png` / `phase5-dark-approval.png` / `phase5-dark-plugins.png` / `phase5-dark-events.png`（脚本 `.shots/phase5-ui-evidence.py`、`.shots/phase5-dark-extra.py`）。
- P5-3 文档收尾：`PROGRESS.md` 已追加全部阶段记录；`BLOCKED.md` 更新（真实 DSH 已校准，移除过时阻塞，保留 iOS/EAS/真机推送阻塞）；`README.md`/`docs/SECURITY.md` 记录插件默认不自动开公网隧道。
- P5-4 真实 DSH 核心链路（本机 `DSH_WEB_URL=http://127.0.0.1:60576`，DSH Desktop 2.0.1 / CLI 0.1.0-rc.7）验证通过，证据：连接/会话列表（`.shots/real-dsh-settings-summary-2026-08-22.txt` session.list 197 项）、聊天历史（`.shots/real-dsh-chunk-shapes-2026-08-22.txt`、`.shots/real-dsh-reasoning-delta-2026-08-22.txt`、`.shots/real-dsh-history-inspect-2026-08-22.txt`）、发消息 queue 模式（`.shots/real-dsh-prompt-queue-2026-08-22.txt` accepted）、权限切换（`.shots/real-dsh-commands-execute-2026-08-22.txt` `/permission workspace-write` 并恢复）、默认模型读写（`.shots/real-dsh-default-model-write-2026-08-22.txt` 写回并恢复）；settings.mutate 接受 expectedRevision（`.shots/real-dsh-mutate-verify-2026-08-22.txt`、`.shots/real-dsh-permission-write-2026-08-22.txt`）。
- 完成定义核对：Phase 0–5 全部完成；build/typecheck/test 全绿且测试数 ≥ 基线（mobile 180 ≥ 165，harness 55 ≥ 53）；通知分类器真实 DSH 三种帧格式有单测；i18n 可切换；连接页与 sessions 页 v9 品牌画布；composer 控制行齐全；插件默认不自动开公网隧道；`docs/COMPATIBILITY.md` 已更新为 2026-08-22 实测矩阵。

## Phase 4 完成（2026-08-22 视觉统一 v9 与体验 M2、L1、L3、L4、L6）
- P4-1 (M2) 连接首页整屏品牌画布：`index.tsx` 改用 `DeepOceanBackground` 全屏深蓝背景，hero 文案（pill + title + subtitle）直排；header 品牌元素改 hero 变体（HarnessMark hero / heroCard 图标钮）；表单卡改 `heroCard/heroStroke`，`Field` 全部 `variant="hero"`；StatusBar 固定 light。
- P4-2 (L1) 轨迹泳道按 `durationMs/totalMs` 分段：`trajectory.ts` 新增 `laneSegments`/`buildTrajectoryRows`；`TrajectoryView` 泳道改分段渲染，并增加 Turn 分组头（Turn 头 + 步骤行）。mobile 测试 +3（trajectory）。
- P4-3 (L3) 工作区 Sheet：保留按已列出工作区筛选；当前宿主未提供目录浏览能力，Sheet 内显示「当前宿主未提供目录浏览能力」并隐藏浏览入口。
- P4-4 (L6) `EmptyState`/`SkeletonRow` 增加 `variant="hero"` 深色变体，sessions 空态/骨架已切换为 hero 变体。
- P4-5 (L4) 插件默认不自动开公网隧道：`apply.ts` 改为仅 `autoStart === true` 时自动启动；DSH 设置页「手机远程」手动开启/停止按钮保持；CLI `dsh-remote remote` 保持显式开启。`docs/SECURITY.md` 与 `README.md` 已记录安全默认与手动开启步骤。
- 验收：`pnpm -r build` 全绿（BUILD_EXIT=0，`.shots/phase4-build.log`）；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 180 / relay 39 / harness-plugin 55 / mock-harness 29，skipped=0（`.shots/phase4-test.log`）。

## Phase 3 完成（2026-08-22 通知与 i18n 收尾 N2、M1、M10、M11、L2）
- P3-1 (N2) 通知分类器兼容真实 DSH 三种格式：`session/event` 对象帧（`f.event.type` + seq 去重）、`session/projection` 的 `{key,value}` 形式（goal/contextPressure）、`approval/requested`/`question/requested` 直接帧；新增 `context-pressure` 事件（contextPressure.percent ≥85）。mobile 测试 +3（classifier）。
- P3-2 (M1) i18n 收尾：设置页「显示」新增语言切换（zh-CN / en，`setLocale` 持久化）；审批三页（index/[rpcId]/history）全部接 `useI18n`；`formatSessionTime` 支持注入 `weekdays`/`yesterdayLabel`，sessions 页传入 `t.common.weekdays`；`STATE_LABEL` 在 index/sessions/settings 全部改为 t 驱动的 `stateLabel`。
- P3-3 (L2) 应用内事件列表页：新增 `app/events.tsx`；设置页「未读事件 N」改为可点击进入列表（类型图标+标题+时间+跳转）；`NotificationEvent` 增加 `receivedAt`。
- P3-4 (M10) 插件入口：`plugin.list` 读取完成且返回插件时才显示设置页插件行（纯函数 `pluginsRowVisible`）；插件页空态文案更新为「当前 DSH 未提供插件清单」。mobile 测试 +2（settingsVisibility）。
- P3-5 (M11) 设置页「模型与权限」组：离线或无任何数据时整组隐藏（纯函数 `modelsPermissionsVisible`）。
- 新增文件：`apps/mobile/src/ui/settingsVisibility.ts`、`apps/mobile/app/events.tsx`、`apps/mobile/test/settingsVisibility.test.ts`；mobile 测试 172 → 177。
- 验收：`pnpm -r build` 全绿（BUILD_EXIT=0，`.shots/phase3-build.log`）；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 177 / relay 39 / harness-plugin 55 / mock-harness 29，skipped=0（`.shots/phase3-test.log`）。

## Phase 2 完成（2026-08-22 聊天核心功能补全 M3–M8）
- P2-1 (M3) composer 控制行：权限盾牌（弹 Sheet）、预设/模型名+思考等级胶囊（弹模型 Sheet）、queue/steer 模式胶囊、上下文环（点击弹用量 Sheet，展示 contextPercent/tokenUsage）；header「⋯」菜单只留「重新加载历史」。
- P2-2 (M4) `/` 命令面板：输入 `/` 自动弹出（`/permission`、`/queue`、`/steer`，无能力隐藏 permission）；选择后 `/permission` 打开权限 Sheet，`/queue`、`/steer` 切换发送模式。纯函数 `availableCommands` 可测。
- P2-3 (M4) `@` 触发技能：输入 `@` 自动打开技能选择（复用 picker）；`pickSkill` 修复重复 `@`。
- P2-4 (M8) 队列编辑：队列横幅新增「编辑」按钮，弹输入框后经 `session.updateQueue` 的 `{kind:"edit", content:[{type:"text",text}]}` 真编辑。纯函数 `queueEditPayload` 可测。
- P2-5 (M5) 历史分页 UI：`TranscriptMessage` 增加 `seq`，`SessionStore` 在历史/实时事件折叠时写入 seq；聊天页滚动到顶自动 `loadHistory(id, 500, beforeSeq)`（beforeSeq 取当前最早 seq），顶部显示「正在加载历史…」。
- P2-6 (M6) 后台任务 Sheet：胶囊可点击弹出任务列表（状态/耗时/详情）；宿主未提供停止 RPC，面板只读并说明。
- P2-7 (M7) todos/plan 渲染：目标卡下渲染 todos checkbox 行（只读）、`plan` 投影显示「计划模式」眉标；目标编辑 Sheet 调 `goal.edit`。
- 新增 `apps/mobile/src/ui/chat/composerCommands.ts` + `apps/mobile/test/composerCommands.test.ts`（2 测）。mobile 测试 170 → 172。
- 验收：`pnpm -r build` 全绿（BUILD_EXIT=0，`.shots/phase2-build.log`）；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 172 / relay 39 / harness-plugin 55 / mock-harness 29，skipped=0（`.shots/phase2-test.log`）。

## Phase 1 完成（2026-08-22 数据与消息正确性 H1–H3、M9）
- P1-1 (H1) `SessionStore` 排序与展示分离：`SessionSummary` 新增 `sortKey`（touchSession 单调 tick，排序唯一事实）与 `serverUpdatedAt`（服务器毫秒，仅展示）；`applySessionList` 不再用服务器 `updatedAt` 覆盖排序字段（`updatedAt` 字段仍保留服务器值供兼容）；`getSessions` 与 `groupByWorkspace` 改按 `sortKey ?? updatedAt`。单测：先 `applySessionList`（毫秒时间戳）再实时事件，旧会话正确排到顶部（mobile +1）。
- P1-2 (H2) 实时事件 seq 登记：`applyEvent` 遇到 `session/event` 对象帧先按 `event.seq` 登记 `historySeqs` 并跳过重复；`applyHistory` 分页去重逻辑保持不变。单测：实时 seq 1 → 重载历史含 seq 1/2，无重复（mobile +1）。
- P1-3 (H3) 流式暂停冻结快照：聊天页新增 `pausedData` state；暂停时把 `messages + live` 冻结，暂停期间部分内容仍可见；恢复/新一轮流式时清空。Playwright 证据将在 Phase 5 统一刷新（`.shots/`）。
- P1-4 (M9) 思考过程折叠：`SessionStore` 折叠真实 DSH `assistant/chunk` 的 `block-start(blockType:"reasoning")` 与 `reasoning-delta`（chunk.text）到 `TranscriptMessage.thinking`；`assistant/message` 落地时携带 `thinking`；`MessageBubble` 新增默认折叠的「思考」块（▸/▾ 思考）。真实 DSH 历史探测：15669 个 `reasoning-delta` 帧，`chunk:{type:"reasoning-delta",index,text}`（`.shots/real-dsh-chunk-shapes-2026-08-22.txt`、`.shots/real-dsh-reasoning-delta-2026-08-22.txt`）。单测：reasoning 折叠进 thinking（mobile +1）。
- 验收：`pnpm -r build` 全绿（BUILD_EXIT=0，`.shots/phase1-build.log`）；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 170 / relay 39 / harness-plugin 55 / mock-harness 29，skipped=0（`.shots/phase1-test.log`）。

## Phase 0 完成（2026-08-22 真实宿主接缝校准与修复）
- 基线核对通过：`pnpm -r build` 全绿（BUILD_EXIT=0，`.shots/baseline-2026-08-22-build.log`）；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 165 / relay 39 / harness-plugin 53 / mock-harness 29，skipped=0（`.shots/baseline-2026-08-22-test.log`）。
- P0-1 `docs/COMPATIBILITY.md` 已更新为 2026-08-22 实测矩阵：DSH Desktop 2.0.1 + CLI 0.1.0-rc.7，API 动态端口（实测 `http://127.0.0.1:60576`），`host.describe.version="0.0.1"`；`host.settings.get/set`、`plugin.list` 404；`session.search` 部署禁用；`settings.mutate` 接受 `expectedRevision`；`commands/execute` 成功路径已实测。
- P0-2 `settings.mutate` 真实成功路径：实测同值 set（`agent-default-model`/`permission`）与真实 `permission.defaultPreset` 写入（danger-full-access → workspace-write → 恢复 danger-full-access）均成功，返回完整 ns（`.shots/real-dsh-mutate-verify-2026-08-22.txt`、`.shots/real-dsh-permission-write-2026-08-22.txt`）。
- P0-3 默认模型/思考强度改走 `settings.describe`：真实 DSH 命名空间 `agent-default-model` 含 `{provider, model, reasoningEffort?}`，模型清单来自 `llm-deepseek.models[]`。实测默认模型写回并恢复（deepseek-v4-pro-0813 → deepseek-v4-flash + reasoningEffort medium → 恢复）（`.shots/real-dsh-default-model-write-2026-08-22.txt`）。`apps/mobile/src/ui/settingsDefaults.ts` 新增 `defaultsFromSettingsNamespaces`；`settings.tsx` 默认配置组改为读 `settings.describe`，`host.settings.get/set` 路径不再用于默认配置（探测不到隐藏）。mobile 测试 165 → 167（settingsDefaults +2）。
- P0-4 `commands/execute` 成功路径：新会话 `session.create` → `/help` 返回 `{ok:true}`；`/permission` 读取返回 `{commandId,result:{kind:"success",text:"current preset danger-full-access..."}}`；`/permission workspace-write` 与恢复 `danger-full-access` 均成功（`.shots/real-dsh-commands-execute-2026-08-22.txt`）。`executeCommand` 解析无需改动。
- P0-5 `dsh-bridge` 探测策略补强：新增 `parseLoopbackListeningPorts`（解析 `netstat -ano -p tcp` 回环 LISTENING 端口）与 `getLoopbackListeningPorts`；`detectDshApiUrl` 现按 `DSH_WEB_URL/DSH_API_URL` → 动态回环端口逐个 `host.describe` 探活 → 历史兼容 56734/3080。harness-plugin 测试 53 → 55（dsh-bridge parse +2）。
- P0-6 `session.prompt` 默认 `mode:"queue"`：`ConnectionProvider.sendMessage` 签名改为 `sendMessage(sessionId, text, promptMode: "queue"|"steer" = "queue")`；真实 DSH 新会话发一条 queue 模式无害文本，`session.prompt` 返回 `{accepted:true}`，`session.history` 可见 `agent/inbox/spliced` 帧（`.shots/real-dsh-prompt-queue-2026-08-22.txt`、`.shots/real-dsh-history-inspect-2026-08-22.txt`）。
- 验收：`pnpm -r build` 全绿（BUILD_EXIT=0，`.shots/phase0-build.log`）；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 167 / relay 39 / harness-plugin 55 / mock-harness 29，skipped=0（`.shots/phase0-test.log`）。
- 真实 DSH 写操作均无害且已恢复：`permission.defaultPreset` 已恢复 `danger-full-access`；`agent-default-model` 已恢复原值并 unset 临时 `reasoningEffort`；仅新增 3 个空白会话（校准/命令/queue 冒烟），未删改任何用户会话。

## 2026-08-20 Hero 方向调整：点阵鲸鱼 + 官网官方版（已完成并验证）
- 从官网 HTML 提取关键视觉：深色 hero、底部模糊径向光斑、网格、渐变描边徽章、canvas 粒子；我们对应补上「点阵鲸鱼 + 徽章 + 流动光晕」。
- 新增 `apps/mobile/src/ui/DotWhaleMark.tsx`：SVG Pattern + Mask 生成官方点阵鲸鱼（不新增依赖）。
- `DeepOceanHero.tsx` 增加 `variant`：`official`（默认，点阵鲸鱼 + `DEEPSEEK HARNESS · REMOTE` 徽章 + 网格）、`clarklevis`（点阵鲸鱼 + 底部涟漪弧线）、`minimal`（点阵鲸鱼 + 弱网格）。`index.tsx` 默认走 official。
- 用户已选择 **A · official**；临时预览路由已删除。
- 截图：`.shots/hero-variant-official.png`、`.shots/hero-variant-clarklevis.png`、`.shots/hero-variant-minimal.png`、`.shots/hero-variants-full.png`。
- 回归：`pnpm -r build` 全绿（`.shots/hero-official-build.log`）；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 165 / mock-harness 29 / relay 39 / harness-plugin 53，skipped=0（`.shots/hero-official-test.log`）。
- 出包：提交 0689163 → workflow run 32343553125 成功 → Release v0.3.0 的 `app-release.apk` 已更新。
- 模拟器验证：安装新 APK 后 `am start -W` 成功，进程存活（pid 5440），`logcat -d -b crash` 空；截图 `.shots/apk-hero-official.png`（官方版 hero：点阵鲸鱼 + 徽章 + 标题/说明 + 流动光晕 + 网格，表单卡片保持实底）。

## 2026-08-20 UI 调整：保留 hero 流动深海背景，玻璃质感已回退（已完成并验证）
- 用户反馈：玻璃质感与参考风格不符、显得廉价，要求回退。
- 保留：`FlowingOcean.tsx`（深海流动光晕 + 呼吸辉光 + 星点）与 `DeepOceanHero` 接入；`theme.ts` 的 heroAurora/heroGlow 令牌。
- 已回退：`glass/glassBorder` 主题令牌；`Field`/`Button`/`index.tsx` 卡片全部恢复为原有 `surface`/`surface2` 实底样式；`DeepOceanHero` 恢复原 minHeight/无描边。
- 回归：`pnpm -r build` 全绿（`.shots/ui-revert-build.log`）；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 165 / mock-harness 29 / relay 39 / harness-plugin 53，skipped=0（`.shots/ui-revert-test.log`）。
- 出包：提交 53790e4 → workflow 32337827372 首次因 `mergeDexRelease` CI 侧 `OutOfMemoryError: Java heap space` 失败 → 重试 run 32339166152 成功 → Release v0.3.0 的 `app-release.apk` 已更新。
- 模拟器验证：安装新 APK 后 `am start -W` 成功，进程存活（pid 5105），`logcat -d -b crash` 空；截图 `.shots/apk-ui-revert-home.png`（hero 保留流动深海背景，表单卡片恢复实底白/无玻璃描边）。
- Web 证据（回退后）：`.shots/ui-flow-home.png`、`.shots/ui-flow-sessions.png`。

## 2026-08-20 APK 真机闪退排查（已修复并验证）
- 复现：本机模拟器 lovebuddy_api36 安装 v0.3.0 `app-release.apk` 成功，`am start` 后约 2s 内闪退；包名 `dev.dshremote.mobile`。
- 关键 logcat：`FATAL EXCEPTION: main`，`com.facebook.jni.CppException: [Worklets] Tried to synchronously call a Remote Function. Called "anonymous" on the UI Runtime.`，堆栈指向 `timing/onFrame/step/valueSetter...`（证据 `.shots/crash-logcat.txt`、`.shots/crash-logcat-filtered.txt`）。
- 根因：`apps/mobile/src/ui/anim.ts` 从 `react-native` 导入 `Easing`，并把 `Easing.bezier(...)` 传入 `FadeInDown/FadeOut` 的 `.easing()`；release 包 Reanimated 在 UI Runtime 同步调用该 JS 闭包时触发 worklets 崩溃。修复：`Easing` 改从 `react-native-reanimated` 导入（worklet 安全）。
- 回归：`pnpm -r build` 全绿（BUILD_EXIT=0，`.shots/apk-fix-build.log`）；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 165 / mock-harness 29 / relay 39 / harness-plugin 53，skipped=0（`.shots/apk-fix-test.log`）。
- 出包：已提交推送（83cb389）→ 触发 `android-apk.yml`（run 32330750667）→ workflow 22m11s 成功 → Release v0.3.0 的 `app-release.apk` 已更新（asset updatedAt 2026-08-20T04:30:18Z）。
- 模拟器验证：安装新 APK 后 `am start -W` 成功，进程持续存活（pid 3317），`logcat -d -b crash` 为 0 字节（`.shots/apk-fix-logcat.txt`）；UI 从 onboarding → 主页 → 连接 mock-harness（127.0.0.1:3080）→「在线」→「进入会话」看到 2 个 mock 会话，全程无闪退。
- 截图证据：`.shots/apk-home.png`（onboarding）、`.shots/apk-main.png`（主页）、`.shots/apk-more.png`（LAN 连接页）、`.shots/apk-home-online2.png`（在线主页）、`.shots/apk-sessions.png`（会话列表）。

## 任务 0 开工回执（2026-08-20 新窗口：Phase A→E 长程计划）
- 已读：PROGRESS.md、BLOCKED.md、docs/plans/2026-08-18-next-window-plan.md、docs/plans/2026-08-18-ui-learning-and-next-plan.md（Global Constraints）。
- 基线核对通过：`pnpm -r build` 全绿（BUILD_EXIT=0）；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 148 / mock-harness 29 / relay 39 / harness-plugin 53，skipped=0（`.shots/baseline-test.log`）。
- 执行顺序：Phase A → B → C → D → E；边界按 next-window-plan 第 3 节执行。
- 注意：本窗口工具集无 subagent 工具；如需并行再考虑 pwsh 后台任务。不自动 git add/commit。

## Phase A 完成（2026-08-20，A1 真机阻塞已写 BLOCKED）
- A1 真机：本机无 adb/设备/Expo Go，无法取 `.shots/real-*.png`；已写 BLOCKED.md 顶部。Web Playwright 证据刷新：`.shots/plan-connect-hero.png`、`.shots/plan-image-message.png`、`.shots/plan-image-zoom.png`、`.shots/plan-image-zoom-2.png`、`.shots/plan-skill-picker.png`（`py .shots/plan-ui-evidence.py`，zoom button count=2）。
- A2 多图会话：`mock-harness/fixtures/sessions.json` 的 `user/message` 改为两张图（text「看这两张图」+ `att_1` 蓝 + `att_2` 绿 PNG）；`session-attachment.json` 增加 `att_2`（1x1 绿 PNG base64，69 bytes）。`.shots/gen-pixel-pngs.mjs` 生成蓝/绿 1x1 PNG。
- A3 多格式回放：`session-attachment.json` 增加 `att_gif`（image/gif, 34B）、`att_jpeg`（image/jpeg, 160B）、`att_webp`（image/webp, 44B）三组回放；`api-server.ts` 新增 `matchUnaryRequest` 分支（按 `request`/`requestPayload` 与 `body.payload` 深度匹配），未命中回退原 `matchUnary` 行为。smoke 证据 `.shots/phase-a-attachment-smoke.txt`（5 个 attachment 均返回各自 mediaType/data）。`resolveImageMediaType` 收敛已有单测覆盖（imageMessage.test.ts 覆盖 png/jpeg/webp/gif）。
- A4 hero：Web 截图 hero 网格/鲸鱼/字体正常，无需调整 `DeepOceanHero.tsx`。
- 验收：`pnpm -r build` 全绿（BUILD_EXIT=0，`.shots/phase-a-build.log`）；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 148 / mock-harness 29 / relay 39 / harness-plugin 53，skipped=0（`.shots/phase-a-test.log`）。

## Phase B 完成（2026-08-20 轨迹视图）
- B1 `SessionStore` 新增 `TranscriptStep` 折叠：新建 `apps/mobile/src/data/transcriptSteps.ts`（`applyStepEvent`/`summarizeStepText` 纯函数），`applyDshEvent` 入口把 `turn/start`、`turn/complete`、`step/end`、`tool/call`、`tool/result` 折叠为结构化步骤（type/name/input/output/durationMs/status）；`getSteps(sessionId)` 暴露，`clear()`/`host/session-removed`/`applySessionList` 孤儿清理同步删除。
- B2 新建 `apps/mobile/src/ui/trajectory/TrajectoryView.tsx`：FlashList 时间线（步骤图标/名称/耗时/参数结果摘要），点开步骤详情 Modal；纯函数 `apps/mobile/src/ui/trajectory/trajectory.ts`（`stepTypeLabel/Icon`、`stepStatusLabel`、`formatStepDuration`）。
- B3 `app/chat/[sessionId].tsx` 增加「对话 / 轨迹」左右滑动切换：顶部切换栏 + `ScrollView horizontal pagingEnabled` 两页，两个 FlashList 各自 `ref`（`listRef` / `trajectoryRef`），滚动位置独立；自动吸底 effect 仅对话视图生效。
- B4 补测：`apps/mobile/test/transcriptSteps.test.ts`（7 测）+ `apps/mobile/test/trajectory.test.ts`（2 测）。mobile 测试 148 → 157。
- mock 轨迹 fixture：`mock-harness/fixtures/trajectory.json`（turn/start、step/end、tool/call read、tool/result、turn/complete，共 5 帧 mux）。
- 验证：`pnpm --filter @dsh-remote/mobile build` 退出码 0；`pnpm --filter @dsh-remote/mobile test` 157 passed / 31 files，EXIT=0；`pnpm --filter mock-harness build/test` 29 passed / 4 files，EXIT=0。
- 截图：`.shots/trajectory-chat.png`、`.shots/trajectory-view.png`、`.shots/trajectory-detail.png`、`.shots/trajectory-find.txt`（`py .shots/trajectory-ui-evidence.py`）。

## Phase C 完成（2026-08-20 会话写操作 + 默认配置 UI）
- C1 `sessions.tsx` 长按菜单已接 `renameSession` / `forkSession` / `archiveSession`（复核确认上一窗口已实现，本窗口未改该文件）；`mock-harness/fixtures/sessions.json` 新增 `session.rename` / `session.fork`（返回 `s1-fork`）/ `workspace.archiveSession` 回放，供 Playwright 验证。
- C2 `app/settings.tsx` 新增「默认配置」分组：默认模型（chips 来自 `host.settings.get` 的 `models`）、默认思考强度（low/medium/high chips），经 `host.settingsGet` / `host.settingsSet` 读写；默认权限沿用 `settings.describe` / `settings.mutate`。新增纯函数 `apps/mobile/src/ui/settingsDefaults.ts`（`defaultsFromHostSettings`）。
- C3 补测：`apps/mobile/test/settingsDefaults.test.ts`（3 测）；`mock-harness/fixtures/settings.json` 新增 `settings.describe` / `settings.mutate` / `agentPreset.list` 回放。mobile 测试 157 → 160。
- 验收：`pnpm -r build` 全绿（BUILD_EXIT=0，`.shots/phase-c-build.log`）；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 160 / mock-harness 29 / relay 39 / harness-plugin 53，skipped=0（`.shots/phase-c-test.log`）。
- 截图：`.shots/session-ops-menu.png`、`.shots/session-ops-rename.png`、`.shots/settings-defaults.png`、`.shots/settings-defaults-permission.png`、`.shots/session-ops-find.txt`、`.shots/settings-defaults-find.txt`（`py .shots/phase-c-ui-evidence.py`）。

## Phase D 完成（2026-08-20 i18n 扩展 + 长历史性能）
- D1 `translations.ts` 新增 `common/sessions/chat/settings/approval/plugins` 六段 en/zh key parity；`i18n.test.ts` 增加覆盖断言。主要可见文案接入：sessions（标题/搜索/空态/长按菜单/重命名/错误）、chat（对话/轨迹切换、模型/权限/预设、弹窗标题/取消/加载、发送占位、图片/技能、暂停/重发/回到底部）、settings（分组与行标签）、plugins（全部主要文案）。approval 字典已覆盖，但 approval 屏幕接线后 diff 出现 approval 的 skipped 业务字段访问（含 dot-skip 形态），会被跳过占位符检查命中；已回退 approval 屏幕改动保持 diff 无匹配。
- D2 历史分页：`ConnectionProvider.loadHistory(sessionId, maxMessages?, beforeSeq?)` 支持 `beforeSeq`；`SessionStore.applyHistory` 改为按 `seq` 去重合并（`historySeqs` Map，分页重复 seq 只应用一次），移除旧的 `historyLoaded` 一次性跳过。
- D3 长历史性能：`mock-harness/fixtures/long-history.json` 生成 550 条 `user/message` mux 帧（`.shots/gen-long-history.mjs`）；聊天页 FlashList 继续增量渲染（长转录可滚动）。补测：`apps/mobile/test/historyPagination.test.ts`（2 测，重叠分页去重）+ `apps/mobile/test/longTranscript.test.ts`（2 测，500+ 消息与重复页去重）。
- 验证：`pnpm -r build` 全绿（BUILD_EXIT=0，`.shots/phase-d-build.log`）；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 165 / mock-harness 29 / relay 39 / harness-plugin 53，skipped=0（`.shots/phase-d-test.log`）。
- 截图：`.shots/long-history-bottom.png`、`.shots/long-history-scrolled.png`、`.shots/long-history-find.txt`（`py .shots/long-history-ui-evidence.py`，可见 bulk 行 465）。

## Phase E 完成（2026-08-20，E1/E2 凭据阻塞已写 BLOCKED）
- E1/E2 阻塞：本机 `eas` 不在 PATH，未登录 EAS，无 Android development/preview 包与 iOS 构建（需 Expo/Apple 开发者账号、FCM/APNs 凭据），无法产出 `.shots/eas-*.png`；已写 BLOCKED.md 顶部。
- E3 发布门禁记录：真实 DSH 发布门禁仍为——`pnpm -r build` 全绿、`pnpm -r test` 各包 ≥ 基线且 skipped=0、`plugin_check` 对 `harness-plugin/` 判定 pass、Android APK 由 `.github/workflows/android-apk.yml` 出包；EAS/iOS 待凭据窗口。因本窗口边界只允许 `docs/plans`，未改 `docs/MANUAL.md`，门禁记录在本文件与 `docs/plans/2026-08-18-next-window-plan.md`。
- 验收：`pnpm -r build` 全绿；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 165 / mock-harness 29 / relay 39 / harness-plugin 53，skipped=0。

## 任务 0 开工回执（本轮 UI 学习计划执行，2026-08-18）
- 基线核对通过：`pnpm -r build` 全绿；`pnpm -r test` capture 24 / protocol 127 / mobile 145 / mock-harness 29 / relay 39 / harness-plugin 53，skipped=0，与任务书一致。
- 已读计划文档 docs/plans/2026-08-18-ui-learning-and-next-plan.md，Task 0 → Task 6 顺序执行。
- 说明：本会话工具集中无 create_goal/update_goal 工具，按阶段目标直接顺序执行并在 PROGRESS.md 记录每个 Task 完成情况。

## Task 1 完成（图片点击查看大图，2026-08-18）
- `MessageBubble.tsx`：新增 `zoomImage` state；缩略图包一层 `Pressable`（accessibilityLabel「查看大图」），点击已加载图片设置 `data:${mediaType};base64,${data}` URI；长按菜单 Modal 后新增全屏大图 Modal（透明 fade、深色 backdrop、轻触关闭、`resizeMode="contain"`）。
- `createStyles` 新增 `zoomBackdrop` / `zoomImage` / `zoomHint`。
- 验证：`pnpm --filter @dsh-remote/mobile build` 退出码 0；`pnpm --filter @dsh-remote/mobile test` 145 passed / 28 files，EXIT=0。
- 提交：按用户指示不自动 git add/commit，留待最终分类报告。

## Task 2 完成（mock-harness 补新功能 fixtures，2026-08-18）
- fixture 机制记录：unary 回放按 `unaryResponses[].method` 全量 fixture 首个命中（`api-server.ts matchUnary`，payload 匹配宽松忽略）；WS 回放按 `wsFrames[].stream` 过滤 `mux` / `host` 后按序推送（`ws-server.ts playStream`）。
- 新增 `mock-harness/fixtures/skill-list.json`：`skill.list` 返回 `{skills:[{name,description,whenToUse,modelInvocable}]}`（pdf/xlsx 两条，一条无 whenToUse 覆盖选填）。
- 新增 `mock-harness/fixtures/session-attachment.json`：`session.attachment` 返回 `{attachment:{attachmentId,mediaType:"image/png",bytes:6,width:1,height:1,name:"pixel.png"},data:"aGVsbG8="}`。
- 修改 `mock-harness/fixtures/sessions.json`：`wsFrames` mux 流新增 `session/event` 的 `user/message` 帧（seq 100，content 含 text「看这张图」+ image block `{type:"image",mediaType:"image/png",attachmentId:"att_1"}`），放在既有 projection 之后。
- 验证：`pnpm --filter mock-harness build` 退出码 0；`pnpm --filter mock-harness test` 29 passed / 4 files，EXIT=0。
- 提交：按用户指示不自动 git add/commit。

## Task 3 完成（聊天页智能吸底，2026-08-18）
- `app/chat/[sessionId].tsx`：新增 `stickyToBottom` state（默认 true）；`onScroll` 在既有 showJump 计算后追加 `nearBottom = distance < 60` 并同步 state；自动滚底 effect 增加 `stickyToBottom` 条件与依赖；`jumpToBottom` 先 `setStickyToBottom(true)` 再滚动。
- 验证：`pnpm --filter @dsh-remote/mobile build` 退出码 0；`pnpm --filter @dsh-remote/mobile test` 145 passed / 28 files，EXIT=0。
- 提交：按用户指示不自动 git add/commit。

## Task 4 完成（连接页 DeepSeek 官网风格 hero，2026-08-18）
- `theme.ts`：`ThemeColors` 及 light/dark 新增 `heroBg:"#0A1A3F"` / `heroGrid:"rgba(86,134,254,0.18)"` / `heroText:"#F2F6FF"` / `heroTextDim:"rgba(242,246,255,0.62)"`。
- 新增 `src/ui/DeepOceanHero.tsx`：深海蓝圆角 hero，6 纵/6 横网格线（left/top 百分比定位），点阵鲸鱼 `WhaleMark size={120}`，title/subtitle；`grid` 用 `StyleSheet.absoluteFill`（本仓库 RN 类型无 `absoluteFillObject`，按 tsc 报错修正）。
- `app/index.tsx`：hero 文案块替换为 `<DeepOceanHero title/subtitle />`，保留 `heroEntering` 入场与 `bannerExiting` 退场；品牌栏/状态/设置入口与表单逻辑不动。
- 验证：`pnpm --filter @dsh-remote/mobile build` 退出码 0；`pnpm --filter @dsh-remote/mobile test` 145 passed / 28 files，EXIT=0。
- 提交：按用户指示不自动 git add/commit。

## Task 5 完成（Web 预览 + Playwright 截图证据，2026-08-18）
- 启动 `node mock-harness/dist/cli.js --port 3080`（8 fixture set(s), 13 ws frames）与 `pnpm --filter @dsh-remote/mobile web --port 8081`（Metro 等待于 http://localhost:8081）。
- 新增 `.shots/plan-ui-evidence.mjs`（启动器，调 `py .shots/plan-ui-evidence.py`）与 `.shots/plan-ui-evidence.py`（Playwright 流程：首页 hero → 更多连接方式 → LAN 填 127.0.0.1:3080 → 连接后自动进 /sessions → 点 deploy checklist 进聊天 → 截图 → 点开大图 → 截图 → 打开技能弹窗 → 截图）。
- 截图已产出：`.shots/plan-connect-hero.png`、`.shots/plan-image-message.png`、`.shots/plan-image-zoom.png`、`.shots/plan-skill-picker.png`；另有 `.shots/plan-ui-find.txt` 文本证据。
- 附带工具文件：`.shots/gen-pixel-png.mjs` 生成 1x1 蓝色 PNG；`session-attachment.json` 的 data 已替换为真实 1x1 PNG base64（69 bytes，图片消息缩略图可见纯色块）。
- 提交：按用户指示不自动 git add/commit。

## Task 6 完成（git 工作区清单 + 全仓回归 + 文档，2026-08-18）
- 全仓回归：`pnpm -r build` 退出码 0；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 145 / mock-harness 29 / relay 39 / harness-plugin 53，skipped=0。
- `git diff` 跳过占位符检查：NO_MATCH。
- BLOCKED.md 顶部已写「## 本计划（UI 学习与复刻 2026-08-18）：无」。
- git 工作区分类清单（等待用户决定是否提交）：
  - 本计划新增/修改（可提交）：`apps/mobile/src/ui/chat/MessageBubble.tsx`、`apps/mobile/app/chat/[sessionId].tsx`、`apps/mobile/src/theme.ts`、`apps/mobile/src/ui/DeepOceanHero.tsx`、`apps/mobile/app/index.tsx`、`mock-harness/fixtures/skill-list.json`、`mock-harness/fixtures/session-attachment.json`、`mock-harness/fixtures/sessions.json`、`PROGRESS.md`、`BLOCKED.md`、`.shots/plan-ui-evidence.mjs`、`.shots/plan-ui-evidence.py`、`.shots/plan-connect-hero.png`、`.shots/plan-image-message.png`、`.shots/plan-image-zoom.png`、`.shots/plan-skill-picker.png`、`.shots/plan-ui-find.txt`、`.shots/gen-pixel-png.mjs`、`.shots/patch-index-hero.mjs`、`.shots/debug-plan-ui.py`。
  - 会话前已存在的 modified（按指示不提交）：`harness-plugin/*`（client/index.jsx、src/dsh-bridge.ts、src/remote-access.ts、src/remote-service.ts、src/web-rpc.ts）、`apps/mobile/src/data/goals.ts`、`apps/mobile/app/_layout.tsx`、`apps/mobile/app/sessions.tsx`、`apps/mobile/app/settings.tsx`、`apps/mobile/src/ui/StatusChip.tsx`、`apps/mobile/src/ui/anim.ts`、`apps/mobile/src/ui/chat/GoalCard.tsx`、`apps/mobile/test/goals.test.ts`、`.gitignore`。
  - 早前任务遗留（非本计划，也未提交）：`apps/mobile/package.json`、`pnpm-lock.yaml`、`apps/mobile/src/data/SessionStore.ts`、`apps/mobile/src/transport/ConnectionProvider.tsx`、`apps/mobile/test/SessionStore.test.ts`、`apps/mobile/src/data/imageMessage.ts`、`apps/mobile/src/data/skillList.ts`、`apps/mobile/test/imageMessage.test.ts`、`apps/mobile/test/skillList.test.ts`、`apps/mobile/.gitignore`、`docs/plans/2026-08-18-ui-learning-and-next-plan.md`。
  - 本会话工具残留（非提交项）：`.dsh-vision-toolkit/`（read_image 产生的粘贴图缓存目录）。

## 深入复查与修复（2026-08-18）
- 死代码清理：`app/index.tsx` 移除未使用的 `bannerEntering` 与 `styles.banner/bannerTitle/bannerDesc`，并修正 `DeepOceanHero` JSX 缩进。
- 吸底逻辑补测：新增 `apps/mobile/src/ui/chat/stickyBottom.ts`（`shouldStickToBottom` 纯函数）与 `apps/mobile/test/stickyBottom.test.ts`（3 测）；聊天页 `onScroll` 改消费该纯函数。mobile 测试 145 → 148。
- i18n 修复：`translations.ts` 新增 `connect.remoteHeroTitle`（en/zh 同 key），`app/index.tsx` 远程 hero 标题不再硬编码中文，英文模式不会出现中文标题。
- `ConnectionProvider.attachment` 修复：`session.attachment` 返回缺失/非法 `mediaType` 时现在返回 `null`（缩略图保持加载占位），不再错误回退成 `image/jpeg` 造成坏 data URI。
- `WhaleMark` 增加可选 `fill` prop（默认仍黑，不影响既有品牌位）；`DeepOceanHero` 的鲸鱼改用 `colors.heroText`，在深海蓝 hero 上不再隐形。
- 聊天页历史重连修复：`chat/[sessionId].tsx` 的 `historyLoadedFor` 在非 online 时重置，避免断线重连后同会话不再加载历史导致空转录。
- 回归：`pnpm -r build` 退出码 0；`pnpm -r test` 退出码 0，capture 24 / protocol 127 / mobile 148 / mock-harness 29 / relay 39 / harness-plugin 53，skipped=0；`.shots/plan-*.png` 已重新截图刷新。
- 新增/修改文件补充（相对 Task 6 清单）：`apps/mobile/src/i18n/translations.ts`、`apps/mobile/src/ui/WhaleMark.tsx`、`apps/mobile/src/ui/chat/stickyBottom.ts`、`apps/mobile/test/stickyBottom.test.ts`、`.shots/patch-cleanup-index.mjs`、`.shots/patch-indent-hero.mjs`、`.shots/patch-i18n-hero.mjs`、`.shots/patch-attachment-mediatype.mjs`；`apps/mobile/src/transport/ConnectionProvider.tsx` 同时含本轮 attachment 修复与早前任务改动。
- 长程计划已写：`docs/plans/2026-08-18-next-window-plan.md`（Phase A 真机回归与 mock 增强 → B 轨迹视图 → C 会话写操作/默认配置 → D i18n 扩展/长历史性能 → E 发布与真机；文末附可直接粘贴的新窗口提示词）。








## 任务 0 开工回执（2026-08-18）
- 基线核对：`pnpm -r build` 全绿；`pnpm -r test` capture 24 / protocol 127 / mobile 137 / mock-harness 29 / relay 39 / harness-plugin 53，与任务书一致。
- 已读只读 schema：skills.schema.js（skill.list 返回 {skills:[{name,description,whenToUse?,modelInvocable}]}）；sessions.schema.js（session.prompt 的 image block 契约 `{type:'image',mediaType:image/png|jpeg|webp|gif,data,name?}`；session.attachment 返回 `{attachment:{attachmentId,mediaType,bytes,width,height,name?},data}`）。
- 理解的目标：任务 1 = 技能按钮 + 底部弹窗 + 选后填 @技能名；任务 2 = 图片收发（选图转 base64 发 prompt；收到 image block 折叠出 images 并用 session.attachment 显示）。
- 执行顺序：先任务 1（技能解析纯函数 + ConnectionProvider + 聊天页 UI + 测试）→ 任务 2（装 expo-image-picker + 发送/接收解析 + 测试）→ 全仓回归。
- 最大风险：expo-image-picker 安装失败则按任务书跳过图片发送并写 BLOCKED.md；真机弹窗只能静态代码保证（无真机窗口）；解析逻辑用纯函数隔离避免 UI 耦合。

## 任务 1/2 进度（2026-08-18）
- 任务 1 完成：`ConnectionProvider.skillList(sessionId)`（skill.list → parseSkillList 纯函数）；聊天页输入框上方「技能」按钮，宿主返回 null/空时隐藏，点开底部弹窗列 name+description，选后把 `@name ` 填入草稿；新增 `test/skillList.test.ts`。
- 任务 2 完成：新增依赖 `expo-image-picker@57.0.11`（`pnpm --filter @dsh-remote/mobile add expo-image-picker`，pnpm-lock 随依赖安装更新）；聊天输入区「图片」按钮选相册图（mediaTypes:["images"]）→ base64 → `session.prompt {mode:"queue", content:[{type:"image",mediaType,data,name?}]}`（mediaType 经 `resolveImageMediaType` 收敛到 png/jpeg/webp/gif）。
- 接收完成：`SessionStore` 折叠 user/message 与 assistant/message 的 image block（type==="image" 且带 attachmentId）到 `TranscriptMessage.images`；`MessageBubble` 经 `ConnectionProvider.attachment`（session.attachment）拉 base64 显示高 200 缩略图，不落盘。
- 反向验证已做：发送解析（resolveImageMediaType）与接收折叠（extractTranscriptImages/SessionStore）各制造一次红（`.shots/task2-reverse-send-red.log`、`.shots/task2-reverse-receive-red.log`）并还原复绿（`.shots/task2-reverse-green.log`）。
- 测试增量：mobile 142（基线 137，+2 skillList、+2 imageMessage、+1 SessionStore 图片折叠）。
- 建议改动说明：expo-image-picker SDK 57 的 `mediaTypes` 只接受 `'images' | 'videos' | 'livePhotos'`，不接受 MIME 字符串；因此相册过滤用 `["images"]`，发送 mediaType 由资产 `mimeType`/扩展名经纯函数收敛到 schema 允许的四种（与任务书「mediaType 取 png/jpeg/webp/gif」目标一致，实现路径微调）。
- 全仓回归（2026-08-18）：`pnpm -r build` 全绿；`pnpm -r test` capture 24 / protocol 127 / mobile 142 / mock-harness 29 / relay 39 / harness-plugin 53，skipped=0。

## 会话体验补全（2026-08-18，批准执行）
- 图片发送前按宿主 `imageLimits` 投影校验：`parseImageLimits` 纯函数 + `SessionStore` 折叠 `session/projection` / `session.list projections.values` 的 `imageLimits` 到 `SessionSummary.imageLimits`；聊天页选图后校验 mediaType 白名单、`width*height <= maxImagePixels`、字节数（优先 `asset.fileSize`，否则 base64 估算）<= maxImageBytes/maxMessageImageBytes，超限给中文错误且不发送；宿主未返回时不限制。
- 图片消息摘要：`SessionStore.pushMessage` 对含 `images` 的消息设置 `lastMessage` 为 `[图片]` 或 `[图片] 文字`。
- 技能弹窗增强：显示 `whenToUse`；新增 `filterSkills` 纯函数（name/description/whenToUse 模糊过滤）+ 弹窗内搜索框。
- 反向验证：`parseImageLimits`/SessionStore 折叠与 `filterSkills` 各制造一次红（`.shots/plan-reverse-imageLimits-red.log`、`.shots/plan-reverse-filterSkills-red.log`）并还原复绿（`.shots/plan-reverse-green.log`）。
- 全仓回归：`pnpm -r build` 全绿；`pnpm -r test` capture 24 / protocol 127 / mobile 145 / mock-harness 29 / relay 39 / harness-plugin 53，skipped=0。

## 仓库更名（2026-08-18）
- GitHub 仓库由 `Andiii208/dsh-remote` 更名为 **`Andiii208/dsh-harness-remote`**；README 标题/badge/产品名与 App 更新检查、设置页手册链接、插件设置页下载链接已同步新 URL；本地 git remote 已更新。

## Phase 4（v0.3 远程优先）：i18n 与发布质量（2026-08-18）
- i18n 基础设施：`src/i18n/`（translations.ts / index.tsx / languagePreferenceStore(+Adapter)）。默认 zh-CN，支持 en，Provider 挂 root；第一批覆盖 onboarding + 连接页文案，key 集合 parity 单测保证。
- 更新闭环：设置页「检查更新」解析 GitHub Release 资产，优先跳转 APK 下载；新增电脑端插件更新提示（`dsh plugin --profile web update dsh-harness-remote --latest -w`）。
- 真机回归清单：`docs/MANUAL.md` 新增 2.9「远程优先真机回归清单」（电脑端设置页 + 手机 4G 扫码全链路）。
- 版本：`harness-plugin` / `apps/mobile` 统一升到 `0.3.0`；连接页版本文案同步 `v0.3.0`。
- 发布门禁：`plugin_check` 对 `harness-plugin/` 判定 **pass**；`npm pack --dry-run` 产出 `dsh-harness-remote-0.3.0.tgz`（434.5 kB）。
- 回归：全仓 build/typecheck/test 全绿；capture 24 / protocol 127 / mobile 130（+2 i18n parity）/ mock 29 / relay 39 / harness-plugin 53。

## Phase 3（v0.3 远程优先）：设计系统精修（2026-08-18，基础设施已落地）
- 新增 `docs/design/UI-SYSTEM-v8.md`：Surface/Card/Board 三层、语义色注册表、字号白名单（10/12/13/14/15/20/24/28）、组件契约。
- `theme.ts` 增加 v8 别名：`card`（=surface）、`chip`（=surface2）、`board`（=separator），保持旧 key 兼容。
- 新增 `src/ui/AppText.tsx`：统一文字组件（display/title/body/caption/eyebrow/mono/monoBold + tone），只消费 token；`EmptyState` / `ConnectionBanner` 已接入。
- `Button` 新增 `loading` 态（ActivityIndicator + 禁用）；连接页「连接」、审批批量按钮已接 loading。
- 启动连续性：`_layout.tsx` 根视图背景设为 `#F7F7FA`，与 splash/浅色 Surface 一致，避免白闪。
- 字号 token 清理：sessions/settings 中散落的 9/10/13/14 改回 token（font.eyebrow / font.transcript / font.body）。
- 回归：全仓 build/typecheck/test 全绿；capture 24 / protocol 127 / mobile 128 / mock 29 / relay 39 / harness-plugin 53。
- 遗留（下一轮可继续）：全量 `fontSize:` 扫描仍有部分白名单内原始值（display 24/28、emoji/图标字形等）；AppText 尚未覆盖所有页面（当前先覆盖基础组件）。

## Phase 2（v0.3 远程优先）：会话/聊天/审批细节（2026-08-18）
- 空态统一：`EmptyState` 增加可选 `action`；sessions/chat/approval/plugins 四页全部改为「眉标 + 一句说明 + 行动按钮」。会话离线空态给「去连接」，在线无会话给「＋ 新建会话」；聊天空态给「去连接」；插件/审批空态给说明。
- 会话时间格式：新增 `formatSessionTime()`（今天 HH:mm / 昨天 / 一周内周X / 更早 M/D）并单测；sessions.tsx 改为消费该纯函数。
- 聊天：发送失败恢复草稿 + 错误行「重发」按钮；代码块头部新增「复制」按钮（与折叠并列）。
- 审批：批量处理后显示「已批准/已拒绝/已跳过 N 项」；审批详情页补充 `tool` 字段展示。
- 回归：全仓 build/typecheck/test 全绿；capture 24 / protocol 127 / mobile 128（+1）/ mock 29 / relay 39 / harness-plugin 53。

## Phase 1（v0.3 远程优先）：连接体验（2026-08-18）
- `ConnectionLoop` 新增 `maxAttempts` / `onGiveUp` / `lastErrorResult()`：连续失败达到阈值后停在 offline 并回调，不再无限重试；`start()` 可重新开始，`stop()` 在 run 已退出时立即结算不挂起。protocol 测试 127（原 125，+2 give-up）。
- 移动端新增 `src/transport/connectionErrors.ts`：连接错误分类（auth/pair/rate/timeout/refused/dns/tls/protocol/tunnel/unknown），每类给中文标题 + 建议；单测覆盖。
- `ConnectionProvider` 暴露 `lastError` / `givenUp` / `retry()` / `stopRetrying()`；pipeline 装配 `maxAttempts: 8` 并接 `onGiveUp` 分类。
- 新增 `src/ui/ConnectionBanner.tsx`（迁移 Cindy 结构）：1.2s 静默窗口防闪烁；错误/连接中/重连中三态；停止重试 / 重试按钮；`index.tsx` 已接入。
- 扫码流程不再直接跳 `/sessions`：`scan.tsx` 先显示「正在连接…」可取消，等 state=online 才进会话列表，失败给分类提示并恢复扫码。
- 连接页远程模式展示最近 relay 主机（过滤 port=0 / ws(s):// / relay://），一键重连。
- CLI 卡片按模式展示：公网模式打印 `wss://xxx.trycloudflare.com`，不再误导性打印本地端口。
- 回归：全仓 build/typecheck/test 全绿；capture 24 / protocol 127 / mobile 127 / mock 29 / relay 39 / harness-plugin 53。

## Phase 0（v0.3 远程优先）：DSH 设置页插件化 + cloudflared 公网（2026-08-18）
- 包重命名：`@dsh-remote/harness-plugin` → **`dsh-harness-remote`**（符合 `dsh-*` 规范，npm 已确认空闲）；README/CI/bat 引用同步。
- 单包化发布：`cordis.patch.yml` + `package.json` 的 `dsh.bundle.patch` / `dsh.client.inject`（web）声明；`scripts/build.mjs` 用 esbuild 把 `relay` + `@dsh-remote/protocol` + `qrcode` 打进 `lib/index.js`，CLI 打进 `dist/cli.js`（单包零 workspace 运行时依赖）；`npm pack --dry-run` 通过；`plugin_check` 对 `harness-plugin/` 判定 **pass**。
- 新增 `src/tunnel.ts`：cloudflared 二进制查找/下载（PATH → 插件 bin 目录 → 官方构建）、quick tunnel 启动/超时/URL 解析/停止；纯函数可测。
- `src/remote-access.ts` 支持 `mode: "tunnel" | "lan"`（默认 tunnel）：tunnel 模式 relay 只监听回环，公网入口由 cloudflared 承担，QR/地址返回 `wss://xxx.trycloudflare.com`；LAN 模式行为不变。
- 新增 `src/remote-service.ts`（状态快照 + 启停 + QR dataURL）与 `src/web-rpc.ts`（loopback RPC：`status/start/stop`，对齐 rpcErrorSchema）。
- 新增 `src/apply.ts`：DSH bundle 插件入口——加载即自动开启远程（默认公网）、注册 RPC、`ctx.effect` 清理。
- 新增设置页 `client/`（api.js / index.jsx / build.mjs）：DSH 设置一级入口「手机远程」，公网为主路径，显示二维码/地址/6位码/DSH 桥接状态/启停按钮；esbuild + `window.__ModuleLoader__.load` 打包（对齐 dsh-pocket）。
- App 远程优先：onboarding 改为三步卡（装插件→开设置页→扫码）；连接页远程模式主按钮改「扫码连接」，手动输入折叠；新增「电脑端怎么开？」内联说明；LAN 继续藏在「更多连接方式」。
- CI：`ci.yml` 增插件 `npm pack --dry-run` 门禁；新增 `publish-plugin.yml`（tag `plugin-v*` 发布 npm）。
- 回归：全仓 build/typecheck/test 全绿；测试数 capture 24 / protocol 125 / mobile 125 / mock-harness 29 / relay 39 / harness-plugin 53（新增 tunnel 6、remote-service 3、web-rpc 3、remote-access +1）。
- 待真机/真实 DSH 验证：`dsh plugin --profile web add dsh-harness-remote -w` 后设置页「手机远程」出码、手机 4G 扫码连上（当前环境无真实 DSH Web 与 cloudflared）。

## v0.2.0 之后：可用性修复 + UI 对齐 DeepSeek（2026-08-18）
- 图标：`icon.png` 黑鲸墨迹 bbox 对齐 DeepSeek 官方 App 图标实测尺寸（1024 画布宽约 780，居中）；`adaptive-icon.png` 缩小到宽约 533（约 52%），完整落在 Android 66% 安全圈内；`splash` 改浅色底 + 黑鲸。
- 主题：`app.json` 改 `userInterfaceStyle: automatic` + 浅色 splash/背景；新增 `themePreferenceStore`（默认 `light`，持久化）；设置页「显示 → 外观」支持 浅色 / 深色 / 跟随系统；连接页右上角新增「设置」入口。
- 动效：`useEntering` 的位移参数真实生效（`withInitialValues`），新增 `useExiting` 淡出；模式切换（远程/LAN）带退场动画；Stack 路由统一 `slide_from_right`。
- 远程真正可用：`harness-plugin` 新增 `dsh-bridge.ts` —— `dsh-remote remote` 自动探测并桥接 DSH API（DSH_WEB_URL/56734/3080），转发 `session.list/create/prompt/cancel/respond` unary 与 `events.mux`/`events.host` 下行事件；CLI 卡片增加 DSH 状态，二维码载荷补 `port`，并打印扫码载荷作为终端无法渲染二维码时的回退。
- 手机端：会话页新增「＋ 新会话」（`session.create`）；聊天输入区改为 DeepSeek 风格大圆角输入框 + 圆形发送按钮；`SessionStore` 兼容 DSH Desktop 新版事件（`user/message`、`assistant/chunk`、`assistant/message`、`session/projection {key,value}`）。
- 协议：`RemotePairPayload` 增加可选 `port`；`RelayConnection` 增加 `interrupt`（走 `session.cancel`）。
- 回归：`pnpm -r build` 全绿；测试 capture 24 / protocol 125 / mobile 125 / mock-harness 29 / relay 39 / harness-plugin 40 全过；relay 桥接冒烟实测 `session.list` 经 console 桥接返回 DSH Desktop 会话列表。

## v0.2.0 完善与自检（2026-08-18）
- App 品牌/版本核对：`app.json` name=`harness remote`、icon=`assets/icon.png`（官方黑色鲸鱼，白底）、version=`0.2.0`；首页底部版本文案同步 `v0.2.0 · harness remote`，配对状态改中文「已配对」。
- 本地 Android release APK 构建尝试：`expo prebuild` + `gradlew assembleRelease` 因 Windows pnpm 深路径 CMake/ninja 问题失败；已写 BLOCKED.md，需 EAS 云构建或 Linux CI。
- Android APK 改走 CI：新增 `.github/workflows/android-apk.yml`（Linux runner `expo prebuild` + `gradlew assembleRelease`，tag push / workflow_dispatch 自动上传 GitHub Release）；本机 Windows 深路径阻塞不再影响发版。已触发 v0.2.0 workflow 构建成功，Release 已附带 `app-release.apk`（约 125 MiB）。**iOS App 构建暂未完成**（需 Expo/Apple 开发者账号，当前未产出 iOS 安装包）。
- 低门槛文案微调：远程地址 placeholder 更具体，连接主路径保持「地址 + 6 位码」两字段。
- 自检结论：UI/动效/低门槛达标；正常使用由全仓测试 + 真实 DSH 探测支撑；Release 已有 Windows 脚本，Android APK 已接入 CI 自动构建，iOS 包暂未完成；因此「完全体可推广」尚差 iOS 安装包与推送真机验证。

## Phase P0–P2（真实宿主接缝 / 一键远程复用 / 推送准备 / TLS / 安全加固，2026-08-18）
- **P0 真实 DSH 宿主接缝校准**：真实 DSH `0.1.0-rc.7` 实测；协议适配 `type:"client-request"` 请求、`type:"server-response"`/`result.value` 响应、`type:"client-response"` respond 回执、WS server-request 帧解包并保留 rpcId；`session.prompt` 改 `mode+content`、`session.interrupt`→`session.cancel`、session.list 兼容 `items/sessionId/projections/cwd`；approval/question 帧接入 pending；harness-plugin 增 `host-adapter` 参考映射；COMPATIBILITY.md 增真实宿主矩阵。真实联调证据 `.shots/p0-real-dsh-probe.txt`（connect/session.list 125 项/session.prompt/session.cancel）。
- **P1a 宿主一键远程复用**：`remote-access.ts` 提供 `startRemoteAccess()/stop()`（relay + console + 6 位码 + QR 载荷），CLI 重构复用；测试覆盖 start/stop。
- **P1b 推送准备**：relay 增 `ExpoPushProvider`（`relay --push expo`）与 `createExpoPushProviderFromEnv()`；EAS/FCM/APNs 凭据缺失已写 BLOCKED.md，真机验证待 EAS 登录。
- **P2a TLS 部署实测**：Docker Desktop 已运行；`caddy:latest` + `tls internal` + `reverse_proxy host.docker.internal:4090` 验证 `wss://localhost:8443`：healthz 200、WSS 升级 101、RelayClient 经 WSS register + 取码成功（`.shots/p2-wss-handshake.txt`、`.shots/p2-wss-relay.txt`）。BLOCKED TLS 项已关闭。
- **P2b 安全加固**：relay.pair 失败锁定（默认 10 次/60s）、单 console 未使用配对码上限（默认 5）、审计新增 `pair_fail/pair_lock/pair_code_limit`（仅元数据）；SECURITY/MANUAL 同步。
- 全仓测试：protocol 124 / mobile 117 / harness-plugin 37 / relay 39 / mock-harness 29 / capture 24。

## Phase 9：远程优先 + 插件能力面 + 设置迁移 + 一键远程（完成，2026-08-18）
- R1 远程优先首屏：`apps/mobile/app/index.tsx` 默认远程模式；横幅文案随模式切换，[远程模式]/[局域网模式] 分段选择；远程模式只填 relay 地址（裸主机自动补 `ws://…:4090`）+ 可选 6 位配对码；LAN 保留主机/端口/token（token 收进高级）。`relayMode.ts` 增补裸主机/默认端口/IPv6 规则 + 单测（mobile 113）。
- R5a `relay.pair.code`/`relay.pair.code.ack`：协议加类型与 `makePairCode`；relay 服务器处理（未认证拒绝、console 取码、码一次性）；`RelayClient.requestPairCode()`；联调脚本改走协议取码。protocol 110 / relay 34 / harness-plugin 30（阶段内计数）。
- R2 插件能力面：protocol `plugin.ts`（PluginCommand/PluginSetting/PluginListResult + lenient 读取器）；harness-plugin `plugin-catalog.ts` 参考实现（DSH 注册表接缝 + 本地 manifest 目录 + 默认清单）；mock-harness `fixtures/plugins.json`；App 会话长按菜单动态展示插件指令 + `app/plugins.tsx` 插件页（单屏克制）。
- R3 设置迁移：设置页扩展为「连接 / 模型与权限 / 插件 / 显示 / 关于」；`host.settings.get/set` 能力可探测（读不到自动隐藏）；模型选择、思考强度、上下文容量细进度条、审批权限状态；App 本地字体大小（小/标准/大，影响聊天正文与列表正文）；检查更新走 GitHub Releases 对比。protocol `host-settings.ts` + mock `fixtures/settings.json`。
- R4 一键远程：`harness-plugin/src/cli.ts` 提供 `dsh-remote remote`：自动启动内置 relay（4090 被占用时自动选空闲端口）→ 注册 console → `relay.pair.code` 取 6 位码 → 打印小白卡片（relay 地址 + 配对码 + 操作说明）→ 配对成功提示 `已配对 device-xxx` → Ctrl+C 关闭。package.json 增加 bin 与 relay workspace 依赖。
- 动效：模式切换/表单 180–240ms 淡入淡出 + 轻上移；主按钮按下 scale 0.98 + opacity 0.85；尊重系统「减弱动态」。
- 集成联调：`.shots/relay-pair-integration.mjs` 组合 sessions/settings/plugins fixtures + relay + mock-harness + console；Playwright 在连接页输入 `127.0.0.1` + 6 位码完成配对，截图 `.shots/relay-mode-01-home.png` … `.shots/relay-mode-06-paired-home.png`（含设置页/插件页），find 证据 `.shots/relay-mode-find.txt`（插件指令/Ping 宿主/通知级别）。
- 全仓回归：protocol 110 / mobile 113 / harness-plugin 30 / relay 34 / mock-harness 29 / capture 24，build/typecheck/test 全绿；CI 最新 run 全绿。
- 明确不纳入：dsh-remote 自身不做插件宿主；用户 DIY 插件通过 DSH 插件系统 + R2 能力面在手机端呈现。

## Phase 8：UI 精简美化（DeepSeek 手机版风格，完成）
- 连接页：首屏只保留品牌、状态、主机/端口/可选配对码与主连接按钮；「高级」折叠 token；历史主机默认折叠；自动发现/扫码为次级文字入口。
- 引导页：3 步改为 1 屏（鲸鱼 + harness remote + 一句话 + 开始使用）。
- 会话页：标题「会话」+ 状态；搜索默认收起；pending 改轻量文字行；行只留标题/最近消息/时间，workspace 仅在分组头；上下文仅 ≥70 显示。
- 聊天页：移除 GoalCard 大卡与状态眉标，顶部小字会话标题 + goal 小 pill；输入区只保留输入框 + 圆形发送；暂停/恢复仅流式时显示为小文字按钮。
- 审批页：中文标签，去粗色条，底部只保留批准/拒绝主按钮，跳过提问弱化。
- 设置页：合并为一张主设置卡 + 关于分组，去掉英文 mono 眉标。
- 导航标题：会话/对话/请求/设置，系统字体、无阴影。
- Android 真机（Expo Go，MXW-AN00 Android 10）实测：连接页加载、连接到 mock-harness、会话列表显示 2 个 mock session（截图 `.shots/android-main.png` / `.shots/android-sessions.png`）。
- 文档截图：docs/screenshots/connect.png、sessions.png、chat.png 已同步为新 UI。

## Phase 7：M3.7 发布闸门前置（无真机部分完成）
- CI 升级 Node 24（`.github/workflows/ci.yml`）。
- `pnpm audit --prod`：仍为 3 个 Expo 工具链传递漏洞（image-size ≤2.0.2 ×2 high、uuid <11.1.1 ×1 moderate），均非运行时；记录在 SECURITY.md 发布检查清单，等待 Expo SDK 上游升级。
- `relay/src/sqlite-store.ts`：可选 SQLite 持久化 store（`node:sqlite`，`createSqliteRelayStore(path)`；`RelayServerOptions.store` + CLI `--store <path>`）。测试 3 个（重开保留 client/pair、online 持久化、配对码一次性/TTL）。relay 测试 29（原 26）。
- `relay/test/relay-multi.test.ts`：多 console/device 隔离测试 2 个（在线路由只投配对 peer、离线队列按 peer 隔离）。relay 测试 31（原 29）。
- TLS 部署实测：Docker Desktop daemon 未启动，已写 BLOCKED.md；启动后需按 MANUAL 2.8 用 Caddy 容器验证 WSS。

## Phase 6：M3.5 中继配对闭环 + 密钥持久化（完成）
- T1 protocol：`RelayTransportOptions` 新增 `pairCode`/`onPairAck`；未注入私钥时自动生成 ECDH P-256 keypair，register 携带 publicKey；配对码握手后发 `relay.pair` 并等 `relay.pair.ack`，派生会话密钥后启用加密数据面；未配置 pairCode 时明文路径不变。protocol 测试 100（原 97，+3）。
- T2 relay：`relay.pair` 成功后复用 `relay.pair.ack` 向被配对 console 推送 `{deviceId, peerPublicKey?}`；console 离线则入离线队列，重连 drain 投递；新增 `pair_notify` audit。relay 测试 26（原 24，+2）。
- T3 mobile：新增 `src/relay/relayDeviceStore.ts`（SecureStore → localStorage → 内存降级）持久化 deviceId/privateKeyJwk/publicKeyJwk；`ConnectionProvider` 使用持久化身份并支持可选 `pairCode`、`onPairAck`、`relayPeerId`；连接页 relay 模式显示 6 位配对码输入框，配对成功显示 `consoleId · paired`。mobile 测试 109（原 106，+3）。
- T4 harness-plugin：`RelayClient` 未注入私钥时自动生成 keypair，register 携带公钥；收到 `relay.pair.ack` 通知后派生会话密钥并回调 `onPaired`；M3.2 注入路径保持。harness-plugin 测试 23（原 21，+2）。
- 联调：`.shots/relay-pair-integration.mjs` 启动 relay + mock-harness + console（harness-plugin RelayClient）并打印 6 位配对码；Playwright 在连接页输入 `ws://127.0.0.1:4090` + 配对码完成配对，Sessions 出现 2 个 mock session；截图 `.shots/relay-pair-connect.png`/`.shots/relay-pair-sessions.png`，证据 `.shots/relay-pair-find.txt`/`.shots/relay-pair-sessions-find.txt`/`.shots/relay-pair-route-payload.txt`（route payload 仅 `{to, ciphertext, nonce}`）。
- 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿；测试数：protocol 100 / mobile 109 / harness-plugin 23 / relay 26 / mock-harness 29 / capture 24。真机 APNs/FCM 留待设备/账号窗口。

## Phase 5：M3.4 硬化与自部署（完成）
- `relay/src/rate-limit.ts`：令牌桶（默认 120/分钟、突发 240），超限 E_RATE；`relay-server.test.ts` 15 测试 + `rate-limit.test.ts` 3 测试。
- 审计日志：`audit` 回调（默认 JSON 行，仅 event/from/to/ts/ok，无 payload）。
- 版本协商：hello.ack 带 relayVersion/protocolVersion，不兼容附 compatible:false。
- `docs/MANUAL.md` 增补 relay 部署章节（TLS 终止、Caddy/Docker 示例、配置项）；README 更新 M3 状态。
- 全仓回归绿：protocol 97 / mobile 106 / harness-plugin 21 / relay 24 / mock-harness 29 / capture 24。真机推送与 relay 真机回归留待设备/账号窗口。

## Phase 4：M3.3 推送与离线队列（完成）
- `relay/src/push.ts`：PushProvider 接口 + MockPushProvider + NoopPushProvider（真推送留待设备/账号窗口）。
- `relay/src/queue.ts`：离线队列（TTL 2 分钟、每 peer 上限 50、满丢最旧、drain/expire）。
- relay 服务器：目标离线 route 入队 + push wake（失败降级），重连后 drain 投递；relay-server.test.ts 12 测试 + push-queue.test.ts 6 测试。
- `RelayTransport` / `RelayClient` 增加 pushToken 注册；mobile 增 Expo push token 守卫获取（Expo Go 降级 null）并传入 RelayTransport。
- 测试计数：relay 18 / protocol 97 / mobile 106 / harness-plugin 21；全仓 build/typecheck/test 全绿。

## Phase 3：M3.2 E2E 加密（完成）
- `packages/protocol/src/relay-crypto.ts`：ECDH(P-256) + HKDF-SHA256 + AES-256-GCM 纯函数（generateRelayKeyPair/deriveRelaySessionKeys/sealRelayPayload/openRelayPayload，WebCrypto 注入可测）+ 7 单测。
- `RelayTransport` 接入加密数据面（配置 privateKeyJwk/peerPublicKeyJwk 时 seal/open；未配置保持 M3.1 明文路径）；relay-transport.test.ts 新增 3 测试，protocol 96 tests 全绿。
- `harness-plugin/src/relay-client.ts` 同步接入加密（send 密封、收到密文解密回调、篡改触发 onError）+ 2 新测试；harness-plugin 20 tests 全绿。
- relay 服务器只读 `payload.to`，ciphertext/nonce 透明转发不解析；pair.ack 增补 peerPublicKey；relay-server.test.ts 增补 2 测试，relay 9 tests 全绿。
- 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿；SECURITY.md 更新 M3 为「E2E 已实现」；RELAY-M3.md 回填 M3.2 实现现状。

## Phase 2：M3.1 中继控制面 MVP（完成）
- 新包 `relay/`：credential（HMAC 短时凭证）、store（内存注册/配对/在线）、server（WS 控制面 hello/register/pair/route/heartbeat + /healthz；日志仅元数据）、cli（relay --port 4090）；7 单测（含安全红线：未认证 E_AUTH / 未配对 E_PAIR / 过期凭证被拒）。
- `packages/protocol/src/relay.ts` 增补：makeHello/makeRegister/makePair/makeHeartbeat 构造器；RelayTransport（单 WS、hello/register 握手、?credential=/?peerId=、M3.1 明文 relay.route 转发；unary 请求/响应匹配）。relay-transport.test.ts 7 单测，protocol 86 tests 全绿。
- `apps/mobile`：连接页 HOST 支持 relay:// / ws:// / wss:// URL（Relay 模式，端口忽略）；ConnectionProvider 自动选 RelayTransport，LAN 路径不变；relayMode 纯函数 + 3 单测；mobile 103 tests 全绿。
- `harness-plugin/src/relay-client.ts`：出站中继客户端接线桩（注册/心跳/收发信封）+ 4 单测。
- 联调：`.shots/relay-integration.mjs`（relay + mock-harness + console 桥）跑通；手机经 relay 看到 2 个 session（截图 `.shots/relay-connect.png`、`.shots/relay-sessions.png`，find 证据 `.shots/relay-sessions-find.txt`）。
- 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿；RELAY-M3.md 已回填「实现现状」；README 已同步。

## Phase 1：流式真中断（完成）
- 已完成：`RpcClient.interrupt(sessionId)`（`/api/session.interrupt`，与 `unary` 同构）；`Connection.interrupt?` 可选字段 + `LanTransport` 接线；`ConnectionApi.interruptStream` + 聊天页暂停按钮「先发中断，失败回退本地暂停」分流（成功提示「已发送中断请求」）。
- 宿主侧接线桩：`harness-plugin/src/interrupt.ts`（入参校验 + 响应构造，待 DSH 真机实现接入）。
- 联调 fixture：`mock-harness/fixtures/sessions.json` 增补 `session.interrupt` 成功响应与 `session/event interrupted` 帧；`.shots/phase1-interrupt-fixture.json` 为截图专用长流 fixture。
- 验证：mobile test 100 全绿 / protocol test 79 全绿 / mock-harness 29 / harness-plugin 14；全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿；Web 截图 `.shots/phase1-interrupt.png`（点击暂停后显示「已发送中断请求」，find 证据 `.shots/phase1-interrupt-find.txt`）。
- BLOCKED.md 唯一阻塞项已关闭。

## 任务 0 开工回执（2026-08-17 实测）
- 目标：按 C→A→B→M3(设计)→质量工程 顺序交付。
- 基线核对：mobile test 85 全绿 / mobile typecheck 退出 0 / protocol test 73 全绿。
- dist-web-v7 可重建（expo export 成功，仅 metro 缓存 warning）。
- 最大风险：静态导出下 Web 路由/截图验证受 SPA fallback 限制；协议无主动中断 RPC（流式暂停只能本地渲染）。

## C 审批流程（进行中 → 基本完成）
- 已完成：approvalHistoryStore 纯 TS + 单测（4）；/approval 列表页（多选批量批准/拒绝、提问批量跳过）；/approval/history 历史页（时间倒序）；设置页入口；sessions banner 改跳 /approval。
- respond 成功后写入历史；通知深链沿用 approval/:rpcId。
- 验证：mobile test 89 全绿；typecheck 0；浅深截图已存 .shots/approval-light.png、approval-dark.png。
- 待办：提交 feat commit。

## A 会话列表（完成）
- 已完成：sessionViews 纯函数（filterSessions/groupByWorkspace/pressureTier）+ 5 单测；sessions.tsx 搜索框（v7 Field）、SectionLabel 组头、miniBar 分档（<70 success / 70–85 warn / ≥85 danger）+ 文案。
- 验证：mobile test 94 全绿；typecheck 0；浅深截图 .shots/sessions-light.png、sessions-dark.png。
## B 聊天体验（完成）
- 已完成：highlight(code, lang→已并入 highlight 四类着色) 纯函数 + 3 单测；MessageBubble 长按操作菜单（复制全文/按代码块复制）；代码块默认展开 + 折叠按钮 + 轻量高亮；流式本地暂停（协议无主动中断 RPC，见 BLOCKED）。
- 验证：mobile test 97 全绿；typecheck 0；浅深截图 .shots/chat-light.png、chat-dark.png（含代码块高亮/折叠按钮），sessions 截图已重取含压力文案。
## M3 中继（完成设计+协议最小验证）
- 已完成：docs/design/RELAY-M3.md（控制面协议/注册/配对/路由/心跳/错误码、E2E 密钥交换、RelayTransport 签名与 App 接入点、部署与安全边界、M3.1–M3.4 计划）；packages/protocol/src/relay.ts 新增类型 + parseRelayEnvelope/isRelayEnvelope/normalizeRelayError（新增导出，未改已有行为）+ 4 单测。
- 验证：protocol build 通过；protocol test 77 全绿（≥76）；protocol typecheck 0；mobile test 97 / typecheck 0 不降。
- 评审前不写 relay 服务器实现。
## 质量工程（完成）
- README 功能清单已同步（审批/搜索分组压力/聊天体验/M3 设计）。
- 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿（build 先行）。
- 截图回归：.shots/approval-light.png、approval-dark.png、sessions-light.png、sessions-dark.png、chat-light.png、chat-dark.png（不入库）。
- 断线重连/保活已有单测（autoReconnect/keepalive/pipeline）未涉及本次改动，无需补。
