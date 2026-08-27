# DSH Remote 移动端全功能 UI 设计规范 v9

> 状态：设计规范（完整版）
> 覆盖范围：DeepSeek Harness 原生 WebUI 全部功能面 → `apps/mobile`（Expo/React Native）对应功能与 UI 设计
> 视觉参考：Clarklevis1995/dsh-mobile（SwiftUI 实现的设计语言）+ DeepSeek 官网/WebUI 品牌视觉
> 明确排除：Liquid Glass（液态玻璃）。玻璃职责一律用「半透明深色浮层 / 不透明纸面 + hairline + 轻阴影」替代。

---

## 0. 目的

本文档回答三个问题：

1. 原生 DSH（DeepSeek Harness WebUI）有哪些功能面，移动端分别用什么页面承接；
2. 每个页面/功能在移动端应该长什么样，精确到令牌、尺寸、层级；
3. 如何保证全 App 视觉协调（而不是逐页各做各的）。

---

## 1. 设计原则

### 1.1 双画布原则

> **v9.1 裁定（2026-08-27，落地校准）**：品牌画布仅在**深色模式**整体生效
> （连接首页/扫码/引导深蓝 + 深海动效），浅色模式采用纸面阅读画布渲染同一批页面。
> 理由：真实用户里白天场景占比高，整页深蓝在浅色系统下与系统级控件（键盘、分享面板）
> 割裂感强，且截图片宣读性差。本裁定同步写入 §8 验收清单的解读口径：
> 「无 #F7F8FA 露出」仅约束深色模式品牌画布页。实现以 `apps/mobile/app/index.tsx`
> 的 `createStyles(colors, isDark)` 分支为准。

### 1.1 双画布原则

| 画布 | 底色 | 适用页面 | 前景规则 |
|---|---|---|---|
| **品牌画布** | `navy #07182B`（浅色模式也深蓝） | 连接首页、工作区首页、扫码、引导 | 白字；半透明白浮层；`mist` 次级文字；状态栏强制 light |
| **阅读画布** | `paper #F7F8FA` | 对话、轨迹、审批、目标、设置、插件、详情 | 墨字 `ink`；不透明卡片 + hairline；**禁止深蓝整块卡片** |

规则：**品牌氛围是整页画布，不是页面里的海报卡片。** 两种画布不混用。

### 1.2 三层纵深（品牌画布）

品牌画布上的每个页面都按四层组织（对应参考仓库 `HarnessAnimatedBackground`）：

1. **L1 流体层**：极光光晕（去紫，蓝/青，低透明）+ 18 颗星点，缓慢漂移；
2. **L2 技术网格**：42pt 间距网格线 + 稀疏交点方点，顶部到底部渐隐；
3. **L3 鲸鱼粒子场**：点阵鲸鱼，粒子带亮度/边缘/相位差异，漂移 + 尾部波浪 + 闪烁；
4. **L4 底部暗角**：`transparent → navy 12% → black 58%` 渐变，保证前景白字对比度。

阅读画布保持平面：纸面 + hairline + 轻阴影，不叠加装饰。

### 1.3 单一强调色纪律

- 主行动（按钮、发送键）：`accent #3964FE`（浅色）/ `#5686FE`（深色），DeepSeek 官方实测按钮蓝；
- 品牌画布焦点/辉光：`ocean #2E6BE6`；
- **选中态一律黑描边/黑底白字**，不用蓝底；
- 紫色 `tracePurple #7A54C7`、橙色 `traceOrange #F07D14` 只允许出现在轨迹时间线与思考等级胶囊；
- 品牌背景禁止紫色光晕（避免 generic blue-purple AI gradient）。

### 1.4 密度与触达

- 最小触达 44×44pt；
- 页面左右留白 20–22；卡片 padding 16；区块间距 14–18；
- 列表行高 ≥ 48；分隔线用 hairline 或 1px 半透明；
- 每屏只有一个主行动（Primary），其余降级为 ghost/link。

### 1.5 动效纪律

- 统一入场 `FadeInDown 200ms`、退场 `FadeOut 120ms`、缓出曲线 `cubic-bezier(0.16,1,0.3,1)`（沿用 `src/ui/anim.ts`）；
- 按压反馈统一 `scale 0.98 + opacity 0.85`；
- 背景动画 30fps 级、尊重「减弱动态」；
- 状态切换（连接点、banner）180–220ms 淡入淡出。

---

## 2. 设计令牌

### 2.1 颜色

| 令牌 | 浅色 | 深色 | 用途 |
|---|---|---|---|
| `navy` | `#07182B` | `#07182B` | 品牌画布底色 |
| `navyRaised` | `#0D2440` | `#0D2440` | 品牌画布浮起面 |
| `paper` / `bg` | `#F7F8FA` | `#0B0B0F` | 阅读画布底色 |
| `surface` | `#FFFFFF` | `#141419` | 阅读画布卡片 |
| `surface2` | `#F2F2F6` | `#1D1D24` | 次级填充/chip |
| `separator` | `rgba(20,20,40,0.08)` | `rgba(255,255,255,0.07)` | hairline |
| `ink` / `text` | `#101318` | `#F2F2F6` | 正文 |
| `coolGray` / `textMuted` | `#7D8592` | `#8E8E9C` | 说明文字 |
| `textDim` | `#B4B4C0` | `#555560` | 占位/弱化 |
| `accent` | `#3964FE` | `#5686FE` | 主行动 |
| `accentSoft` | `rgba(57,100,254,0.08)` | `rgba(86,134,254,0.12)` | 主行动浅底 |
| `ocean` | `#2E6BE6` | `#2E6BE6` | 品牌画布焦点/辉光/发送键 |
| `mist` | `#BFD4FF` | `#BFD4FF` | 品牌画布次级文本/图标 |
| `success` | `#2E9E5B` | `#3ECF8E` | 在线/成功 |
| `warn` / `amber` | `#D9820B` | `#FFAD1F` | 连接中/告警 |
| `danger` | `#E5484D` | `#F0728C` | 失败/危险 |
| `traceBlue` | `#2E6BE6` | `#2E6BE6` | 轨迹 Input |
| `tracePurple` | `#7A54C7` | `#7A54C7` | 轨迹 Model / 思考等级胶囊 |
| `traceOrange` | `#F07D14` | `#F07D14` | 轨迹 Tools |

品牌画布专用半透明白（浅色/深色同值）：

| 令牌 | 值 | 用途 |
|---|---|---|
| `heroCard` | `rgba(255,255,255,0.055)` | 浮层卡片底 |
| `heroCardStrong` | `rgba(255,255,255,0.08)` | 主按钮 ghost 底 |
| `heroStroke` | `rgba(255,255,255,0.14)` | 浮层描边 |
| `heroDivider` | `rgba(255,255,255,0.10)` | 列表分隔线 |
| `heroInput` | `rgba(255,255,255,0.06)` | 输入框底 |
| `heroText` | `#F2F6FF` | 品牌画布正文 |
| `heroTextDim` | `rgba(242,246,255,0.62)` | 品牌画布次级文字 |

### 2.2 字体

| 角色 | 字体 | 字号/字重 |
|---|---|---|
| 品牌锁 `deepseek` | Space Grotesk | 22 / 600 |
| 首页大标题 | Space Grotesk | 32 / 700，字距 -0.8 |
| 页面大标题 | Space Grotesk | 28 / 600，字距 -0.5 |
| 导航标题 | 系统 | 17–18 / 600 |
| 正文 | 系统 | 15 / 400，行高 22 |
| 说明 | 系统 | 13 / 400，行高 18 |
| 眉标 | JetBrains Mono | 10 / 500，字距 1.6，uppercase |
| 数据（id/时间/耗时/token） | JetBrains Mono | 11–13，`fontVariant: ['tabular-nums']` |

### 2.3 形状与间距

| 令牌 | 值 |
|---|---|
| `radius.card` | 15 |
| `radius.control` | 14 |
| `radius.sheet` | 20 |
| `radius.pill` | 999 |
| `space` | 4/8/12/14/16/20/24 |
| `control.height` | 48（主按钮） |
| 列表行高 | ≥48 |
| 页面左右留白 | 20–22 |

---

## 3. 信息架构与导航

### 3.1 原生 DSH 功能面 → 移动端页面映射

| 原生 DSH / WebUI 功能面 | 移动端承接 | 画布 |
|---|---|---|
| 连接 / 配对 / 设备认证 | `index`（连接首页）、`scan`（扫码）、`onboarding`（引导） | 品牌 |
| 工作区管理（选择/添加/重命名/排序/删除） | `sessions` 工作区选择卡 + 目录浏览 Sheet | 品牌 |
| 会话列表（分组/扁平、搜索、运行中/未读状态） | `sessions` | 品牌 |
| 会话操作（重命名/派生/归档） | `sessions` 长按菜单 | 品牌 |
| 对话（流式正文/思考/工具调用树/代码/终端/图片/文件/重试） | `chat/[sessionId]` | 阅读 |
| 轨迹（Turn/Step 账本、时间线、用量、详情） | `chat/[sessionId]` 轨迹页 | 阅读 |
| Composer（队列/steer/plan 模式/模型/权限/斜杠命令/@ 来源/排队编辑） | `chat/[sessionId]` 输入区 | 阅读 |
| Agent 操作（todo/plan 展示、目标、后台任务、技能、子代理） | 对话页 banner 区 + 目标/任务 Sheet | 阅读 |
| 审批 / 提问接管 | `approval/index`、`approval/[rpcId]` | 阅读 |
| 设置（连接/默认配置/外观/插件/关于） | `settings`、`plugins` | 阅读 |
| 通知 | 系统通知 + App 内事件列表 | 阅读 |

### 3.2 导航模型

- **连接前**：`index`（品牌画布，唯一入口）→ `onboarding`（首启）→ `scan`（modal）。
- **连接后**：`sessions`（品牌画布工作区首页）→ `chat/[sessionId]`（阅读画布）→ `settings`（阅读画布）。
- 对话/轨迹为会话内**分段控件 + 左右滑动**双切换，保持各自滚动位置。
- 审批、插件、目标等二级页用原生 Stack 推入，阅读画布。

### 3.3 每条路由的 header 策略

| 路由 | header | 原因 |
|---|---|---|
| `index` / `sessions` / `scan` / `onboarding` | 自绘 | 品牌画布需要 HarnessMark + 深色底 |
| `chat/[sessionId]` | 自绘 | 需要分段控件与 composer 协同 |
| `settings` / `plugins` / `approval/*` | 原生 header（纸面） | 阅读画布，保持系统返回手势 |

---

## 4. 全局组件规范

### 4.1 `DeepOceanBackground`（品牌画布背景）

结构（新组件，替代 `DeepOceanHero` 的整屏用法）：

```
<Svg absoluteFill viewBox 0 0 100 100>
  L1 流体层（改造 FlowingOcean：去紫、18 星点）
  L2 技术网格（42pt 间距线 + 交点方点，LinearGradient mask 渐隐）
  L3 鲸鱼粒子层（MVP：DotWhaleMark 双层微动；完全体：预烘焙粒子数组）
</Svg>
<L4 暗角 Svg LinearGradient transparent→navy12%→black58% />
```

- 网格线 `白 4.3% / 0.55 宽`；交点 2.2pt 方点 `白 8.5%`，分布 `(row*11+col*7)%13==0`；mask 自上而下 `白 0.8 → 白 1 → 透明`。
- 鲸鱼粒子 MVP：点径分两档（0.72/1.30 倍），Reanimated 驱动 `±2.8pt` 正弦漂移 + 10% 亮度闪烁。
- 完全体：离线脚本（Node + 无头浏览器）把官方鲸鱼路径渲染成 60×60 灰度图，采样亮度/边缘/相位，生成 `whaleParticles.ts`（600–1000 粒子），RN 端 SVG 逐粒子渲染。

### 4.2 `HarnessMark`（品牌锁）

`WhaleMark(28)` + `deepseek`（Space Grotesk 22/600） + `HARNESS` 徽章（9/700 mono，白描边 1px，圆角 3，padding 5/3）。

### 4.3 Header 模式

**品牌画布 header**（index/sessions）：
- 左：`HarnessMark`；
- 右：40pt 圆钮 ×2（连接状态点按钮 + 齿轮），底 `heroCard`、描边 `白 25%`、图标 17 semibold；
- 高度 40，与安全区适配。

**阅读画布 TopBar**（chat）：
- 左：38pt 圆钮返回（`surface` + hairline）；
- 中：标题 18/600 截断；
- 右：`ConnectionDot`（8pt，带同色光晕）+ 预设名 caption 次级色 + 38pt 圆钮 `⋯`。

### 4.4 按钮

| Tone | 浅色 | 深色 | 用法 |
|---|---|---|---|
| `primary` | `accent` 白字 | `accent` 白字 | 每屏唯一主行动 |
| `ghost` | `surface2` 墨字 | `surface2` 白字 | 次级 |
| `danger` | `surface2` + `danger` 字 | 同左 | 断开/归档/清除 |
| `hero`（品牌画布） | `heroCardStrong` 白字 | 同左 | 深海上的次级按钮 |

高 48，圆角 14，按下 `scale 0.98`。

### 4.5 输入框 `Field`

- 阅读画布：`surface2` 填充 + hairline，聚焦 `accent` 描边，高 46；
- 品牌画布：`heroInput` 填充 + `heroStroke` 描边，聚焦 `ocean` 描边，文字白色，placeholder `白 35%`；
- 标签统一 `SectionLabel`（mono 眉标）。

### 4.6 选中态控件

- **分段控件（segmented）**：容器 `surface2` 圆角 10 padding 2；选中段白底圆角 8 + 轻阴影，文字 13/600 墨色；未选中 13/500 次级色。品牌画布版：容器 `heroCard`，选中段 `白 12%`。
- **选项按钮（Off/Low/High/Max、外观、字体、权限）**：未选中 `surface2` 灰字；选中**黑底白字**（深色模式白底黑字），圆角 10，padding 12/7。
- **说明卡片选中**（Agent 预设、默认模型）：选中 `1.5px ink 描边`，未选中 `18% 次级描边`。

### 4.7 状态指示

- `ConnectionDot`：8pt 圆点，success/amber/danger/灰，带同色 `shadow radius 5`；
- `StatusChip`：阅读画布 = `surface2` 胶囊 + 色点 + mono 眉标；品牌画布 = `heroCard` 胶囊 + `白 10%` 描边 + 色点。

### 4.8 列表行

- 阅读画布：卡片行（surface + hairline）或分隔线行，行高 ≥48，左图标 28–32pt；
- 品牌画布：**分隔线行**（不要卡片）：7pt 状态点 + 标题 15/500 + mono 元信息（id 前缀/时间）+ 右侧箭头，分隔线 `heroDivider` 左缩进 18。

### 4.9 Sheet（底部弹层）

- 圆角 20，纸面 `surface`，顶部可加小横条指示；
- 半屏用于：工作区目录浏览、模型选择、轨迹详情、会话菜单、目标编辑；
- 背景遮罩 `black 50%`，点遮罩关闭。

### 4.10 空态 / 骨架

- 空态：mono 眉标 + 一句说明 + 可选行动按钮，无插画；
- 骨架：2 行条 140ms 透明度脉动（已有 `SkeletonRow`，补品牌画布深色变体）。

---

## 5. 分场景 UI 规格

### 5.1 连接与配对（品牌画布）

**页面**：`index`（连接首页）、`onboarding`（首启引导）、`scan`（扫码）。

**连接首页结构**：

1. `DeepOceanBackground` 全屏；
2. Header：`HarnessMark` + 状态点圆钮 + 设置圆钮；
3. Hero 文案：`探索未至之境` 32/700 + `DeepSeek Harness 预览版` 17/白 65%；
4. 连接卡（`heroCard`/15/`heroStroke`）：
   - 远程模式：地址输入 + 6 位配对码输入 + 连接主按钮 + 扫码 ghost；
   - LAN 模式：IP/端口双栏 + 高级（安全码）+ 自动发现/扫码文字按钮；
5. 状态区：连接错误用 `danger 8% 底 + danger 18% 描边` 半透明卡（标题 + 一句原因 + 重试）；
6. 最近主机/发现列表：品牌画布分隔线行（名称 + `host:port` mono + `›`）；
7. 底部版本号 `白 35%`。

**扫码页**：品牌画布全屏；顶部标题 `扫描设备配对码` + 关闭圆钮；取景框 272×272 圆角 28 白描边 3；底部胶囊提示 `将二维码完整放入框内`；顶部/底部压黑渐变。

**引导页**：3 步说明（品牌画布卡片），步骤徽章 `accent` 圆 24，文案纸面规则；主按钮 `连接`。

### 5.2 工作区首页（品牌画布）

**页面**：`sessions`。

1. 整屏 `DeepOceanBackground`，Header `HarnessMark`；
2. Hero：`探索未至之境` + 副标题；
3. **工作区选择卡**：文件夹图标 `mist` + 工作区名 + 路径 mono 白 55% 截断 + 状态点 + `⌄`；点击弹目录浏览 Sheet；
4. **新建会话**：`＋` 在 28pt 圆 `白 10%` + `新建会话` headline，整条 `heroCardStrong`/18；
5. **搜索**：`heroInput`/13/`heroStroke`/高 42，放大镜 `mist`；
6. **会话列表**：品牌画布分隔线行（见 4.8）。行内容：
   - 运行中：`success` 光晕点 + `运行中` 蓝字；
   - 未读：`ocean` 点；
   - 普通：`白 35%` 点；
   - 标题 15/500；session-id 前 16 位 mono 白 42%；相对时间白 48%；
   - goal 状态胶囊（进行中/已暂停/已完成）与 context 压力百分比保留为 mono 小胶囊；
7. **待处理交互**（pending 审批/提问）：列表顶部琥珀色半透明条 `N 个待处理请求 ›`；
8. 长按会话 → 底部 Sheet：重命名 / 派生 / 归档 / 取消（归档为 danger 字）。

**工作区目录浏览 Sheet**：当前目录 mono 眉标 + 路径；行 = 文件夹图标 `ocean` + 名称 + `›`；底部主按钮 `在当前目录创建工作区`（黑底白字/阅读画布内）；支持返回上一级；加载中显示 `正在读取远程目录…`。

### 5.3 会话对话页（阅读画布）

**页面**：`chat/[sessionId]`。

**TopBar**（自绘）：返回 + 标题 + 状态点 + 预设名 + `⋯`（菜单：重新加载历史 / 发送 Ping / 会话操作）。

**分段控件**：`对话 | 轨迹`，容器 `surface2` 圆角 10，左右留白 66，选中白底浮起；左右滑动切页。

**消息流**：
- 用户消息：`accent` 底白字气泡，右对齐，圆角 18（右下 4）；
- 助手消息：白底气泡（surface + hairline），左对齐，支持 Markdown、代码块（`codeBg` 底 + mono，头部 BASH 标签）；
- 思考过程（reasoning）：默认折叠为一行 mono 摘要 `思考 · Ns`，点击展开灰底区；
- 工具调用树：可展开的递归树，每节点 = 图标 + 工具名 + 状态色点 + 耗时；结果默认折叠，展开显示代码/终端/read/search/web 输出（复用 `splitCode` 与工具渲染器）；
- 图片消息：圆角 12 缩略图，点击全屏预览；
- 文件产物：`surface2` 行（文件图标 + 名 + 大小），点击打开/分享；
- 流式光标：`StreamingCursor` 闪烁块；
- 重试/错误行：danger 字 + 重试按钮（已有 `retrySend`，升级为行内组件）；
- 间隙标记（gap）：mono 眉标 `— 消息缺失 —`；
- 历史分页：上滑到顶自动 `loadHistory(beforeSeq)`，显示 `正在加载历史记录 · N/M`。

**会话状态 banner 区**（消息流顶部，按优先级）：
1. 后台任务（`jobs`）：`后台任务 · 标签 +N` mono 胶囊，点击展开任务列表 Sheet（状态、耗时、停止按钮）；
2. 目标（`goal`）：目标卡（目标名 + 状态胶囊 + 暂停/恢复/完成/编辑），目标正文一行截断，点击展开完整目标 + todos；
3. todo/plan（`todos`/`plan` projection）：`surface` 卡，checkbox + 内容 + 状态色，plan 模式显示 `计划模式` 眉标；
4. 排队消息（`queueItems`）：queued/steering/context 三种 placement 的队列卡，支持编辑/移除/steer（`updateQueue`）。

**Composer**（核心，按参考项目翻译去玻璃）：

```
[会话统计 pill：60 轮 · 483 步 ^]  ← 居中浮在 composer 上方
┌────────────────────────────────────────┐
│ TextInput「描述你想要构建的内容」        │  ← minHeight 38，1–5 行
│                                        │
│ 🛡完全访问   模型名 [High]  ◎ ↑        │  ← 控制行
└────────────────────────────────────────┘
```

- 表面：`surface` 圆角 24，padding 14/14/14/12，hairline 0.7，阴影 `black 10% / 18 / y8`；外层横 14、底 safeArea+10；
- 工具行（输入框上方）：图片 chip、技能 chip（`surface` + hairline 胶囊，accent 字）；
- 控制行：权限控制（盾牌 + 当前权限，宽 92 左对齐，点击弹权限 Sheet：read-only / workspace-write / danger-full-access）+ Spacer + 模型控制（模型名 + 思考等级胶囊 `tracePurple 14%`）+ 上下文环（环形进度，点击弹上下文用量 Sheet）+ 42pt 圆形发送键（`ocean` 白 ↑，禁用 48%）；
- 斜杠命令：输入 `/` 弹出命令面板（/permission、/queue、/steer 等，`executeCommand` 已有）；
- `@` 来源：输入 `@` 弹出技能面板（`skillList`），选中插入技能名；
- 模式切换：`队列`（mode queue）与 `steer` 用输入框左侧小菜单切换，当前模式显示为 mono 眉标；
- composerBackdrop：composer 后方绝对定位 SVG 渐变 `transparent → paper`，消息滚到下方自然隐去。

**浮层**：右下角 `回到底部` 36pt 圆钮（生成中显示转圈），距底 96。

### 5.4 轨迹页（阅读画布）

**页面**：`chat/[sessionId]` 轨迹分页。

1. **统计卡**：一行三格 `Duration 420.28s` / `Turns 25` / `Calls 70`，mono tabular；
2. **时间线泳道**：SVG 三泳道 Input（`traceBlue`）/ Model（`tracePurple`）/ Tools（`traceOrange`），按 step 耗时占比画段，支持横向缩放（捏合）与平移；
3. **Turn 分组列表**：Turn 头（`TURN 36 · 3 步 · 42s` mono）+ 步骤行（角色标签 `ASSISTANT/TOOL/USER` 彩色 mono 标签 + 摘要 + `#337,495` 编号 + 耗时）；
4. **步骤详情 Sheet**：点击步骤弹出半屏——摘要、参数、结果、Schema、Token 用量、TTFT/耗时；
5. 尾部跟随：默认跟随最新步骤，用户上滑浏览历史时停止抢夺滚动（`stickyBottom` 已有逻辑保留）；
6. 空态：`NO STEPS` mono 眉标 + 一句说明。

### 5.5 审批与提问（阅读画布）

**列表页** `approval/index`：
- 分组卡片：待处理（琥珀点）/ 已处理（灰点）；
- 行：图标（盾牌=审批、问号=提问）+ prompt 两行截断 + 相对时间 mono + `›`；
- 空态：`NO PENDING`。

**详情页** `approval/[rpcId]`：
- 标题 `审批请求` / `提问` mono 眉标；
- 内容卡：prompt 全文；`command` 用代码块 mono 展示；`permission` 用胶囊；
- 提问类：`options` 渲染为选项按钮（黑选中态规则）；
- 操作：主按钮 `允许/回答`（accent），ghost `拒绝/取消`（danger 字）；成功后返回并刷新 pending 计数。

### 5.6 目标（阅读画布）

- 对话页目标卡（见 5.3）；
- 目标编辑 Sheet：目标描述多行输入 + 最大轮数（数字输入）+ 保存/取消；
- 状态操作：暂停/恢复/完成/清除，乐观更新（`setGoalStatus` 已有），失败回滚提示；
- todos 列表：checkbox 行，`in_progress` 蓝点、`completed` 绿点、`pending` 灰点。

### 5.7 后台任务（阅读画布）

- 对话页 `后台任务` 胶囊 → 任务 Sheet；
- 行：任务图标 + label + 状态胶囊（running 蓝 / stopping 琥珀 / completed 绿 / killed 灰 / failed 红）+ 运行时长 mono；
- 操作：停止（危险，二次确认）。

### 5.8 设置（阅读画布）

**设置首页** `settings`：
- 分组：连接 / 新会话默认配置 / 插件 / 显示 / 关于；
- 行：label 墨字 + value `coolGray` 右对齐，行高 48，hairline 分隔；
- 开关：系统 Switch，track 用 `accent`；
- 分段按钮：外观（浅色/深色/跟随系统）、字体大小（小/标准/大）、权限预设、思考等级——选中**黑底白字**；
- `Agent 预设` 与 `默认模型` 为入口行（值 + `›`），点进专门页面。

**Agent 预设页**（改造现有 settings 内嵌块为独立页）：
- 标题 + 说明（`预设决定 Agent 使用的工具、提示词与能力。选择后只对新建会话生效。`）；
- 预设卡（见 4.6 说明卡片）：标题 headline + 英文 id mono 胶囊 + 当前使用黑徽章 + 描述 + broken 状态橙色警告；
- 预设描述映射（standard/code/minimal/cordis）写死中文说明，服务端返回 description 时优先用服务端；
- 底部 ⓘ `服务端支持编写自定义预设，并提供预设配置文档。`

**默认模型页**：
- 标题 + 说明（`为之后新建的会话设置默认模型与思考等级…同步影响 WebUI…`）；
- Provider 分组（组名 subheadline 次级色）；
- 模型卡：模型名 headline + `当前使用` 黑徽章 + 思考等级四档分段按钮（Off/Low/High/Max，选中黑底白字）；
- 点击模型或档位 → 确认弹窗（`将新会话默认模型改为 X · Y？`）→ 写入 `hostSettingsSet` / `settingsMutate`。

**插件页** `plugins`：
- 只读清单：行 = 插件图标（首字母）+ 插件名 + 版本 mono + 状态点；
- 可执行命令（`pluginExec`）：主按钮 + 参数表单（简单 key/value），结果卡展示；
- 空态：`读不到自动隐藏`。

**连接设置**：目标主机、远端实例（mono）、自动重连开关、本地通知开关、未读事件数、断开按钮。

**关于**：版本、检查更新（GitHub Releases）、使用手册链接、电脑端插件更新提示（mono 代码行）。

### 5.9 通知（系统 + 应用内）

- 系统通知：审批/提问/目标/任务完成四类（`classifier` 已有），深色/浅色 icon 适配；
- App 内事件列表：设置页 `未读事件 N` 入口 → 阅读画布列表页（类型图标 + 标题 + 时间 mono + 点击跳转对应会话/审批）。

---

## 6. 各功能 UI 设计规则速查表

| 功能 | 位置 | 视觉规则 |
|---|---|---|
| 工作区选择 | sessions 顶部卡 | `heroCard` + 文件夹 `mist` + 路径 mono 截断 |
| 工作区添加 | 目录浏览 Sheet | 阅读画布规则 + 底部黑底主按钮 |
| 会话状态 | 列表 7pt 点 | 运行 success 光晕 / 未读 ocean / 普通白 35% |
| 会话操作 | 长按 Sheet | 重命名/派生/归档（danger 字） |
| 流式消息 | 气泡 + 光标 | 白底 hairline；代码块 `codeBg`；光标闪烁 |
| 思考过程 | 折叠行 | mono 摘要 + 展开灰底 |
| 工具调用树 | 可展开 | 状态色点 + 耗时 mono；结果折叠 |
| 图片/文件 | 气泡内 | 缩略图圆角 12；文件行 `surface2` |
| 重试/错误 | 行内 | danger 字 + 重试按钮 |
| 历史分页 | 顶部 | `正在加载历史 · N/M` 居中 mono |
| 排队消息 | 会话 banner | 三种 placement 胶囊 + 编辑/移除/steer |
| 后台任务 | 会话 banner + Sheet | 状态胶囊 + 停止（危险确认） |
| 目标 | 会话 banner + Sheet | 状态胶囊 + 暂停/恢复/完成 + todos checkbox |
| todo/plan | 会话 banner | checkbox 行；plan 模式眉标 |
| 审批/提问 | 独立列表 + 详情 | 琥珀待处理；命令代码块；选项黑选中 |
| 技能 @ | 输入 `@` 弹面板 | 行 + 描述 + 选中插入 |
| 斜杠命令 | 输入 `/` 弹面板 | mono 命令名 + 说明 |
| 模型选择 | composer 模型名 / 设置默认模型页 | 分组菜单；档位分段按钮 |
| 权限 | composer 盾牌 / 设置 | 三档分段按钮，黑选中 |
| 插件 | 设置入口页 | 只读清单 + 命令执行表单 |
| 通知 | 系统 + 应用内 | 四类事件图标 + 点击跳转 |
| 扫码配对 | 品牌画布 modal | 黑渐变 + 白框 + 胶囊提示 |
| 连接错误 | 连接首页 | `danger 8%/18%` 半透明卡 + 重试 |

---

## 7. 实施路线

| 阶段 | 内容 | 验收 |
|---|---|---|
| P0 | 令牌 + `DeepOceanBackground` + `HarnessMark` + 连接首页重构 | 连接页与参考首页同族 |
| P1 | 工作区首页（sessions）重构 + 目录浏览 Sheet | 与参考工作区首页同族 |
| P2 | 对话页：TopBar + 分段控件 + Composer + 会话 banner 区 | 与参考对话页同族 |
| P3 | 轨迹页：统计 + 泳道 + Turn 分组 + 详情 Sheet | 与参考轨迹页同族 |
| P4 | 审批/目标/任务/排队 全部 Sheet 化 | 全功能可达 |
| P5 | 设置页卡片化 + 预设页 + 默认模型页 + 插件页 | 与参考设置同族 |
| P6 | 扫码/引导/通知/深色模式扫尾 + 背景粒子完全体 | 双主题全页面验收 |

---

## 8. 验收清单

- [ ] 所有品牌画布页面：整屏 `#07182B`，无 `#F7F8FA` 露出；白字对比度 ≥ 4.5:1；44pt 命中区；紫色只出现在轨迹/思考等级。
- [ ] 所有阅读画布页面：无深蓝整块卡片；选中态无蓝底；卡片 hairline + 轻阴影。
- [ ] 对话页：TopBar 自绘、分段控件、composer 控制行（权限/模型/档位/上下文环/发送）齐全。
- [ ] 轨迹页：三泳道时间线 + Turn 分组 + 详情 Sheet。
- [ ] 原生 DSH 功能映射表（第 3.1 节）每一项都有可达 UI。
- [ ] 双主题（浅色/深色）下两类画布均协调；状态栏风格随画布切换。
- [ ] 动效尊重系统「减弱动态」；按压反馈统一。
