# PROGRESS

## Phase 4（v0.3 远程优先）：i18n 与发布质量（2026-08-18）
- i18n 基础设施：`src/i18n/`（translations.ts / index.tsx / languagePreferenceStore(+Adapter)）。默认 zh-CN，支持 en，Provider 挂 root；第一批覆盖 onboarding + 连接页文案，key 集合 parity 单测保证。
- 更新闭环：设置页「检查更新」解析 GitHub Release 资产，优先跳转 APK 下载；新增电脑端插件更新提示（`dsh plugin --profile web update dsh-harness-remote --latest -w`）。
- 真机回归清单：`docs/MANUAL.md` 新增 2.9「远程优先真机回归清单」（电脑端设置页 + 手机 4G 扫码全链路）。
- 版本：`harness-plugin` / `apps/mobile` 统一升到 `0.3.0`；连接页版本文案同步 `v0.3.0`。
- 发布门禁：`plugin_check` 对 `harness-plugin/` 判定 **pass**；`npm pack --dry-run` 产出 `dsh-harness-remote-0.3.0.tgz`（434.5 kB）。
- 回归：全仓 build/typecheck/test 全绿；capture 24 / protocol 127 / mobile 130（+2 i18n parity）/ mock 29 / relay 39 / harness-plugin 53。

## Phase 3（v0.3 远程优先）：设计系统精修（2026-08-18，基础设施已落地）
- 新增 `docs/design/UI-SYSTEM-v8.md`：Surface/Card/Board 三层、语义色注册表、字号白名单（10/12/13/14/15/20/24/28）、组件契约。
- `theme.ts` 增加 v8 别名：`card`（=surface）、`chip`（=surface2）、`board`（=separator），保持旧 key 兼容。
- 新增 `src/ui/AppText.tsx`：统一文字组件（display/title/body/caption/eyebrow/mono/monoBold + tone），只消费 token；`EmptyState` / `ConnectionBanner` 已接入。
- `Button` 新增 `loading` 态（ActivityIndicator + 禁用）；连接页「连接」、审批批量按钮已接 loading。
- 启动连续性：`_layout.tsx` 根视图背景设为 `#F7F7FA`，与 splash/浅色 Surface 一致，避免白闪。
- 字号 token 清理：sessions/settings 中散落的 9/10/13/14 改回 token（font.eyebrow / font.transcript / font.body）。
- 回归：全仓 build/typecheck/test 全绿；capture 24 / protocol 127 / mobile 128 / mock 29 / relay 39 / harness-plugin 53。
- 遗留（下一轮可继续）：全量 `fontSize:` 扫描仍有部分白名单内原始值（display 24/28、emoji/图标字形等）；AppText 尚未覆盖所有页面（当前先覆盖基础组件）。

## Phase 2（v0.3 远程优先）：会话/聊天/审批细节（2026-08-18）
- 空态统一：`EmptyState` 增加可选 `action`；sessions/chat/approval/plugins 四页全部改为「眉标 + 一句说明 + 行动按钮」。会话离线空态给「去连接」，在线无会话给「＋ 新建会话」；聊天空态给「去连接」；插件/审批空态给说明。
- 会话时间格式：新增 `formatSessionTime()`（今天 HH:mm / 昨天 / 一周内周X / 更早 M/D）并单测；sessions.tsx 改为消费该纯函数。
- 聊天：发送失败恢复草稿 + 错误行「重发」按钮；代码块头部新增「复制」按钮（与折叠并列）。
- 审批：批量处理后显示「已批准/已拒绝/已跳过 N 项」；审批详情页补充 `tool` 字段展示。
- 回归：全仓 build/typecheck/test 全绿；capture 24 / protocol 127 / mobile 128（+1）/ mock 29 / relay 39 / harness-plugin 53。

## Phase 1（v0.3 远程优先）：连接体验（2026-08-18）
- `ConnectionLoop` 新增 `maxAttempts` / `onGiveUp` / `lastErrorResult()`：连续失败达到阈值后停在 offline 并回调，不再无限重试；`start()` 可重新开始，`stop()` 在 run 已退出时立即结算不挂起。protocol 测试 127（原 125，+2 give-up）。
- 移动端新增 `src/transport/connectionErrors.ts`：连接错误分类（auth/pair/rate/timeout/refused/dns/tls/protocol/tunnel/unknown），每类给中文标题 + 建议；单测覆盖。
- `ConnectionProvider` 暴露 `lastError` / `givenUp` / `retry()` / `stopRetrying()`；pipeline 装配 `maxAttempts: 8` 并接 `onGiveUp` 分类。
- 新增 `src/ui/ConnectionBanner.tsx`（迁移 Cindy 结构）：1.2s 静默窗口防闪烁；错误/连接中/重连中三态；停止重试 / 重试按钮；`index.tsx` 已接入。
- 扫码流程不再直接跳 `/sessions`：`scan.tsx` 先显示「正在连接…」可取消，等 state=online 才进会话列表，失败给分类提示并恢复扫码。
- 连接页远程模式展示最近 relay 主机（过滤 port=0 / ws(s):// / relay://），一键重连。
- CLI 卡片按模式展示：公网模式打印 `wss://xxx.trycloudflare.com`，不再误导性打印本地端口。
- 回归：全仓 build/typecheck/test 全绿；capture 24 / protocol 127 / mobile 127 / mock 29 / relay 39 / harness-plugin 53。

## Phase 0（v0.3 远程优先）：DSH 设置页插件化 + cloudflared 公网（2026-08-18）
- 包重命名：`@dsh-remote/harness-plugin` → **`dsh-harness-remote`**（符合 `dsh-*` 规范，npm 已确认空闲）；README/CI/bat 引用同步。
- 单包化发布：`cordis.patch.yml` + `package.json` 的 `dsh.bundle.patch` / `dsh.client.inject`（web）声明；`scripts/build.mjs` 用 esbuild 把 `relay` + `@dsh-remote/protocol` + `qrcode` 打进 `lib/index.js`，CLI 打进 `dist/cli.js`（单包零 workspace 运行时依赖）；`npm pack --dry-run` 通过；`plugin_check` 对 `harness-plugin/` 判定 **pass**。
- 新增 `src/tunnel.ts`：cloudflared 二进制查找/下载（PATH → 插件 bin 目录 → 官方构建）、quick tunnel 启动/超时/URL 解析/停止；纯函数可测。
- `src/remote-access.ts` 支持 `mode: "tunnel" | "lan"`（默认 tunnel）：tunnel 模式 relay 只监听回环，公网入口由 cloudflared 承担，QR/地址返回 `wss://xxx.trycloudflare.com`；LAN 模式行为不变。
- 新增 `src/remote-service.ts`（状态快照 + 启停 + QR dataURL）与 `src/web-rpc.ts`（loopback RPC：`status/start/stop`，对齐 rpcErrorSchema）。
- 新增 `src/apply.ts`：DSH bundle 插件入口——加载即自动开启远程（默认公网）、注册 RPC、`ctx.effect` 清理。
- 新增设置页 `client/`（api.js / index.jsx / build.mjs）：DSH 设置一级入口「手机远程」，公网为主路径，显示二维码/地址/6位码/DSH 桥接状态/启停按钮；esbuild + `window.__ModuleLoader__.load` 打包（对齐 dsh-pocket）。
- App 远程优先：onboarding 改为三步卡（装插件→开设置页→扫码）；连接页远程模式主按钮改「扫码连接」，手动输入折叠；新增「电脑端怎么开？」内联说明；LAN 继续藏在「更多连接方式」。
- CI：`ci.yml` 增插件 `npm pack --dry-run` 门禁；新增 `publish-plugin.yml`（tag `plugin-v*` 发布 npm）。
- 回归：全仓 build/typecheck/test 全绿；测试数 capture 24 / protocol 125 / mobile 125 / mock-harness 29 / relay 39 / harness-plugin 53（新增 tunnel 6、remote-service 3、web-rpc 3、remote-access +1）。
- 待真机/真实 DSH 验证：`dsh plugin --profile web add dsh-harness-remote -w` 后设置页「手机远程」出码、手机 4G 扫码连上（当前环境无真实 DSH Web 与 cloudflared）。

## v0.2.0 之后：可用性修复 + UI 对齐 DeepSeek（2026-08-18）
- 图标：`icon.png` 黑鲸墨迹 bbox 对齐 DeepSeek 官方 App 图标实测尺寸（1024 画布宽约 780，居中）；`adaptive-icon.png` 缩小到宽约 533（约 52%），完整落在 Android 66% 安全圈内；`splash` 改浅色底 + 黑鲸。
- 主题：`app.json` 改 `userInterfaceStyle: automatic` + 浅色 splash/背景；新增 `themePreferenceStore`（默认 `light`，持久化）；设置页「显示 → 外观」支持 浅色 / 深色 / 跟随系统；连接页右上角新增「设置」入口。
- 动效：`useEntering` 的位移参数真实生效（`withInitialValues`），新增 `useExiting` 淡出；模式切换（远程/LAN）带退场动画；Stack 路由统一 `slide_from_right`。
- 远程真正可用：`harness-plugin` 新增 `dsh-bridge.ts` —— `dsh-remote remote` 自动探测并桥接 DSH API（DSH_WEB_URL/56734/3080），转发 `session.list/create/prompt/cancel/respond` unary 与 `events.mux`/`events.host` 下行事件；CLI 卡片增加 DSH 状态，二维码载荷补 `port`，并打印扫码载荷作为终端无法渲染二维码时的回退。
- 手机端：会话页新增「＋ 新会话」（`session.create`）；聊天输入区改为 DeepSeek 风格大圆角输入框 + 圆形发送按钮；`SessionStore` 兼容 DSH Desktop 新版事件（`user/message`、`assistant/chunk`、`assistant/message`、`session/projection {key,value}`）。
- 协议：`RemotePairPayload` 增加可选 `port`；`RelayConnection` 增加 `interrupt`（走 `session.cancel`）。
- 回归：`pnpm -r build` 全绿；测试 capture 24 / protocol 125 / mobile 125 / mock-harness 29 / relay 39 / harness-plugin 40 全过；relay 桥接冒烟实测 `session.list` 经 console 桥接返回 DSH Desktop 会话列表。

## v0.2.0 完善与自检（2026-08-18）
- App 品牌/版本核对：`app.json` name=`harness remote`、icon=`assets/icon.png`（官方黑色鲸鱼，白底）、version=`0.2.0`；首页底部版本文案同步 `v0.2.0 · harness remote`，配对状态改中文「已配对」。
- 本地 Android release APK 构建尝试：`expo prebuild` + `gradlew assembleRelease` 因 Windows pnpm 深路径 CMake/ninja 问题失败；已写 BLOCKED.md，需 EAS 云构建或 Linux CI。
- Android APK 改走 CI：新增 `.github/workflows/android-apk.yml`（Linux runner `expo prebuild` + `gradlew assembleRelease`，tag push / workflow_dispatch 自动上传 GitHub Release）；本机 Windows 深路径阻塞不再影响发版。已触发 v0.2.0 workflow 构建成功，Release 已附带 `app-release.apk`（约 125 MiB）。**iOS App 构建暂未完成**（需 Expo/Apple 开发者账号，当前未产出 iOS 安装包）。
- 低门槛文案微调：远程地址 placeholder 更具体，连接主路径保持「地址 + 6 位码」两字段。
- 自检结论：UI/动效/低门槛达标；正常使用由全仓测试 + 真实 DSH 探测支撑；Release 已有 Windows 脚本，Android APK 已接入 CI 自动构建，iOS 包暂未完成；因此「完全体可推广」尚差 iOS 安装包与推送真机验证。

## Phase P0–P2（真实宿主接缝 / 一键远程复用 / 推送准备 / TLS / 安全加固，2026-08-18）
- **P0 真实 DSH 宿主接缝校准**：真实 DSH `0.1.0-rc.7` 实测；协议适配 `type:"client-request"` 请求、`type:"server-response"`/`result.value` 响应、`type:"client-response"` respond 回执、WS server-request 帧解包并保留 rpcId；`session.prompt` 改 `mode+content`、`session.interrupt`→`session.cancel`、session.list 兼容 `items/sessionId/projections/cwd`；approval/question 帧接入 pending；harness-plugin 增 `host-adapter` 参考映射；COMPATIBILITY.md 增真实宿主矩阵。真实联调证据 `.shots/p0-real-dsh-probe.txt`（connect/session.list 125 项/session.prompt/session.cancel）。
- **P1a 宿主一键远程复用**：`remote-access.ts` 提供 `startRemoteAccess()/stop()`（relay + console + 6 位码 + QR 载荷），CLI 重构复用；测试覆盖 start/stop。
- **P1b 推送准备**：relay 增 `ExpoPushProvider`（`relay --push expo`）与 `createExpoPushProviderFromEnv()`；EAS/FCM/APNs 凭据缺失已写 BLOCKED.md，真机验证待 EAS 登录。
- **P2a TLS 部署实测**：Docker Desktop 已运行；`caddy:latest` + `tls internal` + `reverse_proxy host.docker.internal:4090` 验证 `wss://localhost:8443`：healthz 200、WSS 升级 101、RelayClient 经 WSS register + 取码成功（`.shots/p2-wss-handshake.txt`、`.shots/p2-wss-relay.txt`）。BLOCKED TLS 项已关闭。
- **P2b 安全加固**：relay.pair 失败锁定（默认 10 次/60s）、单 console 未使用配对码上限（默认 5）、审计新增 `pair_fail/pair_lock/pair_code_limit`（仅元数据）；SECURITY/MANUAL 同步。
- 全仓测试：protocol 124 / mobile 117 / harness-plugin 37 / relay 39 / mock-harness 29 / capture 24。

## Phase 9：远程优先 + 插件能力面 + 设置迁移 + 一键远程（完成，2026-08-18）
- R1 远程优先首屏：`apps/mobile/app/index.tsx` 默认远程模式；横幅文案随模式切换，[远程模式]/[局域网模式] 分段选择；远程模式只填 relay 地址（裸主机自动补 `ws://…:4090`）+ 可选 6 位配对码；LAN 保留主机/端口/token（token 收进高级）。`relayMode.ts` 增补裸主机/默认端口/IPv6 规则 + 单测（mobile 113）。
- R5a `relay.pair.code`/`relay.pair.code.ack`：协议加类型与 `makePairCode`；relay 服务器处理（未认证拒绝、console 取码、码一次性）；`RelayClient.requestPairCode()`；联调脚本改走协议取码。protocol 110 / relay 34 / harness-plugin 30（阶段内计数）。
- R2 插件能力面：protocol `plugin.ts`（PluginCommand/PluginSetting/PluginListResult + lenient 读取器）；harness-plugin `plugin-catalog.ts` 参考实现（DSH 注册表接缝 + 本地 manifest 目录 + 默认清单）；mock-harness `fixtures/plugins.json`；App 会话长按菜单动态展示插件指令 + `app/plugins.tsx` 插件页（单屏克制）。
- R3 设置迁移：设置页扩展为「连接 / 模型与权限 / 插件 / 显示 / 关于」；`host.settings.get/set` 能力可探测（读不到自动隐藏）；模型选择、思考强度、上下文容量细进度条、审批权限状态；App 本地字体大小（小/标准/大，影响聊天正文与列表正文）；检查更新走 GitHub Releases 对比。protocol `host-settings.ts` + mock `fixtures/settings.json`。
- R4 一键远程：`harness-plugin/src/cli.ts` 提供 `dsh-remote remote`：自动启动内置 relay（4090 被占用时自动选空闲端口）→ 注册 console → `relay.pair.code` 取 6 位码 → 打印小白卡片（relay 地址 + 配对码 + 操作说明）→ 配对成功提示 `已配对 device-xxx` → Ctrl+C 关闭。package.json 增加 bin 与 relay workspace 依赖。
- 动效：模式切换/表单 180–240ms 淡入淡出 + 轻上移；主按钮按下 scale 0.98 + opacity 0.85；尊重系统「减弱动态」。
- 集成联调：`.shots/relay-pair-integration.mjs` 组合 sessions/settings/plugins fixtures + relay + mock-harness + console；Playwright 在连接页输入 `127.0.0.1` + 6 位码完成配对，截图 `.shots/relay-mode-01-home.png` … `.shots/relay-mode-06-paired-home.png`（含设置页/插件页），find 证据 `.shots/relay-mode-find.txt`（插件指令/Ping 宿主/通知级别）。
- 全仓回归：protocol 110 / mobile 113 / harness-plugin 30 / relay 34 / mock-harness 29 / capture 24，build/typecheck/test 全绿；CI 最新 run 全绿。
- 明确不纳入：dsh-remote 自身不做插件宿主；用户 DIY 插件通过 DSH 插件系统 + R2 能力面在手机端呈现。

## Phase 8：UI 精简美化（DeepSeek 手机版风格，完成）
- 连接页：首屏只保留品牌、状态、主机/端口/可选配对码与主连接按钮；「高级」折叠 token；历史主机默认折叠；自动发现/扫码为次级文字入口。
- 引导页：3 步改为 1 屏（鲸鱼 + harness remote + 一句话 + 开始使用）。
- 会话页：标题「会话」+ 状态；搜索默认收起；pending 改轻量文字行；行只留标题/最近消息/时间，workspace 仅在分组头；上下文仅 ≥70 显示。
- 聊天页：移除 GoalCard 大卡与状态眉标，顶部小字会话标题 + goal 小 pill；输入区只保留输入框 + 圆形发送；暂停/恢复仅流式时显示为小文字按钮。
- 审批页：中文标签，去粗色条，底部只保留批准/拒绝主按钮，跳过提问弱化。
- 设置页：合并为一张主设置卡 + 关于分组，去掉英文 mono 眉标。
- 导航标题：会话/对话/请求/设置，系统字体、无阴影。
- Android 真机（Expo Go，MXW-AN00 Android 10）实测：连接页加载、连接到 mock-harness、会话列表显示 2 个 mock session（截图 `.shots/android-main.png` / `.shots/android-sessions.png`）。
- 文档截图：docs/screenshots/connect.png、sessions.png、chat.png 已同步为新 UI。

## Phase 7：M3.7 发布闸门前置（无真机部分完成）
- CI 升级 Node 24（`.github/workflows/ci.yml`）。
- `pnpm audit --prod`：仍为 3 个 Expo 工具链传递漏洞（image-size ≤2.0.2 ×2 high、uuid <11.1.1 ×1 moderate），均非运行时；记录在 SECURITY.md 发布检查清单，等待 Expo SDK 上游升级。
- `relay/src/sqlite-store.ts`：可选 SQLite 持久化 store（`node:sqlite`，`createSqliteRelayStore(path)`；`RelayServerOptions.store` + CLI `--store <path>`）。测试 3 个（重开保留 client/pair、online 持久化、配对码一次性/TTL）。relay 测试 29（原 26）。
- `relay/test/relay-multi.test.ts`：多 console/device 隔离测试 2 个（在线路由只投配对 peer、离线队列按 peer 隔离）。relay 测试 31（原 29）。
- TLS 部署实测：Docker Desktop daemon 未启动，已写 BLOCKED.md；启动后需按 MANUAL 2.8 用 Caddy 容器验证 WSS。

## Phase 6：M3.5 中继配对闭环 + 密钥持久化（完成）
- T1 protocol：`RelayTransportOptions` 新增 `pairCode`/`onPairAck`；未注入私钥时自动生成 ECDH P-256 keypair，register 携带 publicKey；配对码握手后发 `relay.pair` 并等 `relay.pair.ack`，派生会话密钥后启用加密数据面；未配置 pairCode 时明文路径不变。protocol 测试 100（原 97，+3）。
- T2 relay：`relay.pair` 成功后复用 `relay.pair.ack` 向被配对 console 推送 `{deviceId, peerPublicKey?}`；console 离线则入离线队列，重连 drain 投递；新增 `pair_notify` audit。relay 测试 26（原 24，+2）。
- T3 mobile：新增 `src/relay/relayDeviceStore.ts`（SecureStore → localStorage → 内存降级）持久化 deviceId/privateKeyJwk/publicKeyJwk；`ConnectionProvider` 使用持久化身份并支持可选 `pairCode`、`onPairAck`、`relayPeerId`；连接页 relay 模式显示 6 位配对码输入框，配对成功显示 `consoleId · paired`。mobile 测试 109（原 106，+3）。
- T4 harness-plugin：`RelayClient` 未注入私钥时自动生成 keypair，register 携带公钥；收到 `relay.pair.ack` 通知后派生会话密钥并回调 `onPaired`；M3.2 注入路径保持。harness-plugin 测试 23（原 21，+2）。
- 联调：`.shots/relay-pair-integration.mjs` 启动 relay + mock-harness + console（harness-plugin RelayClient）并打印 6 位配对码；Playwright 在连接页输入 `ws://127.0.0.1:4090` + 配对码完成配对，Sessions 出现 2 个 mock session；截图 `.shots/relay-pair-connect.png`/`.shots/relay-pair-sessions.png`，证据 `.shots/relay-pair-find.txt`/`.shots/relay-pair-sessions-find.txt`/`.shots/relay-pair-route-payload.txt`（route payload 仅 `{to, ciphertext, nonce}`）。
- 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿；测试数：protocol 100 / mobile 109 / harness-plugin 23 / relay 26 / mock-harness 29 / capture 24。真机 APNs/FCM 留待设备/账号窗口。

## Phase 5：M3.4 硬化与自部署（完成）
- `relay/src/rate-limit.ts`：令牌桶（默认 120/分钟、突发 240），超限 E_RATE；`relay-server.test.ts` 15 测试 + `rate-limit.test.ts` 3 测试。
- 审计日志：`audit` 回调（默认 JSON 行，仅 event/from/to/ts/ok，无 payload）。
- 版本协商：hello.ack 带 relayVersion/protocolVersion，不兼容附 compatible:false。
- `docs/MANUAL.md` 增补 relay 部署章节（TLS 终止、Caddy/Docker 示例、配置项）；README 更新 M3 状态。
- 全仓回归绿：protocol 97 / mobile 106 / harness-plugin 21 / relay 24 / mock-harness 29 / capture 24。真机推送与 relay 真机回归留待设备/账号窗口。

## Phase 4：M3.3 推送与离线队列（完成）
- `relay/src/push.ts`：PushProvider 接口 + MockPushProvider + NoopPushProvider（真推送留待设备/账号窗口）。
- `relay/src/queue.ts`：离线队列（TTL 2 分钟、每 peer 上限 50、满丢最旧、drain/expire）。
- relay 服务器：目标离线 route 入队 + push wake（失败降级），重连后 drain 投递；relay-server.test.ts 12 测试 + push-queue.test.ts 6 测试。
- `RelayTransport` / `RelayClient` 增加 pushToken 注册；mobile 增 Expo push token 守卫获取（Expo Go 降级 null）并传入 RelayTransport。
- 测试计数：relay 18 / protocol 97 / mobile 106 / harness-plugin 21；全仓 build/typecheck/test 全绿。

## Phase 3：M3.2 E2E 加密（完成）
- `packages/protocol/src/relay-crypto.ts`：ECDH(P-256) + HKDF-SHA256 + AES-256-GCM 纯函数（generateRelayKeyPair/deriveRelaySessionKeys/sealRelayPayload/openRelayPayload，WebCrypto 注入可测）+ 7 单测。
- `RelayTransport` 接入加密数据面（配置 privateKeyJwk/peerPublicKeyJwk 时 seal/open；未配置保持 M3.1 明文路径）；relay-transport.test.ts 新增 3 测试，protocol 96 tests 全绿。
- `harness-plugin/src/relay-client.ts` 同步接入加密（send 密封、收到密文解密回调、篡改触发 onError）+ 2 新测试；harness-plugin 20 tests 全绿。
- relay 服务器只读 `payload.to`，ciphertext/nonce 透明转发不解析；pair.ack 增补 peerPublicKey；relay-server.test.ts 增补 2 测试，relay 9 tests 全绿。
- 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿；SECURITY.md 更新 M3 为「E2E 已实现」；RELAY-M3.md 回填 M3.2 实现现状。

## Phase 2：M3.1 中继控制面 MVP（完成）
- 新包 `relay/`：credential（HMAC 短时凭证）、store（内存注册/配对/在线）、server（WS 控制面 hello/register/pair/route/heartbeat + /healthz；日志仅元数据）、cli（relay --port 4090）；7 单测（含安全红线：未认证 E_AUTH / 未配对 E_PAIR / 过期凭证被拒）。
- `packages/protocol/src/relay.ts` 增补：makeHello/makeRegister/makePair/makeHeartbeat 构造器；RelayTransport（单 WS、hello/register 握手、?credential=/?peerId=、M3.1 明文 relay.route 转发；unary 请求/响应匹配）。relay-transport.test.ts 7 单测，protocol 86 tests 全绿。
- `apps/mobile`：连接页 HOST 支持 relay:// / ws:// / wss:// URL（Relay 模式，端口忽略）；ConnectionProvider 自动选 RelayTransport，LAN 路径不变；relayMode 纯函数 + 3 单测；mobile 103 tests 全绿。
- `harness-plugin/src/relay-client.ts`：出站中继客户端接线桩（注册/心跳/收发信封）+ 4 单测。
- 联调：`.shots/relay-integration.mjs`（relay + mock-harness + console 桥）跑通；手机经 relay 看到 2 个 session（截图 `.shots/relay-connect.png`、`.shots/relay-sessions.png`，find 证据 `.shots/relay-sessions-find.txt`）。
- 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿；RELAY-M3.md 已回填「实现现状」；README 已同步。

## Phase 1：流式真中断（完成）
- 已完成：`RpcClient.interrupt(sessionId)`（`/api/session.interrupt`，与 `unary` 同构）；`Connection.interrupt?` 可选字段 + `LanTransport` 接线；`ConnectionApi.interruptStream` + 聊天页暂停按钮「先发中断，失败回退本地暂停」分流（成功提示「已发送中断请求」）。
- 宿主侧接线桩：`harness-plugin/src/interrupt.ts`（入参校验 + 响应构造，待 DSH 真机实现接入）。
- 联调 fixture：`mock-harness/fixtures/sessions.json` 增补 `session.interrupt` 成功响应与 `session/event interrupted` 帧；`.shots/phase1-interrupt-fixture.json` 为截图专用长流 fixture。
- 验证：mobile test 100 全绿 / protocol test 79 全绿 / mock-harness 29 / harness-plugin 14；全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿；Web 截图 `.shots/phase1-interrupt.png`（点击暂停后显示「已发送中断请求」，find 证据 `.shots/phase1-interrupt-find.txt`）。
- BLOCKED.md 唯一阻塞项已关闭。

## 任务 0 开工回执（2026-08-17 实测）
- 目标：按 C→A→B→M3(设计)→质量工程 顺序交付。
- 基线核对：mobile test 85 全绿 / mobile typecheck 退出 0 / protocol test 73 全绿。
- dist-web-v7 可重建（expo export 成功，仅 metro 缓存 warning）。
- 最大风险：静态导出下 Web 路由/截图验证受 SPA fallback 限制；协议无主动中断 RPC（流式暂停只能本地渲染）。

## C 审批流程（进行中 → 基本完成）
- 已完成：approvalHistoryStore 纯 TS + 单测（4）；/approval 列表页（多选批量批准/拒绝、提问批量跳过）；/approval/history 历史页（时间倒序）；设置页入口；sessions banner 改跳 /approval。
- respond 成功后写入历史；通知深链沿用 approval/:rpcId。
- 验证：mobile test 89 全绿；typecheck 0；浅深截图已存 .shots/approval-light.png、approval-dark.png。
- 待办：提交 feat commit。

## A 会话列表（完成）
- 已完成：sessionViews 纯函数（filterSessions/groupByWorkspace/pressureTier）+ 5 单测；sessions.tsx 搜索框（v7 Field）、SectionLabel 组头、miniBar 分档（<70 success / 70–85 warn / ≥85 danger）+ 文案。
- 验证：mobile test 94 全绿；typecheck 0；浅深截图 .shots/sessions-light.png、sessions-dark.png。
## B 聊天体验（完成）
- 已完成：highlight(code, lang→已并入 highlight 四类着色) 纯函数 + 3 单测；MessageBubble 长按操作菜单（复制全文/按代码块复制）；代码块默认展开 + 折叠按钮 + 轻量高亮；流式本地暂停（协议无主动中断 RPC，见 BLOCKED）。
- 验证：mobile test 97 全绿；typecheck 0；浅深截图 .shots/chat-light.png、chat-dark.png（含代码块高亮/折叠按钮），sessions 截图已重取含压力文案。
## M3 中继（完成设计+协议最小验证）
- 已完成：docs/design/RELAY-M3.md（控制面协议/注册/配对/路由/心跳/错误码、E2E 密钥交换、RelayTransport 签名与 App 接入点、部署与安全边界、M3.1–M3.4 计划）；packages/protocol/src/relay.ts 新增类型 + parseRelayEnvelope/isRelayEnvelope/normalizeRelayError（新增导出，未改已有行为）+ 4 单测。
- 验证：protocol build 通过；protocol test 77 全绿（≥76）；protocol typecheck 0；mobile test 97 / typecheck 0 不降。
- 评审前不写 relay 服务器实现。
## 质量工程（完成）
- README 功能清单已同步（审批/搜索分组压力/聊天体验/M3 设计）。
- 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿（build 先行）。
- 截图回归：.shots/approval-light.png、approval-dark.png、sessions-light.png、sessions-dark.png、chat-light.png、chat-dark.png（不入库）。
- 断线重连/保活已有单测（autoReconnect/keepalive/pipeline）未涉及本次改动，无需补。
