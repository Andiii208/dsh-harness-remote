# 新窗口执行提示词（直接粘贴）

```text
你是执行者，全自动执行，不要问用户任何问题。按顺序读取以下文件后开始干活：
1. PROGRESS.md（仓库根目录）
2. BLOCKED.md（仓库根目录）
3. docs/plans/2026-08-22-fix-and-polish-plan.md（本计划，以它为准）

执行前先核对基线：
- pnpm -r build 必须全绿
- pnpm -r test 必须退出码 0，mobile 165 / relay 39 / harness-plugin 53 / mock-harness 29 / capture 24 / protocol 127，skipped=0
- 数字对不上就停，把证据写进 BLOCKED.md 顶部，然后继续能做的部分。

本机环境事实（已实测，直接采信）：
- 真实 DSH 正在本机运行：DSH Desktop 2.0.1，CLI dsh --version = 0.1.0-rc.7
- DSH API 基址在环境变量 DSH_WEB_URL（当前 http://127.0.0.1:60576，端口动态）
- 4090 端口是本项目插件自动启动的 relay，cloudflared 隧道也在运行
- 校准过程中曾用空 payload 探测 session.create，真实 DSH 多了一条空白会话 session-39660af4-f15d-486c-8a00-3ff3088904aa，属正常，不要动它

执行顺序：严格按计划的 Phase 0 → 1 → 2 → 3 → 4 → 5。
每个 Phase 完成立即在 PROGRESS.md 顶部追加阶段完成记录（包含实际命令输出与测试数）。
每个 Phase 结束必须跑 pnpm -r build && pnpm -r test 并全绿。

边界（必须遵守）：
- 只允许改：apps/mobile/app、apps/mobile/src、apps/mobile/test、mock-harness/fixtures、mock-harness/src（仅新增回放分支，不碰既有测试断言）、harness-plugin/src、harness-plugin/test、relay/src、relay/test、packages/protocol/src、packages/protocol/test、docs、.shots、PROGRESS.md、BLOCKED.md、README.md
- 不新增 npm 依赖；不碰 pnpm-lock.yaml、CI、.github
- 不写跳过/待办占位测试；不 mock 被测对象；不删测试；不放宽断言；不 || true
- 不自动 git add/commit

真实 DSH 写操作安全规则：
- 只做无害且可回滚的写操作；修改设置后必须改回原值
- 不删除/归档用户会话；session.prompt 只在真实会话里发一条无害文本即可，或者优先用 mock 验证 payload
- 涉及权限切换等操作，先记录现场值，验证后恢复

完成定义：
- Phase 0–5 全部完成，PROGRESS.md 有完整记录
- pnpm -r build && pnpm -r typecheck && pnpm -r test 全绿，skipped=0，测试数 ≥ 基线
- 真实 DSH 核心链路（连接、会话列表、聊天历史、发消息 queue 模式、权限切换、默认模型读写）验证通过，证据落 .shots/
- 通知分类器对真实 DSH 三种帧格式有单测覆盖
- i18n 可切换，中英界面无硬编码残留
- 连接页与 sessions 页统一为 v9 品牌画布；composer 控制行齐全
- 插件默认不自动开公网隧道，改为设置页手动开启
- docs/COMPATIBILITY.md 真实宿主矩阵更新为 2026-08-22 实测结果

卡住就写 BLOCKED.md 继续下一项；同一条验收连败 3 次换下一项。
最后在对话里贴出：实际 build/test 命令输出摘要、测试数、截图路径清单、以及无法完成需用户提供凭据的部分。
```
