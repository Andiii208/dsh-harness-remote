# harness remote UI 设计系统 v4（鲸之海 · 双主题）

> 状态：设计评审中（2026-08-17）。替代 v2（docs/design/UI-SYSTEM.md）。
> 依据：两轮外部调研（Warp/Linear/Raycast/Arc + Notion/Bear/Tailscale + Apple HIG/Material 3）+ 可交互原型
> `docs/design/prototype-v4.html` + 截图 `docs/design/shots/v4-*.png`。

## 0. 设计叙事：鲸鱼是深海的生物

DeepSeek 品牌资产是「黑鲸鱼」。v2 把鲸鱼当角落水印 = 浪费品牌。
v4 的核心叙事：**鲸鱼生活在深海**。

- **深色模式 = 深海**：光从海面透下（顶部径向蓝光），背景是带蓝调的深色渐变，不是死黑。
- **浅色模式 = 海面清晨**：淡蓝白渐变，墨蓝鲸鱼，非惨白。
- **连接签名**：连接页 hero 是一条横贯画面的**发光游鲸**——离线静止、连接中尾鳍开始摆动、在线时身体呼吸 + 光晕脉动。鲸鱼在游 = agent 在工作。

产品定位：**深色优先的开发者工具**，最贴近 Linear 的克制路线 + Raycast 的「远程控制命令工具」近亲气质。

## 1. 主题令牌（双套，全部语义化）

| 角色 | 浅色 | 深色 | 说明 |
|---|---|---|---|
| `canvas`（页底） | `#F4F8FE`→`#E2EAF8` 渐变 | `#04060D`→`#0D1D3A` 渐变 | 带冷调渐变，非纯白/纯黑 |
| `surface`（卡片） | `rgba(255,255,255,0.92)` | `rgba(13,22,44,0.72)` | 半透明 + backdrop-blur 14px |
| `surface2`（悬浮/输入） | `rgba(255,255,255,0.98)` | `rgba(20,32,62,0.78)` | 浮层更亮（深色）/更白（浅色） |
| `surface3`（代码块） | `#EDF2FB` | `rgba(26,40,78,0.85)` | |
| `hl`（顶部高光） | 白 0.9 | 白 0.07 | 卡片顶部 1px 高光线 |
| `border` | `rgba(31,64,140,0.12)` | `rgba(148,180,255,0.10)` | 1px 发丝线 |
| `borderStrong` | `rgba(31,64,140,0.24)` | `rgba(148,180,255,0.22)` | 聚焦/强调 |
| `text` | `#0C1A38` | `#E9EFFC` | 软黑/近白（非纯 #000/#FFF） |
| `muted` | `#4A5C85` | `#97A8CC` | |
| `dim` | `#8596BB` | `#5E7099` | 说明/占位 |
| `accent` | `#3D5AFE` | `#6E8BFF` | 强调色**两套值**（深色提亮提饱和） |
| `accentHi` | `#2C46D4` | `#93AAFF` | 链接/高亮 |
| `accentSoft` | `rgba(61,90,254,0.10)` | `rgba(110,139,255,0.16)` | 焦点环/选中 |
| `success` | `#0FA56F` | `#3ED6A8` | 状态色**双套值**（Notion 规律） |
| `warn` | `#C07E10` | `#F5B94D` | |
| `danger` | `#D63D5E` | `#F0728C` | |
| `codeText` | `#2C3A5C` | `#B9C9F0` | 代码块文字 |
| `whale` | `rgba(45,80,160,0.30)` | `rgba(110,139,255,0.55)` | 鲸鱼本体 |
| `whaleTrail` | `rgba(45,80,160,0.08)` | `rgba(110,139,255,0.18)` | 光晕/水花 |

**硬规则**（来自 Tailscale《Heart of dark mode》+ Linear）：
1. 深色层级靠「更亮的表面 + 1px 发丝线 + 顶部高光」，**不靠投影**；浅色才用柔和多层阴影（`0 10px 34px rgba(45,80,160,.10)`）。
2. disabled 一律用 opacity 0.45，**不换色相**。
3. 强调色/状态色浅深两套，**绝不直接复用**。
4. 深色文字层级用 alpha 思想（iOS label @100/60/30%），不造 4 个灰。

## 2. 字体

| 角色 | 字体 | 规格 |
|---|---|---|
| 显示标题 | **Space Grotesk** 700 | 30px，tracking −0.5px（连接页 hero 用） |
| 页标题 | Space Grotesk 700 | 26px，tracking −0.6px |
| 正文/UI | 系统无衬线（SF/PingFang） | 14–16px，500–600（**克制字重**，Linear「加粗=营销感」） |
| 数据/标签 | **JetBrains Mono** | 10–13px；眉标 700 + letterSpacing 2px |
| 代码块 | JetBrains Mono | 12–13px |

排版原则：数据等宽、叙述无衬线；标题用几何感 Space Grotesk 建立气质，**不再用系统默认字体做显示**。

## 3. 组件规范

### 3.1 卡片（软玻璃拟态）
- 半透明表面 + `backdrop-filter: blur(14px)` + 1px 发丝边 + **顶部 1px 高光线**（`left:12%; right:12%` 渐变）
- 圆角 16（比 v2 的 12 更舒展）
- 深色无投影；浅色 `0 10px 34px rgba(45,80,160,.10)`

### 3.2 按钮
- Primary：电钴蓝渐变 `135deg #5B7CFF→#3B63F7→#3053E8` + 底部光晕 `0 8px 26px rgba(59,99,247,.40)` + 内顶部高光 `inset 0 1px 0 rgba(255,255,255,.25)`；高 48
- **主 CTA（连接/发送）用药丸形 `border-radius:999px`**（Linear 160px pill）；次主操作（扫码配对）保持圆角 12——圆角两极，避免全部药丸化
- Ghost：半透明表面 + 发丝边 + blur
- 按压：scale 0.975，160ms ease-out

### 3.3 状态点
- 7px 圆点 + **外发光**（`::after` 同色 blur 3px，opacity .35）——状态是「光」不是「色块」
- 状态 chip：半透明胶囊 + blur，mono 10px 700

### 3.4 输入
- 48px 高、圆角 12、半透明 surface2 + blur
- 聚焦：`border accent` + `0 0 0 3px accentSoft` + 20px 光晕
- 标签：mono 眉标 10px，letterSpacing 2px

### 3.5 鲸鱼签名（hero）
- 位置：连接页顶部 hero（圆角 20），**横贯画面**的横向游鲸
- 结构：尾鳍（独立 path，`transform-origin 30% 50%`）+ 身体（呼吸 scale 1.02/0.985，3.2s）+ 白腹 + 眼睛（带高光点）+ 水花轨迹（3 个渐隐小圆）
- 背景：radial 蓝光（`90% 70% at 70% 20%`）+ 右上光柱（旋转 18° 模糊线性渐变）
- 状态动效：OFFLINE 静止 → CONNECTING 尾鳍摆动加速 → ONLINE 身体呼吸 + 光晕脉动 6s
- 标题叠在鲸鱼左下（Space Grotesk 30px + mono 眉标）
- 尊重 `prefers-reduced-motion`：全部关闭

### 3.6 列表行（会话）
- 半透明卡片 + 顶部高光，圆角 16，padding 16
- 主行：标题 16/600 + goal 胶囊（mono 9px，**低饱和描边 + 同色 7% 底**，done=success 变体）
- 元信息：mono 10px dim（workspace · tok · 时间右对齐）+ 3px 渐变进度条（发光）
- 待处理横幅：warn 渐变底 `rgba(245,185,77,.10→.03)` + 发光 rail 3px + 圆角 16

### 3.7 聊天（Warp block 概念）
把「聊天」当「终端 block」：**用户消息 = 命令块、AI 回复 = stdout、工具调用 = 日志**——三种角色的视觉语言天然不同：
- assistant（stdout）：半透明表面 + 发丝边，角色边条靛蓝渐变
- **user（命令块）：靛蓝渐变底** `135deg rgba(77,107,254,.18)→.06` + 蓝边，文字用 accentHi，角色标签 `you`
- **tool（日志）：warn 系边条**（`#F5B94D→#C07E10` 渐变）+ 代码块左侧 2px warn 描边，角色标签 `tool · log`
- 代码块：surface3 + 发丝边 + mono 12px（未来可接 Tokyo Night/Catppuccin 16 色）
- 输入条：**毛玻璃**（深色 `rgba(10,18,38,.55)` / 浅色 `rgba(255,255,255,.6)`，blur 20px）+ 药丸渐变发送钮

### 3.8 空态/载态/错误态
- 空态：mono 眉标 + 一句正文 + 主按钮，居中克制
- 骨架：surface2 条 + 透明度脉动（尊重减弱动态）
- 错误：正文一句 + mono 错误码 + 重试

## 4. 动效纪律

| 场景 | 规格 |
|---|---|
| 状态色切换 | 160–200ms ease-out |
| 按钮按压 | 160ms scale 0.975 |
| 列表入场 | 200ms fade + 6px 上移，错开 24ms（≤6 项） |
| 鲸鱼呼吸 | 3.2s（连接中）→ 6s 光晕脉动（在线） |
| 连接进度 | 1.1s 渐变光柱扫过 |
| 主题切换 | 300ms 背景渐变过渡 |
| 减弱动态 | 全部关闭（`AccessibilityInfo.isReduceMotionEnabled()`） |

禁止：弹性回弹、3D 翻转、粒子爆炸、无限旋转、霓虹闪烁。

## 5. 反模式（v4 红线）

- ❌ 死黑 `#000` 平铺、纯白 `#FFF` 惨白
- ❌ 实心灰块卡片 + 粗边框（v2 的毛病）
- ❌ 多种蓝色打架（统一靛蓝系）
- ❌ 投影表达深色层级（深色投影=没有）
- ❌ 系统默认字体做标题（没气质）
- ❌ 状态色浅深复用一套
- ❌ 鲸鱼当贴纸/水印（它是会呼吸的签名）

## 6. 落进 RN 的改造清单

1. `src/theme.ts` → `ThemeProvider` + `useTheme()` + 双套 `createTheme(scheme)`；`font` 增加 Space Grotesk（`@expo-google-fonts/space-grotesk`），与 JetBrains Mono 并行加载
2. `app/_layout.tsx`：ThemeProvider 包裹；`StatusBar`/header 颜色跟随主题
3. 组件：Button（渐变 + 光晕）、Field（blur 聚焦环）、StatusChip（发光点）、卡片基类（半透明 + 顶部高光）、GoalPill（低饱和描边）
4. 连接页：鲸鱼 hero（`react-native-svg` 分体 path + reanimated 呼吸/摆尾）；浅深双渐变背景
5. 会话/聊天/设置/引导/扫码：全部 token 化
6. 删除硬编码色：`#FFFFFF`（按钮文字保留，但用 token）、`#D7E3FF`（codeText 双套）、`#0A0C10`（goalPill 文字改 token）
7. 验证：`pnpm test` + `pnpm typecheck`；起 mock-harness + web 预览双主题各截一套图

## 7. 截图验收对照（docs/design/shots/v4-*.png）

- `v4-dark-connect.png` / `v4-light-connect.png` / `v4-light-online.png` / `v4-dark-connecting.png`
- `v4-dark-sessions.png` / `v4-light-sessions.png`
- `v4-dark-chat.png`

> 原型 URL 参数：`?theme=dark|light|system&page=connect|sessions|chat&state=online|connecting|offline`
