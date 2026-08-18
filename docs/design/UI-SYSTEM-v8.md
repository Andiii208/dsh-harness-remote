# harness remote UI 设计系统 v8（远程优先版）

> 状态：评审稿（2026-08-18）。v7 → v8：明确 Surface/Card/Board 三层与语义色注册表，字号白名单，新增 AppText 与 Button loading。
> 令牌代码：`apps/mobile/src/theme.ts`；统一文字组件：`apps/mobile/src/ui/AppText.tsx`。

## 0. 设计原则

1. **极简**：纯色底 + 白卡 + hairline，零渐变零装饰（功能性动画除外）。
2. **高级**：大留白、克制字重、收紧字距、信息降噪。
3. **DeepSeek 品牌**：官方鲸鱼（黑色剪影）+ 唯一品牌蓝（浅 `#3964FE` / 深 `#5686FE`）。
4. **远程优先**：首屏扫码连接；公网为主路径，LAN 降级为「更多连接方式」。

## 1. 层级系统（Surface / Card / Board）

| 角色 | 浅色 | 深色 | 用途 |
|---|---|---|---|
| **Surface** `bg` | `#F7F7FA` | `#0B0B0F` | 页面底色 |
| **Card** `surface` | `#FFFFFF` | `#141419` | 卡片、输入框、弹层 |
| **Chip** `surface2` | `#F2F2F6` | `#1D1D24` | 胶囊填充、次级按钮、骨架条 |
| **Board** `separator` | `rgba(20,20,40,0.08)` | `rgba(255,255,255,0.07)` | 1px 分隔线 / 描边 |

规则：页面结构用 Surface 平铺，卡片用 Card 抬升，同一层内的分隔只用 Board（hairline），不用阴影。

## 2. 语义色注册表

| 语义 | 浅色 | 深色 | 允许消费者 |
|---|---|---|---|
| 品牌蓝 `accent` | `#3964FE` | `#5686FE` | 主按钮、链接、聚焦描边、选中态 |
| 成功 `success` | `#2E9E5B` | `#3ECF8E` | 在线状态点、成功反馈 |
| 警告 `warn` | `#D9820B` | `#F5B84D` | 审批/运行中/上下文偏高 |
| 危险 `danger` | `#E5484D` | `#F0728C` | 错误、破坏性操作、离线状态点 |
| 代码底 `codeBg` / `codeText` | `#F3F3F7` / `#23232E` | `#1B1B22` / `#D5D5E0` | 代码块 |
| 自己消息 `msgSelf` / `msgSelfText` | `#3964FE` / `#FFFFFF` | 同左 | 用户气泡 |

新增语义色必须先在本文件登记；组件只消费 token，不写 hex。

## 3. 字号白名单（禁 9/11/13/15 等散落值）

| 角色 | token | 字号 |
|---|---|---|
| 大标题 | `title` | 28 |
| 页标题 | `display` 场景用 24–26 |  |
| 正文 | `body` | 14 |
| 辅助正文 | `caption` | 12 |
| 眉标 | `eyebrow` | 10 |
| 代码 | `transcript` | 13 |
| 消息正文 | `body + 1` | 15 |

字重四档：400 / 500 / 600 / 700；中文层级不依赖 600 vs 700。

## 4. 组件

- `AppText`：统一文字入口（display/title/body/caption/eyebrow/mono/monoBold），只消费 token。
- `Button`：primary（品牌蓝）/ ghost（Chip 底）/ danger（Chip 底 + 危险文字）；新增 `loading` 态（禁用 + ActivityIndicator）。
- `Field`：Card 底，聚焦 accent 描边；label 用 `SectionLabel`（eyebrow）。
- `StatusChip`：Chip 胶囊 + 7px 状态点 + mono eyebrow。
- `EmptyState`：eyebrow + 一句说明 + 可选 action。
- `ConnectionBanner`：状态点 + 标题 + 原因 + 动作按钮；1.2s 静默窗口。

## 5. 迁移清单（v7 → v8）

1. `theme.ts` 增加语义别名（card/chip/board）并保持旧 key 兼容。
2. `AppText.tsx` 落地，逐步替换散落 `fontSize`。
3. `Button.tsx` 增加 loading。
4. 启动连续性：splash 背景与首屏 Surface 一致，字体 6s 兜底。
