# harness remote UI 设计系统 v5（极简原生 · 双主题）

> 状态：设计评审通过（2026-08-17）。替代 v2/v4。
> 依据：用户明确方向「极简原生感」+ 官方品牌资源 + 三轮原型迭代（v3 模板风 ❌、v4 花哨 ❌、v5 极简 ✅）。
> 原型：`docs/design/prototype-v5.html`；截图：`docs/design/shots/v5-*.png`。

## 0. 设计原则：极简原生，向 iOS 系统语言看齐

用户否决 v3（模板风）、v4（装饰过度）后明确的方向：**像 iOS 设置/邮件那样克制**。
v5 的核心是减法：

- 纯色底（浅 `#F2F2F7` / 深 `#000000`），**零渐变、零毛玻璃、零光晕、零动画装饰**
- 组件直接用 iOS 原生语言：分组卡片、hairline 分隔、大标题、iMessage 式气泡
- **单一强调色 = DeepSeek 官方品牌蓝 `#4D6BFE`**（官方 logo 同色）
- 鲸鱼用**官方资源**（`assets/branding/deepseek-whale-official.svg`，Wikimedia 官方 logo 提取），静态品牌位出现，不做动画不做水印
- 深浅两套：同一布局、同一组件、同一逻辑，仅颜色反转

## 1. 主题令牌（iOS 系统色板对齐）

| 角色 | 浅色 | 深色 | 说明 |
|---|---|---|---|
| `bg` | `#F2F2F7` | `#000000` | iOS 系统分组背景 / 系统深色底 |
| `surface` | `#FFFFFF` | `#1C1C1E` | 卡片（iOS secondarySystemBackground） |
| `surface2` | `#F2F2F7` | `#2C2C2E` | 输入/悬浮（iOS tertiary） |
| `separator` | `rgba(60,60,67,0.12)` | `rgba(255,255,255,0.14)` | 1px hairline |
| `text` | `#000000` | `#FFFFFF` | iOS 原生 label |
| `muted` | `#8E8E93` | `#98989F` | secondaryLabel |
| `dim` | `#C7C7CC` | `#636366` | tertiaryLabel |
| `accent` | `#4D6BFE` | `#4D6BFE` | **官方品牌蓝，深浅通用**（品牌一致性优先） |
| `success/warn/danger` | `#34C759`/`#FF9F0A`/`#FF3B30` | `#30D158`/`#FFD60A`/`#FF453A` | iOS 系统语义色双套 |
| `msgSelf` | `#4D6BFE` | `#4D6BFE` | 用户消息气泡（iMessage 逻辑） |

硬规则：
1. 深浅切换 = 纯色反转，**布局与组件零变化**（用户点名批评过 v4「深浅不一致」）
2. 零装饰：无渐变、无 blur、无 glow、无内发光
3. 强调色只有 `#4D6BFE` 一个，禁止衍生色
4. 动效仅保留功能性的：按压 opacity、连接进度条、光标闪烁

## 2. 字体

- UI/标题：**系统字体**（SF Pro / PingFang），iOS 原生质感——v4 的 Space Grotesk 被否，回归系统
- 数据/标签/代码：JetBrains Mono（保留产品「终端数据」身份）

## 3. 组件规范

- **分组卡片**：`surface` 纯色 + 圆角 12 + 行间 `separator` hairline（iOS group 样式），无阴影无描边
- **按钮**：Primary = 纯 `#4D6BFE` 白字圆角 10；Ghost = `surface2`；禁用 = opacity 0.4；按压 = opacity 0.7（150ms）
- **输入**：`input-bg` 圆角 10 高 44，mono 14px；无聚焦环（iOS 原生）
- **状态 chip**：`surface2` 胶囊 + 8px 色点 + mono 10px
- **鲸鱼品牌行**：48px 圆角方（`surface` 底）+ 官方蓝鲸 SVG + 28px 系统粗体标题 + mono 眉标；**静态，不呼吸不游动**
- **列表行**：主行 16/400 + goal 胶囊（warn/success 12% 底）+ 预览 13 muted + 元数据 mono 10 muted + 3px 进度条
- **聊天**：user = 蓝色圆角气泡（`#4D6BFE` 白字，`18px 18px 6px 18px`）；assistant = 白/深灰气泡（`18px 18px 18px 6px`）；tool = 白气泡 + `tool · log` 标签 + 代码块（`code-bg` 圆角 8）
- **输入条**：`bg` 底 + 上 hairline + mono 输入 + 44px 圆形发送钮（`#4D6BFE`）

## 4. 动效（仅功能性）

- 按压：opacity 0.7 / 150ms
- 连接进度：3px 蓝条扫过 1.1s
- 流式光标：方块闪烁 1s
- 尊重 `prefers-reduced-motion`：以上全部可关

## 5. 反模式（红线）

- ❌ 渐变背景 / 毛玻璃 / 光晕 / 内发光 / 投影表达层级
- ❌ 第二强调色（只有 `#4D6BFE`）
- ❌ 装饰性鲸鱼动画、水印、贴纸感
- ❌ 自定义显示字体（Space Grotesk 等）
- ❌ 深浅两套布局不一致

## 6. 官方品牌资源

- **`assets/branding/deepseek-whale-official.svg`**：DeepSeek 官方鲸鱼图形（Wikimedia `File:DeepSeek_logo.svg` 提取，官方 Illustrator 导出，品牌色 `#4D6BFE`）
- 替换旧 `deepseek-whale-icon.svg`（原创致敬版）——用户明确要求用官方资源
- 原型验证：`docs/design/official/official-whale-only.png`（渲染确认完整清晰）

## 7. RN 改造清单

1. `src/theme.ts` → 双套 `createTheme(scheme)` + `useTheme()`；`colors` 换 v5 令牌
2. `_layout.tsx`：ThemeProvider + StatusBar/header 跟随主题（浅色黑字、深色白字）
3. `WhaleMark.tsx` → 换官方鲸鱼路径（`#4D6BFE`）
4. 组件：Button / Field / StatusChip / 卡片基类 → v5 极简样式
5. 连接页：品牌行（官方鲸鱼 + 大标题）、分组卡片、零装饰
6. 会话/聊天/设置/引导/扫码：token 化 + iOS 组件化
7. 删硬编码：`#FFFFFF`（按钮文字）、`#D7E3FF`（codeText）、`#0A0C10`（goalPill）
8. 验证：`pnpm test` + `pnpm typecheck` + mock-harness web 预览双主题截图

## 8. 截图验收（docs/design/shots/v5-*.png）

浅色/深色 × 连接/会话/聊天 共 6 张，视觉模型验收全部通过：
「iOS 设置级极简、原生感拉满、无多余装饰、布局清晰、深浅气质一致、像原生聊天 App」

> 原型 URL 参数：`?theme=light|dark|system&page=connect|sessions|chat&state=online|connecting|offline`
