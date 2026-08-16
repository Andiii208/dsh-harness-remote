# dsh-remote 品牌与 App 图标

- **产品显示名**：`harness remote`（App 图标下方/桌面名；项目名/仓库名保持 `dsh-remote`）。
- **App 图标**：白底圆角方 + 黑色鲸鱼（见下）；Android 自适应图标背景必须纯白（app.json `android.adaptiveIcon.backgroundColor` = `#FFFFFF`），否则黑色鲸鱼融入深色背景不可见。

## 图标：DeepSeek 黑色鲸鱼

- 源文件：`assets/branding/deepseek-whale-icon.svg`（1024×1024 矢量，透明底）
- 设计语言：**极简几何黑色鲸鱼**——细长流线型身体、分叉尾鳍、单片鳍、白色圆眼。致敬 DeepSeek 品牌鲸鱼，原创绘制（非官方 logo 复制品）。
- 使用方式：
  - 全图标（iOS/Android 主图标）：白底圆角方 + 黑色鲸鱼（Expo `icon.png` 1024×1024；圆角由系统遮罩，给全出血白底）。
  - Android 自适应图标：`foregroundImage` 用透明底 SVG 转 PNG（缩放 ~66% 安全区），`backgroundImage` 纯白。当前 `adaptive-icon.png` 为白底鲸鱼 PNG，配合 `backgroundColor: "#FFFFFF"` 显示一致。
  - 生成 PNG（已验证可用）：`npx -y sharp-cli -i <svg> -o <png> resize 1024 1024`，存 `apps/mobile/assets/icon.png` 与 `adaptive-icon.png`。⚠️ 不要用 playwright 直开 SVG 截图（此环境产出空白）。
  - 启动屏：`apps/mobile/assets/splash.svg`（#0A0C10 底 + 白色鲸鱼，含鲸眼抠色）→ sharp 栅格化 `splash.png`；app.json `splash` 用 `resizeMode: cover` 铺满。

## 视觉原则（App UI，避免 AI 味）

- 深色优先：近黑蓝底（`#0A0C10`，UI-SYSTEM v2）+ 高对比白/浅灰文本，DSH 终端感。
- 单一强调色点缀（青蓝 `#4D6BFE`，与 UI-SYSTEM.md / theme.ts 一致），不用彩虹渐变、不用玻璃拟态、不用 emoji 装饰。
- 排版克制：等宽/无衬线系统字体，信息密度高，间距统一（4pt 网格）。
- 状态表达：连接状态用色点 + 文本，不滥用徽章。
- 图标/插画只出现鲸鱼元素，避免通用 AI 生成风格。
