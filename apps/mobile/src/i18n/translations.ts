/**
 * translations — 文案字典（第一批：引导 + 连接页 + 公共）。
 * key 集合必须 zh-CN / en 完全一致（由 parity 测试保证）。
 */

export type Locale = "zh-CN" | "en";

export const en = {
  appName: "harness remote",
  onboarding: {
    tagline: "Your phone is the viewport for DeepSeek Harness: watch sessions, approve requests, keep the conversation going.",
    step1Title: "Install the plugin",
    step1Body: "Run on your computer: dsh plugin --profile web add dsh-harness-remote -w, then restart dsh web.",
    step2Title: "Open Mobile Remote",
    step2Body: "Open DSH Settings in the browser, click Mobile Remote on the left, then Enable public access.",
    step3Title: "Scan to connect",
    step3Body: "Back on your phone, scan the QR code on the computer screen (or type the address and 6-digit code).",
    start: "Get started",
  },
  connect: {
    remoteBannerTitle: "Remote to my computer",
    remoteBannerDesc: "Connect from anywhere. Scan the QR code on your computer, or type the address and 6-digit code.",
    lanBannerTitle: "Same Wi-Fi",
    lanBannerDesc: "Use when your phone and computer are on the same Wi-Fi.",
    scanConnect: "Scan to connect",
    connect: "Connect",
    manualToggle: "Enter address and code manually ›",
    collapseManual: "‹ Collapse",
    addressLabel: "Address",
    addressPlaceholder: "Paste the address shown on your computer (starts with wss:// or https://)",
    codeLabel: "6-digit code (optional)",
    codePlaceholder: "6-digit code shown on your computer",
    pcHelp: "How to set up the computer?",
    pcHelpTitle: "Three steps on your computer",
    pcHelpStep1: "1. Run: dsh plugin --profile web add dsh-harness-remote -w",
    pcHelpStep2: "2. Restart dsh web, open Settings → Mobile Remote → Enable public access",
    pcHelpStep3: "3. Back on your phone, scan the QR code",
    moreConnections: "More connection options ›",
    recentHosts: "Recent",
    disconnect: "Disconnect",
    enterSessions: "Open sessions →",
  },
};

export type TranslationKey = typeof en;

export const zhCN: TranslationKey = {
  appName: "harness remote",
  onboarding: {
    tagline: "手机是 DeepSeek Harness 的视口：查看会话、审批请求、继续对话。",
    step1Title: "电脑上装插件",
    step1Body: "在电脑终端运行：dsh plugin --profile web add dsh-harness-remote -w，然后重启 dsh web。",
    step2Title: "打开「手机远程」",
    step2Body: "电脑浏览器打开 DSH 设置页，左侧点「手机远程」，再点「开启公网访问」。",
    step3Title: "手机扫码即连",
    step3Body: "回到手机，扫电脑屏幕上显示的二维码（或手动输入地址和 6 位码）。",
    start: "开始使用",
  },
  connect: {
    remoteBannerTitle: "远程连接我的电脑",
    remoteBannerDesc: "走到哪儿都能连。扫电脑上的二维码，或手动输入地址和 6 位码。",
    lanBannerTitle: "同一 Wi-Fi 连接",
    lanBannerDesc: "手机和电脑连同一个 Wi-Fi 时使用。",
    scanConnect: "扫码连接",
    connect: "连接",
    manualToggle: "手动输入地址和 6 位码 ›",
    collapseManual: "‹ 收起",
    addressLabel: "连接地址",
    addressPlaceholder: "粘贴电脑上显示的地址（wss:// 或 https:// 开头）",
    codeLabel: "6 位码（可选）",
    codePlaceholder: "电脑上显示的 6 位数字",
    pcHelp: "电脑端怎么开？",
    pcHelpTitle: "电脑端三步",
    pcHelpStep1: "1. 终端运行：dsh plugin --profile web add dsh-harness-remote -w",
    pcHelpStep2: "2. 重启 dsh web，打开设置页 → 手机远程 → 开启公网访问",
    pcHelpStep3: "3. 回到手机，扫电脑上的二维码",
    moreConnections: "更多连接方式 ›",
    recentHosts: "最近连接",
    disconnect: "断开连接",
    enterSessions: "进入会话 →",
  },
};
