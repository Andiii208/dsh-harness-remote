# dsh-remote UI 设计系统（v1）

目标：**终端质感、暗色优先、信息密度高、无 AI 模板味**。所有屏幕与组件（Task 7 起）必须遵循本规范。

## 1. 设计令牌

| Token | 值 | 用途 |
|---|---|---|
| `bg` | `#0E0E10` | 页面底色（近黑，非纯黑） |
| `surface` | `#16161A` | 卡片/输入框 |
| `surface2` | `#1E1E24` | 悬浮/选中/hover |
| `border` | `#2A2A31` | 分隔线/描边（1px） |
| `text` | `#F5F5F7` | 主文本 |
| `textMuted` | `#9BA1A6` | 次级文本 |
| `accent` | `#4D6BFE` | 唯一强调色（连接/主操作/活动态） |
| `accentSoft` | `rgba(77,107,254,0.14)` | 强调色底色 |
| `success` | `#34D399` | 在线/完成/通过 |
| `warn` | `#FBBF24` | 等待/警告 |
| `danger` | `#F87171` | 离线/失败/拒绝 |
| `fontMono` | `ui-monospace, 'SF Mono', Menlo, monospace` | 会话转录/帧/日志 |
| `radius` | 12 / 16 | 卡片 / 大控件 |
| `space` | 4pt 网格（4/8/12/16/24/32） | 间距 |
| `stroke` | 1px，`rgba(255,255,255,0.06)` | 细线描边 |

## 2. 排版

- 正文：系统无衬线（iOS SF / Android Roboto），`14–15px`，行高 1.5。
- 标题：`20px/600` 页标题；`16px/600` 区块标题。
- 会话转录：等宽字体 `13px`，行高 1.6——DSH 终端感的来源。
- 禁止：手写字体、衬线大标题、全大写堆叠、装饰性 emoji。

## 3. 组件规范

- **连接状态徽章**：8px 色点（success/warn/danger）+ 文本（在线/连接中/离线·退避 3.2s），底色 `accentSoft` 或 `surface`，圆角 999。
- **消息气泡**：背景 `surface`、圆角 12、`border` 描边；角色色条 3px（user=accent / assistant=surface2 / tool=mono 灰色）；流式块用闪烁竖线光标 `▍`。
- **审批卡**：`surface` 卡片 + 左侧 `warn` 4px 边条；权限请求用 mono 展示 `command/execute` 载荷；两个按钮：拒绝（ghost，danger 文字）/ 批准（primary）。
- **提问卡**：同审批卡，边条 `accent`，文本输入 + 发送。
- **输入框**：`surface` 底、`border` 描边、聚焦时 `accent` 描边；圆角 12。
- **列表行**：高 56，`surface` 底，hover/选中 `surface2`；右侧投影缩略（goal 进度条 3px、token 用量 mini bar）。
- **空态/错误态**：一句话 + 重试按钮；错误用 mono 显示错误码（`NOT_FOUND` 等），不堆栈。

## 4. 屏幕布局

- **连接页**：居中卡片：鲸鱼图标（32px 灰）+ host 输入 + 连接按钮（full-width primary）；下方安全警告（`warn` 色小字块："LAN 直连，无鉴权——请仅在可信网络使用"）；底部版本号 mono。
- **会话列表**：大标题「Sessions」+ 状态徽章；列表行：标题 + 最后消息预览（muted，1 行省略）+ 右侧投影缩略。
- **聊天页**：顶部会话标题栏（sticky，`bg` 半透明 blur）+ 状态点；转录区 mono 流式渲染；底部输入条（输入框 + 发送按钮）。goal/todos 摘要以可折叠卡片置于转录下方。
- **审批/提问页**：单卡片居中（全屏），如上组件规范。

## 5. 动效（克制）

- 状态切换：150ms ease-out 颜色过渡。
- 列表项进入：200ms fade + 8px 上移。
- 禁止：弹性动画、3D 翻转、粒子、无限旋转 loading。

## 6. 反模式（AI 味红线）

- ❌ 彩虹渐变 / 霓虹辉光 / 玻璃拟态毛玻璃卡片
- ❌ 通用插画、机器人脸、星星装饰、emoji 图标
- ❌ 全大写标签、居中大段抒情文案
- ❌ 每屏都有的"欢迎！"式空态
- ✅ 一切以信息与操作为先，装饰退后
