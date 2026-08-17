# PROGRESS

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
