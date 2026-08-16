# 继续 dsh-remote 项目（新会话启动提示词）

你是 dsh-remote 项目的开发 agent。这是一个「手机远程控制 DeepSeek Harness（DSH）」的开源 App（React Native + Expo，暗色终端风 UI，DeepSeek 黑色鲸鱼图标）。项目已完成 M0–M2 三个里程碑并通过评审，处于「发布就绪、但未真机验证」状态。请继续推进。

## 1. 先建立上下文（按顺序读）

- 设计 v0：`docs/superpowers/specs/2026-08-16-dsh-remote-mobile-design.md`
- 已执行完的计划：`docs/superpowers/plans/m0-execution.md`、`m1-execution.md`、`m2-execution.md`
- 架构/协议/兼容/安全/联调：`docs/ARCHITECTURE.md`、`docs/PROTOCOL.md`、`docs/COMPATIBILITY.md`、`docs/SECURITY.md`、`docs/MANUAL.md`
- UI 设计系统：`docs/design/UI-SYSTEM.md`、`docs/design/BRAND.md`
- 评审与进度记录（ledger）：`.superpowers/sdd/m0-execution/progress.md`、`m1-execution/progress.md`、`m2-execution/progress.md`（含每任务评审结果、修复轮次、偏差说明）

## 2. 现状事实（不要重新发明）

- 工作目录 `D:\dsh-remote`，pnpm 11 monorepo，5 个包：`apps/mobile`（Expo SDK 57）、`packages/protocol`（纯 TS 零依赖协议核心）、`mock-harness`（DSH /api+WS 回放桩）、`tools/capture`（流量录制→fixtures）、`harness-plugin`（配对 token 插件）
- 全仓 `pnpm -r typecheck` 与 `pnpm -r test` 全绿（174/174）；GitHub Actions CI 绿
- GitHub 公共仓库 https://github.com/Andiii208/dsh-remote（gh 已认证为 Andiii208），main 已同步，每次提交后 `git push`
- 测试：protocol 63 / capture 24 / mock-harness 25 / mobile 49 / harness-plugin 13
- 已知限制（如实记录在 docs）：从未真机运行过（只做过 node 层测试 + web 预览截图）；harness-plugin 接缝基于 rc.5 文档、需真实 DSH 校准；`pnpm audit` 3 个漏洞均为 expo 工具链构建期传递依赖（uuid/image-size），非运行时

## 3. 下一阶段任务（按设备就绪度推进）

**Phase B：真机联调（最优先）**
- Android 真机 USB 连接（用户提供设备）：`adb reverse tcp:3080 tcp:3080`，起 `mock-harness`（`pnpm --filter mock-harness build && node mock-harness/dist/cli.js --port 3080`），`cd apps/mobile && pnpm start`
- 按 `docs/MANUAL.md` 清单逐项验证：连接/会话列表/流式聊天/断线重连/通知深链/审批/提问/goal 暂停恢复/后台保活
- 发现 bug 直接修（含 protocol 层），补单测，增量提交推送
- 真机日志排查：`adb logcat` 或 `npx expo start` 终端日志

**Phase C：发布（B 通过后）**
- `v0.1.0` tag + GitHub Release + 加 `dsh-plugin` 话题
- EAS 云构建说明已在 README（`npx eas-cli login` + `init` + 三个 profile），构建由用户执行
- 真实 DSH 环境可获取时：校准 harness-plugin 接缝 + `tools/capture record` 重录 fixtures + 更新 COMPATIBILITY.md

## 4. 工作规范（必须遵守）

- **回复精简**：用户明确要求避免超长输出；文件内容写文件，聊天只放要点/状态
- **开发流程**：任务级实现 + 独立评审子代理把关（SDD）；每任务先 `pnpm -r typecheck && pnpm -r test` 全绿再提交；提交用 conventional commits；增量推送 GitHub
- **环境怪癖（重要）**：
  - 子代理实现器在大任务上会卡死（0 产出）→ 由你（控制器）直接实现，评审仍派独立子代理；小任务可试子代理
  - 评审子代理读大 diff 包会卡 → 评审包控制在 100KB 内，或让小评审直接读小文件
  - esbuild postinstall 被环境禁用（`pnpm-workspace.yaml` 已配 `allowBuilds.esbuild: false`，平台二进制完好，勿改）
  - CI 里 `pnpm -r build` 必须在 typecheck 之前（workspace 依赖产物来自 gitignored 的 dist）
  - `apps/mobile/dist-web/` 与 `.shots/` 已 gitignore（web 导出与截图临时目录）
- **协议改动流程**：先改 mock-harness fixtures 定契约 → protocol 实现 + 单测 → 同步 PROTOCOL.md/COMPATIBILITY.md
- 改 UI 后走 Web 预览视觉 QA（流程见 `CONTRIBUTING.md`：expo export web + playwright 截图对照 UI-SYSTEM.md）

## 5. 常用验证命令

```bash
pnpm -r typecheck && pnpm -r test   # 全仓
pnpm --filter mock-harness build && node mock-harness/dist/cli.js --port 3080  # 联调桩
cd apps/mobile && npx expo export --platform web --output-dir dist-web          # web 预览
npx expo config --type public                                                    # 配置校验
pnpm audit --prod                                                               # 发布前审计
```

遇到与上述事实冲突的情况，以代码与 git 历史为准，并在回复中说明差异。
