# harness remote UI 设计系统 v7（极简 · 高级 · 黑色官方鲸鱼）

> 状态：设计评审（2026-08-17）。v6 → v7：修复鲸鱼错位、改黑色、升级字体。
> 原型：`docs/design/prototype-v7.html`；截图：`docs/design/shots/v7-*.png`。

## 0. 设计原则

1. **极简**：纯色底 + 白卡 + hairline，零渐变零装饰零动画（除功能性的）
2. **高级**：大留白、克制字重（600）、收紧字距、更淡的 separator、信息降噪——Linear 式「减法即高级」
3. **DeepSeek 品牌**：官方鲸鱼（黑色剪影 `#0A0A0F`）+ 唯一强调色靛蓝 `#4D6BFE`（官方 logo 同色，非苹果蓝 `#007AFF`）

## 1. 主题令牌

| 角色 | 浅色 | 深色 |
|---|---|---|
| bg | `#F7F7FA`（冷静） | `#0B0B0F`（带靛调黑） |
| surface | `#FFFFFF` | `#141419` |
| surface2 | `#F2F2F6` | `#1D1D24` |
| separator | `rgba(20,20,40,0.08)` | `rgba(255,255,255,0.07)` |
| text | `#101016` | `#F2F2F6` |
| muted | `#6E6E7A` | `#8E8E9C` |
| dim | `#B4B4C0` | `#555560` |
| **accent** | **`#3964FE`** | **`#5686FE`** | **DeepSeek Chat 官方主按钮蓝（实测 chat.deepseek.com）** |
| accent-soft | `rgba(57,100,254,0.08)` | `rgba(86,134,254,0.12)` |
| success | `#2E9E5B` | `#3ECF8E` |
| warn | `#D9820B` | `#F5B84D` |
| danger | `#E5484D` | `#F0728C` |

**DeepSeek 蓝来源（实测，非猜测）**：
- `chat.deepseek.com` HTML 内联样式：`.btn{background:#3964fe}`（浅色）、`@media (prefers-color-scheme: dark){.btn{background:#5686fe}}`（深色）
- `main.js`：`#4d6bfe`×8（logo/图标）、`#3964fe`（主操作按钮）
- 对比：苹果蓝 `#007AFF` = RGB(0,122,255) 纯青蓝；DeepSeek 主按钮蓝 `#3964FE` = RGB(57,100,254) 更深、更紫、更沉稳
- 像素验证：v7.1 截图按钮实测 6126 像素命中 `#3964FE`，`#007AFF` 0 像素

## 2. 字体（v7 升级）

- **显示标题**：**Space Grotesk 600**（几何感无衬线，高级气质）——品牌名 `harness remote`、页标题 `Sessions`、聊天标题
- UI/正文：系统字体（SF Pro / PingFang）
- 数据/代码：JetBrains Mono（眉标 letterSpacing 1.6~1.8px）

## 3. 品牌鲸鱼（v7 修复）

- 资源：`assets/branding/deepseek-whale-black.svg`
- 来源：DeepSeek 官方 logo（Wikimedia `File:DeepSeek_logo.svg`）鲸鱼 path 提取
- **viewBox 裁剪到鲸鱼实际包围盒 `-20 -2 90 46`**（原 viewBox 195×41 含文字空间，直接套用会缩在角落=错位）
- 填充：黑色 `#0A0A0F`（用户明确要求黑色鲸鱼）
- 已用像素扫描 + 渲染对比验证：完整、居中、无变形（`docs/design/official/compare-whale.png`）

## 4. 组件

- 分组卡片：`surface` 圆角 14 + `separator` hairline，无阴影无描边
- 按钮：Primary = 纯 `accent` 白字，圆角 12 高 48；禁用 opacity 0.4；按压 opacity 0.75
- 输入：`input-bg` 圆角 12 高 46，mono 14px
- 状态 chip：`surface2` 胶囊 + 7px 色点 + mono 10px
- 鲸鱼品牌位：52px 圆角 13 方 + 黑色官方鲸鱼 + Space Grotesk 30px 标题 + mono 眉标
- 聊天：user = 靛蓝气泡；assistant = 白气泡；tool = 白气泡 + 代码块

## 5. RN 改造清单

1. `src/theme.ts` 换 v7 令牌（双套 `createTheme` + `useTheme`）
2. `_layout.tsx` ThemeProvider + StatusBar 跟随
3. `WhaleMark.tsx` 换黑色官方鲸鱼（`assets/branding/deepseek-whale-black.svg`）
4. 字体：加载 Space Grotesk（`@expo-google-fonts/space-grotesk`），显示标题用它
5. 组件 Button/Field/StatusChip/卡片 → v7 样式
6. 连接页品牌行、分组卡片；会话/聊天/设置/引导/扫码 token 化
7. 删硬编码色（`#FFFFFF`、`#D7E3FF`、`#0A0C10`）
8. `pnpm test` + `pnpm typecheck` + web 预览双主题截图
