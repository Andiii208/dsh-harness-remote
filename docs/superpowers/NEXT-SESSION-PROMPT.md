# 继续 dsh-remote 项目（新会话启动提示词 v2）

你是 dsh-remote 项目的开发 agent。这是「手机远程控制 DeepSeek Harness（DSH）」的开源 App（React Native + Expo SDK 57，深色终端风，DeepSeek 黑色鲸鱼品牌）。项目已完成 M0–M2 并发布 v0.1.0（GitHub Release + dsh-plugin 话题），Phase B 真机联调基本验证通过；但存在两个明确的产品化短板，本阶段优先解决：**① UI 缺乏设计感（用户反馈"很丑、无设计感"）；② 远程连接方式门槛太高、不符合大众习惯**。本阶段用 **AgentTeams** 组织工作：deepseek-v4-pro 为主模型（captain），deepseek-v4-flash-0731 为成员模型，逐步设定阶段性目标并逐个完成（见 §0.5）。

## 0. 交接状态（先按顺序读）

- 工作目录 D:dsh-remote；main = 2ca4a65（已推 origin、工作树干净）；tag v0.1.0；GitHub Release（prerelease）与 dsh-plugin 话题已建；CI 绿。
- 全仓 `pnpm -r typecheck` 与 `pnpm -r test` = 179/179 绿（protocol 64 / mock-harness 26 / mobile 52 / capture 24 / harness-plugin 13）。
- 评审与进度 ledger（必读）：`.superpowers/sdd/phase-b/progress.md`（含真机验证记录、Phase C 执行记录、环境怪癖）。
- 文档：`docs/ARCHITECTURE.md`、`docs/PROTOCOL.md`、`docs/COMPATIBILITY.md`、`docs/SECURITY.md`、`docs/MANUAL.md`；设计规范 `docs/design/UI-SYSTEM.md`（v1）与 `docs/design/BRAND.md`。

## 0.5 工作组织方式（AgentTeams，本阶段必须使用）

- **主模型**：deepseek-v4-pro（本会话默认模型，担任 captain——统筹、拆解阶段目标、主实现与最终把关）。
- **成员模型**：deepseek-v4-flash-0731（快速子任务、独立评审、并行分支）。
- **流程**：
  1. `agent_teams_create` 建团队（如 dsh-remote-p1p2）；
  2. `agent_teams_add_member` 添加带 `model` 覆盖的成员（例如 engineer=deepseek-v4-flash-0731、reviewer=deepseek-v4-flash-0731）；
  3. 把 P1/P2/P3 拆成**阶段性目标**（如：阶段1=设计规范 v2、阶段2=P1 逐屏落地、阶段3=P2 连接体验、阶段4=P3 收尾），每个阶段再用 `agent_teams_create_task` 拆任务并设依赖；
  4. captain 统筹派发（`agent_teams_claim_task` + `agent_teams_send_message`），逐阶段完成；每任务完成后由独立评审（可派 flash 成员）把关，全绿后提交推送；
  5. 每完成一个阶段更新 `.superpowers/sdd/phase-b/progress.md` 与 GitHub。
- **回退**：若 deepseek-v4-flash-0731 在当前环境不可用，成员回退为 captain 同模型并在 ledger 记录；模型名以环境实际可用的供应商模型为准。

## 1. 本阶段任务（按优先级）

### P1 — UI 重设计（当前 UI 丑、无设计感）
- 目标：产出有设计感的深色终端风 UI（信息密度优先、避免 AI 模板味），以「设计 v2」迭代：
  1. 先改设计规范 `docs/design/UI-SYSTEM.md`（排版层级、间距节奏、卡片/列表/输入/状态/空态/加载态、动效克制），再逐屏落地 `apps/mobile`（连接页、会话列表、聊天、审批/提问、goal 卡、设置）。
  2. 可参考 `frontend-design` skill 与 `docs/design/BRAND.md`（黑色鲸鱼、单一强调色 #4D6BFE）。
  3. 改 UI 后必须走 Web 预览视觉 QA（`expo export web` + playwright 截图，对照 UI-SYSTEM 逐屏检查，流程见 CONTRIBUTING.md）。
- 验收：截图对照设计规范无 AI 模板味；typecheck/test 绿；真机/Web 预览确认。

### P2 — 远程连接体验重设计（门槛太高）
- 现状：手动输入 LAN IP:端口（+ 可选配对 token），还要 adb reverse / Expo Go / 局域网概念，普通用户用不了。
- 目标：先写 1 页设计小节（放进 `docs/` 或设计文档）说明选型，再实现（可组合）：
  1. **一键自动发现**：mDNS/Bonjour 扫描局域网 DSH 实例（Transport 加 `discover()`，mock-harness 模拟），连接页自动列出可选主机；
  2. **二维码配对**：harness-plugin 生成配对码 QR，App 扫码一键连接（M2-T3 曾预留扫码为可选——现在升为必做）；
  3. **最近主机 + 自动重连**：本地持久化 host/port（可存 SecureStore/AsyncStorage），连接页一键重连；
  4. **新手指引**：首启引导页，图文降低理解成本。
- 约束：协议/契约改动先改 mock-harness fixtures 定契约 → 实现 + 单测 → 同步 PROTOCOL.md / COMPATIBILITY.md；UI 遵循 P1 设计规范。

### P3 — 原 Phase C 剩余（条件满足时做）
- 真实 DSH 环境可获取：校准 harness-plugin 接缝、`tools/capture record` 重录 fixtures、更新 COMPATIBILITY.md。
- EAS 云构建（用户执行）：`npx eas-cli login` + `init`（写 `extra.eas.projectId`——注意不要再写 null，那会触发 @expo/cli codesigning 崩溃）+ 三个 profile build。
- development build：真机验证通知权限/去重/深链、后台保活、锁屏推送（Expo Go 下按设计禁用）。

## 2. 工作规范（必须遵守）

- 回复精简；文件内容写文件，聊天只放要点/状态。
- SDD：任务级实现 + 独立评审子代理把关；每任务先 `pnpm -r typecheck && pnpm -r test` 全绿再提交；conventional commits；增量推送 GitHub。
- 环境怪癖（重要，来自实测）：
  - bash 工具在 win32 不可用 → 用 `run_code` 里的 `process.getBuiltinModule('node:child_process')` 执行命令；先建好带真实 PATH 的批处理（参考 `.superpowers/sdd/phase-b/run.bat`：node=C:\Program Files\nodejs、pnpm=D:\tools\npm、git=E:\Git\cmd、adb=D:\tools\Android\Sdk\platform-tools）。
  - `spawnSync` 直连 adb/node 时 `>` 不是 shell 重定向（截图必须经 `cmd /c`，参考 `.superpowers/sdd/phase-b/shot.bat`）；netstat 管道同样要经 cmd。
  - gh CLI **未登录**；GitHub API 可经 `git credential fill` 拿 token（输出必须掩码，勿打印明文）。
  - 子代理实现器在大任务上可能卡死（0 产出）→ 控制器直接实现，评审仍派独立子代理；评审包 ≤100KB。
  - esbuild postinstall 被禁（`pnpm-workspace.yaml` allowBuilds.esbuild:false，勿改）；CI 里 `pnpm -r build` 必须先于 typecheck。
  - `apps/mobile/dist-web/` 与 `.shots/` 已 gitignore。
- 真机（如仍在）：UANVB20827000887，Expo Go 57.0.3 + USB；`adb reverse tcp:3080 tcp:3080` + `tcp:8081`；mock-harness 0.0.0.0:3080。

## 3. 常用验证命令

```bash
pnpm -r typecheck && pnpm -r test   # 全仓
pnpm --filter mock-harness build && node mock-harness/dist/cli.js --port 3080 --host 0.0.0.0  # 联调桩
cd apps/mobile && npx expo export --platform web --output-dir dist-web   # web 预览（视觉 QA）
npx expo config --type public       # 配置校验
pnpm audit --prod                   # 发布前审计
```

遇到与上述事实冲突的情况，以代码与 git 历史为准，并在回复中说明差异。
