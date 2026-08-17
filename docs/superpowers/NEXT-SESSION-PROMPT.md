# 继续 dsh-remote 项目（新会话启动提示词 v3）

你是 dsh-remote 项目的开发 agent。这是「手机远程控制 DeepSeek Harness（DSH）」的开源 App
（React Native + Expo SDK 57，深色终端风，DeepSeek 黑色鲸鱼品牌，显示名 **harness remote**）。
项目已完成 M0–M2、P1（UI 重设计 v2）、P2（连接体验：自动发现/二维码配对/最近主机/首启引导/
自动重连/深链），并累计 26 轮自主优化（31 个提交，main = 5017b5c，工作树干净，已推 origin）。
**本阶段的目标：把未经真实环境验证的部分闭环——真机联调、真实 DSH 校准、EAS 云构建、
发布收尾；期间继续用 AgentTeams 组织工作，逐步定阶段目标逐个完成（见 §0.5）。**

## 0. 交接状态（先按顺序读）

- 工作目录 D:\dsh-remote；main = 5017b5c（已推 origin、工作树干净）。
- 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` = **219 绿**
  （protocol 73 / capture 24 / mock 28 / plugin 14 / mobile 85）。
- 评审与进度 ledger（必读）：`.superpowers/sdd/phase-b/progress.md`（含 R0–R25 执行记录、
  七轮独立评审结论、环境怪癖、真机记录）。
- 文档：`docs/ARCHITECTURE.md`、`docs/PROTOCOL.md`、`docs/COMPATIBILITY.md`、
  `docs/SECURITY.md`、`docs/MANUAL.md`（真机清单 + P2 联调方法）；设计规范
  `docs/design/UI-SYSTEM.md`（v2）、`docs/design/BRAND.md`、`docs/design/CONNECTION-UX.md`；
  README 带界面截图（`docs/screenshots/`）。

## 0.5 工作组织方式（AgentTeams，本阶段继续使用）

- 主模型：本会话默认模型（captain）；成员模型：deepseek-v4-flash-0731（或环境实际可用模型）。
- 流程：`agent_teams_create` 建团队 → `agent_teams_add_member`（engineer/reviewer/docs，
  可带 model 覆盖）→ 把本阶段拆成阶段目标（如：阶段1=真机联调、阶段2=真实 DSH 校准、
  阶段3=EAS/dev build、阶段4=发布收尾）→ `agent_teams_create_task` 拆任务并设依赖 →
  captain 统筹派发（claim + send_message），每任务完成后独立评审把关，全绿后提交推送。
- 回退：成员不可用时 captain 直接实现，评审仍派独立子代理；每完成一阶段更新 ledger。

## 1. 后续任务（按优先级）

### P4-1 真机联调（需用户设备，最高优先）
- 设备：Android 真机 + Expo Go 57.0.3 + USB（`adb reverse tcp:3080 tcp:3080` + `tcp:8081`），
  或同 Wi-Fi（mock-harness 绑 0.0.0.0）。
- 重点验证 P2 新特性（MANUAL §2.7 已写步骤）：
  1. 扫码配对：mock 起 `--pair-token demo-token`，`curl http://<IP>:3080/api/pairing/qr`
     拿 URL → 任意二维码工具生成 QR → App「扫码配对」一键连接；
  2. 自动发现：同 Wi-Fi 点「自动发现」列出主机；
  3. 深链：`dshremote://pair?host=…&port=…&token=…` 从浏览器/邮件打开即连；
  4. 启动屏（白鲸 splash）、触觉、下拉刷新、聊天回到底部 FAB、长按复制。
- bug 修复走「实现 + 单测 + 全仓绿 + 提交推送」；验证结果更新 MANUAL 勾选 + ledger。

### P4-2 真实 DSH 校准（需真实 DSH 环境）
- 校准 harness-plugin 接缝（token 签发/校验/中间件挂接点，当前为自洽契约，见 README 校准说明）；
- `tools/capture record` 重录 conformance fixtures → diff 协议漂移 → 更新 COMPATIBILITY.md；
- 真机 + 真实 DSH 全链路复测（连接/聊天/审批/提问/goal/通知）。

### P4-3 EAS 云构建 + development build（需用户执行登录）
- `npx eas-cli login` + `eas init`（写 `extra.eas.projectId`，**不要再写 null**——
  那会触发 @expo/cli codesigning 崩溃）+ 三个 profile build；
- development build 验证：通知权限/去重/深链、后台保活（>15min）、锁屏推送
  （Expo Go 下按设计禁用）。

### P4-4 发布收尾（需用户决策/账号）
- `pnpm audit --prod` 复核（已知 3 个构建期传递漏洞，非运行时）；
- 版本号决策（0.1.0 → 0.2.0？）；CI 最终绿；Play/TestFlight 上架（用户开发者账号）。

### P4-5 自主可选（无环境依赖，每轮选做 1–2 项）
- `tools/regenerate-assets`：把 sharp 栅格化流水线（SVG→PNG 1024）固化成可复现脚本；
- Web bundle 体积优化（当前 ~2.6MB）；发布清单/文档同步；真机验证清单细化。

## 2. 工作规范（必须遵守）

- 回复精简；文件内容写文件，聊天只放要点/状态。
- 用户说「继续」→ 先 `create_goal`（新目标，max_goal_rounds 建议 8–12），完成后再
  `update_goal complete`；每轮 end-to-end：实现 → 全仓绿 → 截图/评审 → commit+push →
  ledger 记录。
- 每任务先 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿再提交；conventional commits；
  增量推送 GitHub。
- 环境怪癖（重要，来自实测）：
  - bash 工具在 win32 不可用 → 用 `run_code` 里 `process.getBuiltinModule('node:child_process')`
    执行；先建好带真实 PATH 的批处理（参考 `.superpowers/sdd/phase-b/run.bat`：
    node=C:\Program Files\nodejs、pnpm=D:\tools\npm、git=E:\Git\cmd、adb=D:\tools\Android\Sdk\platform-tools）。
  - spawnSync 直连 adb/node 时 `>` 不是 shell 重定向（截图/日志必须经 `cmd /c` 批处理）；
  - gh CLI **未登录**；GitHub API 可经 `git credential fill` 拿 token（输出必须掩码）。
  - 子代理实现器在大任务上可能卡死（0 产出）→ 控制器直接实现，评审仍派独立子代理；评审包 ≤100KB。
  - esbuild postinstall 被禁（`pnpm-workspace.yaml` allowBuilds.esbuild:false，勿改）；
    `pnpm -r build` 必须先于 typecheck；改 protocol 后依赖包测试必须先用新 dist（`pnpm --filter @dsh-remote/protocol build`）。
  - 截图/浏览器 QA：`npx --package @playwright/cli playwright-cli`（open/resize/snapshot/screenshot
    --filename；进程退出码带 libuv 崩溃码属正常）；截图存 `.shots/`（已 gitignore）。
  - 资产栅格化：`npx -y sharp-cli -i <svg> -o <png> resize 1024 1024`（playwright 直开 SVG 会产出空白，勿用）。
  - Web QA 骨架：`p1p2-export.bat`（expo export web → dist-web）+ `p1p2-static.bat`
    （serve-dist.cjs，127.0.0.1:8099，SPA 回退）+ `p1p2-mock.bat`（mock-harness 0.0.0.0:3080
    --pair-token demo-token）；均位于 `.superpowers/sdd/phase-b/`（已 gitignore）。
  - `apps/mobile/dist-web/`、`.shots/`、`.agent-teams/`、`.playwright-cli/` 已 gitignore。

## 3. 常用验证命令

```bash
pnpm -r build && pnpm -r typecheck && pnpm -r test   # 全仓（build 必须先于 typecheck）
pnpm --filter mock-harness build && node mock-harness/dist/cli.js --port 3080 --host 0.0.0.0 --pair-token demo-token  # 联调桩（带配对围栏）
cd apps/mobile && npx expo export --platform web --output-dir dist-web   # web 预览（视觉 QA）
npx expo config --type public       # 配置校验
npx -y sharp-cli -i assets/xxx.svg -o assets/xxx.png resize 1024 1024    # 资产栅格化
pnpm audit --prod                   # 发布前审计
```

遇到与上述事实冲突的情况，以代码与 git 历史为准，并在回复中说明差异。
