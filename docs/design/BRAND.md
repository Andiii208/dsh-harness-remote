# dsh-remote 品牌与 App 图标

- **产品显示名**：`harness remote`（App 图标下方/桌面名；项目名/仓库名保持 `dsh-remote`）。
- **App 图标**：白底圆角方 + 黑色鲸鱼（见下）；Android 自适应图标背景必须纯白（app.json `android.adaptiveIcon.backgroundColor` = `#FFFFFF`），否则黑色鲸鱼融入深色背景不可见。

## 图标：DeepSeek 官方黑色鲸鱼

- 源文件：`assets/branding/deepseek-whale-black.svg`（DeepSeek 官方 logo 鲸鱼 path 提取，黑色填充 `#0A0A0F`，viewBox 已裁剪到鲸鱼实际包围盒 `-20 -2 90 46`；原版蓝色全图在 `assets/branding/deepseek-whale-official.svg`）。
- 设计语言：**官方极简鲸鱼**——细长流线型身体、分叉尾鳍、单片鳍、镂空白眼与微笑线。致敬即官方（Wikimedia File:DeepSeek_logo.svg 提取）。
- 使用方式：
  - 全图标（iOS/Android 主图标）：全出血白底 + 官方黑鲸（Expo `icon.png` 1024×1024；圆角由系统遮罩，不要自绘圆角）。鲸鱼墨迹 bbox 与 DeepSeek 官方 App 图标实测尺寸对齐：1024 画布中约 x[140,920] y[249,823]（宽约 780）。源：`apps/mobile/assets/icon-full.svg`。
  - Android 自适应图标：`foregroundImage` 用透明底官方黑鲸，鲸鱼宽约 533/1024（≈52%），完整落在 66% 安全圈内；`backgroundImage` 纯白（app.json `android.adaptiveIcon.backgroundColor` = `#FFFFFF`，否则黑鲸融入深色背景不可见）。源：`apps/mobile/assets/adaptive-foreground.svg`。
  - 生成 PNG（已实测可用）：`msedge/chrome --headless=new --disable-gpu --force-device-scale-factor=1 --window-size=1024,1024 --screenshot=<out.png> <svg 的 file:// URL>`；也可用 `npx -y sharp-cli -i <svg> -o <png> resize 1024 1024`。存 `apps/mobile/assets/icon.png` 与 `adaptive-icon.png`。
  - 启动屏：`apps/mobile/assets/splash.svg`（浅色 `#F7F7FA` 底 + 官方黑鲸，与默认浅色界面一致）→ 栅格化 `splash.png`；app.json `splash` 用 `resizeMode: cover` 铺满。

## 视觉原则（App UI，避免 AI 味）

- 双主题默认浅色，设置页提供「浅色 / 深色 / 跟随系统」三选；令牌与 DeepSeek 官方蓝见 `docs/design/UI-SYSTEM-v7.md`：浅色 `#3964FE` / 深色 `#5686FE`（实测 chat.deepseek.com 主按钮色）、深色近黑底 `#0B0B0F`。
- 单一强调色点缀，不用彩虹渐变、不用玻璃拟态、不用 emoji 装饰。
- 排版克制：Space Grotesk 显示标题 + 系统字体正文 + JetBrains Mono 数据/眉标，信息密度高，间距统一（4pt 网格）。
- 状态表达：连接状态用色点 + 文本，不滥用徽章。
- 图标/插画只出现鲸鱼元素（官方黑鲸），避免通用 AI 生成风格。
