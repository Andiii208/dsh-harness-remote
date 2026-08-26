## 2026-08-25 session.list 瘦身修复：1 项部署性阻塞（非代码）

- **dsh-harness-remote 0.3.2（瘦身版）需 DSH Desktop 重启激活**：修复已实现（`slimSessionListResult`，session.list 11.8MB→117KB）、测试/回归全绿、tgz 已重新 pack 并热装配进 profile。`dev_reload_package` 仍报「loader.internal 不可用」无法热重载。**重启 DSH Desktop 后生效**，现有 v0.3.2 APK 无需重装即可看到历史会话。
- App 侧 `RelayConnection.unary` 超时修复已合入 protocol 包，随下一版 APK（push 触发 CI）生效；未发版前，真机若再遇大数据响应会卡在等待（电脑端瘦身后已不会触发）。

## 2026-08-23/24 P0 可用性救援：1 项部署性阻塞（非代码）

- **dsh-harness-remote 0.3.2 需 DSH Desktop 重启激活**：代码已修复、测试全绿、tgz 已装入 profile（INSTALLED_VERSION=0.3.2）、持久化配置已预置（`~/.dsh/dsh-harness-remote/config.json` `{enabled:true,mode:"tunnel"}`）。`dev_reload_package` 在当前环境报「loader.internal 不可用」无法热重载；为不杀掉正在工作的会话未强行重启宿主。**下次重启 DSH Desktop 即全自动生效**（远程自启 + 手机回连）。重启后可在 DSH 日志核对 `按上次配置自启远程（tunnel）`。
- 仍保留的历史阻塞：iOS/EAS 发布与真机推送（见下方 Phase E 记录），本窗口未涉及。

## 2026-08-22 修复与优化计划（Phase 0–5）：无未解决阻塞

- 真实 DSH 校准已完成（DSH Desktop 2.0.1 / CLI 0.1.0-rc.7 / API 动态端口经 `DSH_WEB_URL` 注入）；`settings.mutate` 接受 `expectedRevision`；默认模型/权限写路径已实测并恢复；`commands/execute` 成功路径与 `/permission` 切换已实测。
- 插件默认不自动开公网隧道已实现（设置页手动开启）；本计划不再有真实 DSH 校准类阻塞。
- 仍保留的历史阻塞：iOS/EAS 发布与真机推送（见下方 Phase E 记录），本窗口未涉及。

## 2026-08-20 APK 闪退排查（已关闭/已修复）

- ~~**v0.3.0 APK 真机安装后闪退**~~ → **已关闭（2026-08-20）**：模拟器已复现。根因：`apps/mobile/src/ui/anim.ts` 将 `react-native` 的 `Easing.bezier` 传入 Reanimated `FadeInDown/FadeOut` 的 `.easing()`，release 包在 UI Runtime 同步调用该 JS 闭包触发 `[Worklets] Tried to synchronously call a Remote Function` 崩溃。修复：`Easing` 改从 `react-native-reanimated` 导入。CI 新 APK（run 32330750667）已安装到模拟器验证不闪退：onboarding → 主页 → 连接 mock-harness →「在线」→「进入会话」全程存活，`logcat -d -b crash` 为 0 字节，截图 `.shots/apk-home.png` / `.shots/apk-sessions.png`。

## 2026-08-20 新窗口（Phase A→E）阻塞记录

- **Phase A A1 真机回归（阻塞）**：本机 `adb` 不在 PATH，未连接 Android 设备/模拟器，也没有 Expo Go 真机窗口；无法取得 `.shots/real-*.png` 真机截图。Web Playwright 已覆盖 hero/多图/大图/技能弹窗（`.shots/plan-*.png`），A2/A3/A4 继续执行。EAS/真机推送仍沿用下方 P1b 阻塞。
- **Phase E E1/E2 EAS 发布与 iOS 构建（阻塞）**：本机 `eas` 不在 PATH（`Get-Command eas` → not found），未登录 EAS，无 Android development/preview 包、无 iOS 构建（需 Expo/Apple 开发者账号与 FCM/APNs 凭据）；无法产出 `.shots/eas-*.png`。E3 涉及 `docs/MANUAL.md` 但本窗口边界只允许 `docs/plans`，发布门禁改记录到 PROGRESS.md 与 `docs/plans/2026-08-18-next-window-plan.md`。

## 本计划（UI 学习与复刻 2026-08-18）：无

- 本次任务（技能 @ 提及 + 图片消息收发）：无
- 会话体验补全（imageLimits 校验 + 图片摘要 + 技能搜索）：无

- ~~流式暂停：协议层（packages/protocol/src/rpc.ts / transport.ts）当前没有主动中断 RPC~~ → **已关闭（Phase 1）**：`RpcClient.interrupt(sessionId)` 已新增（`/api/session.interrupt`，与 `unary` 同构）；`Connection.interrupt?` 可选字段 + `LanTransport` 接线；聊天页暂停按钮先发中断，失败才回退本地暂停并提示。宿主侧（DSH）暂无 `session.interrupt` 实现时，`harness-plugin/src/interrupt.ts` 提供接线桩（入参校验 + 响应构造），待真机实现后接入。
- ~~TLS 部署实测（Caddy/Docker）~~ → **已关闭（2026-08-18）**：Docker Desktop daemon 已运行；用 `caddy:latest` + `tls internal` + `reverse_proxy host.docker.internal:4090` 在 `wss://localhost:8443` 验证成功：`/healthz` 200、WSS 升级 101、`RelayClient` 经 WSS 完成 register + 取 6 位码（证据 `.shots/p2-wss-handshake.txt`、`.shots/p2-wss-relay.txt`）。公网域名/受信证书部署按 `docs/MANUAL.md` 2.8 替换为真实域名即可。
- **P1b 推送通知 + EAS 生产包**：EAS CLI 未登录（`eas whoami` → Not logged in），本机无 FCM/APNs 凭据，无法出 development/preview/production 包。代码侧已实现 `ExpoPushProvider`（relay `--push expo`，Expo Push API，无需 FCM/APNs 原始凭据）与现有 Expo push token 注册路径；真机/锁屏/深链/去重/权限拒绝降级验证需 EAS 登录与设备窗口。**iOS App 构建暂未完成**：需 Expo/Apple 开发者账号，当前未产出 iOS 安装包。
- ~~本地 Android release APK 构建~~ → **已关闭（2026-08-18）**：Windows + pnpm store 深路径导致 CMake/ninja `build.ninja still dirty after 100 tries`，短路径 junction 又因 Expo CLI 真实路径与 junction 根不一致失败；已新增 `.github/workflows/android-apk.yml` 改用 CI 的 Linux runner 构建（`expo prebuild` + `gradlew assembleRelease`），tag push / workflow_dispatch 自动上传 GitHub Release。v0.2.0 已通过该 workflow 产出 `app-release.apk`（约 125 MiB）并挂到 Release。
- ~~Android 真机 UI 验证（R1 远程优先首屏 + relay 配对）~~ → **已关闭（2026-08-18）**：根因是 Expo 默认只绑定 IPv6 `::1`，adb reverse/手机 LAN 访问 IPv4 `127.0.0.1/192.168.1.13` 失败；改为 `expo start --lan` 绑定 `::`（双栈）后真机可加载。真机证据：`.shots/android-r1-home.png`（App 加载）、`.shots/android-r1-remote.png`（远程模式选中 + relay 地址/配对码输入框）、`.shots/android-r1-paired.png`（在线 + `console-1 · paired`）；relay 日志 `RELAY_PAIRED device=relay-device-*`。遗留：Expo Go 开发警告浮层挡住「进入会话」入口，真机会话页截图未取，改由 Web Playwright `.shots/relay-mode-03-sessions.png` 覆盖。
