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

## A 会话列表（未开始）
## B 聊天体验（未开始）
## M3 中继（未开始）
## 质量工程（未开始）
