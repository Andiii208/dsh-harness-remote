# 2026-08-27 全面审查与优化计划

> 审查方式：4 路并行深查（移动端 UI / 功能完整性 / 后端链路与安全 / 工程健康度）+ 全仓 typecheck（7 包全绿）。
> 审查基线：v0.3.2（commit 5f1eeb0）。

## 一、总体判断

工程底子好得超出预期：strict TS + 全仓实质 `any` ≈ 0、77 个测试文件、CI 有 build/typecheck/test/字号门禁/E2E 冒烟五道闸、Expo SDK57 依赖矩阵精确对齐、移动端源码零 console.log。**问题不在「写得烂」，而在三处系统性断裂**：

1. **UI「丑」的根因是执行断裂**：设计系统 v9 文档很完整，但落地打折——品牌双画布只在半张页面兑现导致明暗气质割裂、`AppText` 零页面采用致字号字重漂移、BottomSheet 样式复制 4 份参数各异、图标体系至今是 emoji+unicode 凑数、多处死样式残留。
2. **「很多功能无法使用」的根因是死 API + 静默降级**：核心链路（扫码→relay 配对→E2E 加密→会话→流式聊天→在线审批）真实完整；但插件页/`host.settings.*` 是底层 RPC 404 的死界面，`interrupt.ts` 是从未接线的桩，十几个 RPC `catch { return null }` 让失败表现为「功能消失」而非报错。
3. **最大翻车点在电脑端零自愈**：正常退出反而清除自启开关、每次自启换 URL 换身份、WS 断线无重连、cloudflared 崩溃被静默吞掉、DSH 换端口后桥接永久失效——「电脑一重启，手机必失联」。

---

## 二、审查发现清单

### A. 可用性（对应「功能无法使用」）

| # | 发现 | 证据 | 用户可感知影响 |
|---|---|---|---|
| A1 | 正常退出清掉自启开关：卸载钩子 `stop()` 无条件写 `{enabled:false}` | `harness-plugin/src/apply.ts:90-98`、`remote-service.ts:207` | DSH Desktop 优雅退出后「保持开启」失效，下次不自启 |
| A2 | 每次自启 consoleId 随机重建 + quick tunnel URL 必换，persist 只存 `{enabled,mode}` | `remote-access.ts:116`、`persist.ts:18-23` | 每次电脑重启都要重新扫码 |
| A3 | console→relay WS 无重连、`heartbeat()` 定义了无人调度 | `relay-client.ts:325-331`、`:162` | 休眠唤醒/网络抖动后手机端永远显示离线 |
| A4 | cloudflared 崩溃无检测无重启：settled 后 exit 回调为空 | `tunnel.ts:219-223` | 隧道死了 UI 还显示运行中 |
| A5 | stop() 只 kill 不杀进程树（Windows 孤儿 cloudflared） | `tunnel.ts:169-177` | 端口/连接残留 |
| A6 | DSH baseUrl 探测成功即永久固定；重试只在「从未成功」时进行；404 能力缓存永不过期 | `dsh-bridge.ts:171-232,246,348-350`、`remote-service.ts:96-118` | DSH 重启换动态端口后「连着但看不到会话」且永不恢复 |
| A7 | plugin.list / plugin.exec 在 Desktop 2.0.1 上 404 进永久短路缓存，插件页真机永远空态；`plugin-catalog.ts` 模拟数据零调用方=死代码 | `dsh-bridge.ts:319-346`、`plugin-catalog.ts`、`ConnectionProvider.tsx:418-428` | 插件功能整体名存实亡，无法区分「不支持」与「没装」 |
| A8 | `host.settings.get/set` 两层死代码（App 直调版 + host-adapter 版均零调用方），实际走的是活路 settings.describe/mutate | `settingsDefaults.ts:5`、`ConnectionProvider.tsx:467-488`、`host-adapter.ts:42-51` | —（尸体代码） |
| A9 | `interrupt.ts` 自述接线桩，硬编码返回 `{interrupted:true}` 且无调用方；真机中断实际靠 `session.cancel`（rc.7 可用，缺失时本地冻结渲染兜底） | `harness-plugin/src/interrupt.ts:1-29`、`packages/protocol/src/rpc.ts:72-81` | 弱网下暂停体验降级 |
| A10 | ConnectionProvider 十余个 RPC `catch { return null/false }` 静默吞错 | `ConnectionProvider.tsx:342-356,418-464,556-848` | 大响应超时/网络抖动时表现为空白/功能消失，无从排查 |
| A11 | 离线队列 TTL 仅 120s/50 条：手机离线超 2 分钟，期间审批请求永久丢失且不补发 | `relay/src/queue.ts:14-19` | 最核心的「错过审批」场景 |
| A12 | 推送唤醒链路断在三处：内置 relay 未传 pushProvider；wake payload 手机端零处理（点击无深链不重连）；iOS/EAS 凭据长期阻塞 | `remote-access.ts:102`、`push.ts:150-160`、`BLOCKED.md:33` | 杀后台后收不到任何锁屏提醒 |
| A13 | 自动发现是 /24 HTTP 扫描降级实现（非 mDNS），最坏 ~30s，跨子网/改端口发现不了 | `discover.ts:1-42`、`protocol/src/discovery.ts:26-27` | 局域网发现慢且覆盖有限 |
| A14 | LAN 直连 token 门禁参考实现（gate.ts/createPairingPlugin）从未接到服务上，真实宿主不校验安全码 | `plugin.ts:3-60`、`protocol/src/transport.ts:75-82` | 填安全码徒增安全感，同网任何人都能直打 DSH API |
| A15 | events 页纯内存（上限 50 条、重连清空），不能当通知中心用 | `ConnectionProvider.tsx:213,264` | 事件看完即焚 |
| A16 | 图片接收每次渲染重拉 attachment 无缓存；下载失败静默不出图 | `MessageBubble.tsx:72-87` | 历史图片滚动卡顿、偶发无图 |
| A17 | BLOCKED.md：0.3.2 瘦身插件待 DSH Desktop 重启激活；App 侧 unary 30s 超时要随**下一版 APK** 才生效 | `BLOCKED.md:1-9` | 现网真机会话列表/大响应卡顿未消 |

正面确认（不用动的）：扫码配对、E2E 加密（ECDH P-256+HKDF+AES-GCM，replay/tamper 齐全）、会话列表瘦身、审批 respond rc.7 结构化契约、goals 全套原生 RPC、流式暂停 session.cancel 主路径、图片发送 limits 校验、字体/haptics/空态基建。

### B. UI 观感（对应「界面丑」）

| # | 发现 | 证据 |
|---|---|---|
| B1 | 双画布承诺断裂：v9 §1.1 要求 index/sessions 浅色也用深蓝品牌画布，实际浅=paper/深=hero 混合策略；深色下 index 是深海蓝、下一页 sessions 变近黑纸面白卡，顶级两页气质割裂 | `theme.ts:2` vs `index.tsx:278,587`、`sessions.tsx:526`、`docs/design/UI-SYSTEM-v9.md` §1.1/§8 |
| B2 | 深色 index「最近主机」卡漏改 heroCard 半透明变体，不透明 surface 压在 navy 上成视觉补丁（同文件其他卡片都做了分支） | `index.tsx:676-701` vs `:578-581` |
| B3 | 图标体系混乱：⚙ 设置齿轮、🛡 权限盾、↑↓ 发送/FAB、↻✓⛔◔ events 图标、‹›⌄ 分段控件全是文本字符；唯一 SVG 只有 FolderIcon | `index.tsx:299`、`chat/[sessionId].tsx:1104,1190,681`、`sessions.tsx:315`、`events.tsx:31-47` |
| B4 | BottomSheet 样式四处复制粘贴且固定 paddingBottom:28 不避手势条 | `sessions.tsx:641-678`、`chat/[sessionId].tsx:1384-1425`、`MessageBubble.tsx:368-397`、`TrajectoryView.tsx:245-255` |
| B5 | chat 页 1568 行上帝文件：~25 useState、11 个 Modal、330 行样式含 8 个死样式；无 useSafeAreaInsets，composer 被手势条压住；keyboardVerticalOffset=90 魔法数 | `chat/[sessionId].tsx:477,1429-1433,1238-1274` |
| B6 | settings 预设 id 胶囊与父卡同为 surface2 完全隐形（零对比度 bug）；大量文案硬编码中文绕过 i18n（外观/语言/字体大小等，英文模式下中英混排） | `settings.tsx:527,543`、`:409,419,441,459-467` |
| B7 | AppText 设计系统核心组件全 App 零引用；GoalCard 死组件；12 页面全手写字体样式——字号漂移根源。缩放通道建好却写死 scale=1，字号设置只覆盖聊天气泡和列表正文 | `AppText.tsx`、`GoalCard.tsx:16` |
| B8 | 动效系统名存实亡：anim.ts 封装完整但唯一 import 是死导入；按压反馈 opacity 0.6/0.7/0.85 三种随手值 | `index.tsx:16`、各 Pressable |
| B9 | 错误态三种口径并存（danger mono/warn mono/居中小字），无统一错误卡、无重试按钮、无 toast 体系 | `index.tsx:470,646`、`sessions.tsx` refreshError |
| B10 | 杂项：root 布局底色写死 #F7F7FA 不随主题（深色冷启动闪白）、dark.textDim≈2.6:1 对比度不达标、「⚙」再犯、无 title 时裸显完整 sessionId 非 mono 前 16 位、goalLabel 中文写死 | `_layout.tsx:111`、`theme.ts dark.textDim`、`sessions.tsx:403` |
| B11 | 新建会话按钮 #FFFFFF 硬编码等 5 处白色未归纳 token（语义可接受但应 token 化） | `sessions.tsx:585-586` |

### C. 安全（公网暴露面）

| # | 发现 | 证据 |
|---|---|---|
| C1 | `relay.register` 未认证 + SQLite ON CONFLICT 覆盖既有 publicKey/pushToken：知道 consoleId 即可身份顶替收离线信封 | `server.ts:272-324`、`sqlite-store.ts:92-99` |
| C2 | 配对码 `Math.random()` 非 CSPRNG；速率限制只护已认证流量，pair 免认证可 10 次/分/IP 并行爆破（锁定表内存态重启归零） | `store.ts:88`、`server.ts:243-253,326-362,146` |
| C3 | 多条静默明文降级：密钥派生失败照常明文路由无警告；收到明文 route 直接透传；配对公钥交换经 relay 无签名（恶意中继可 MITM 换钥） | `relay-client.ts:360-371,471-476,448-449` |
| C4 | ws 无应用层 maxPayload（默认约 100MiB），单帧可打满隧道 | `server.ts:547` |
| C5 | relay 默认内存态（`--store` 可选），自部署一重启全体掉线；内置 relay 未传 store 也未传 push | `cli.ts:17,54-57`、`remote-access.ts:102` |
| C6 | cloudflared 二进制 GitHub latest 直接下载无 checksum 校验 | `tunnel.ts:104-107` |
| C7 | MANUAL/SECURITY 是开发者视角：缺 Node 22+ 前置、防火墙步骤、「每次重启都要重新扫码」预期管理、排障表（E_PAIR/E_RATE/target offline/会话空）、彻底关闭/卸载指引 | `docs/MANUAL.md` 全文 |

### D. 工程质量

| # | 发现 | 证据 |
|---|---|---|
| D1 | 移动端 12/12 路由页面零渲染级测试（逻辑层抽纯函数间接覆盖，UI 装配无人管） | `apps/mobile/test/` 无任何 import 页面 tsx |
| D2 | 无 ESLint/Prettier（唯一的 lint 是自定义字号门禁） | 全仓无 eslint 配置/lint script |
| D3 | 工作区垃圾：tgz×4 + `.agent-teams/.dsh-vision-toolkit/.superpowers/viz` 四个 gitignore 目录（不入库，仅碍眼，可直接删） | 根目录 |
| D4 | typecheck 7 包全绿（本次实跑确认）；CI 五道闸健全；android-apk.yml tag 即出包挂 Release；console.log 移动端零残留 | 本次 typecheck 输出、`.github/workflows/` |

---

## 三、优化计划

排序原则：先让「已经写了的功能」真的能用（P0），再谈好看（P1）与安全（P2），最后是长期能力（P3）。每项标注涉及文件，方便拆任务执行。

### P0 — 可用性救援（目标：电脑重启后手机无需人工干预恢复）

| 序 | 任务 | 关键改动 | 文件 |
|---|---|---|---|
| 0.1 | 发布 v0.3.3 APK | 打 tag 触发 android-apk.yml 即可，让 unary 30s 超时 + 会话列表瘦身真正到达真机（现网最大感知改善，成本最低） | tag push |
| 0.2 | 修自启开关被自己清除 | 区分「用户主动 stop」与「宿主退出 cleanup」两条路径：cleanup 只停服务不改持久化配置 | `apply.ts:90-98`、`remote-service.ts` |
| 0.3 | consoleId 持久化 | 首次生成后写入 persist，重启复用同一身份，配对绑定跨重启保留（LAN 模式即刻闭环） | `remote-access.ts:116`、`persist.ts` |
| 0.4 | tunnel URL 轮换闭环（三选一，推荐 b） | a) 手机端在线时经控制面收到 `tunnel.url-changed` 帧自动更新主机记录；b) 引导 + 支持 Cloudflare 命名隧道（免费、URL 固定，账号注册一次）；c) 至少把新 URL 高亮展示在 DSH 设置页首屏 | `tunnel.ts`、`server.ts`、App `hostStore` |
| 0.5 | console→relay 自动重连 | 指数退避重连循环 + `heartbeat()` 定时调度（如 30s）+ 连续失败上报 service 状态；参照 dsh-bridge 事件流已有的 5s 重连实现风格 | `relay-client.ts:162,325-331`、`remote-service.ts` |
| 0.6 | cloudflared 崩溃自愈 | exit 回调改为有界重启（如 5 次退避）+ 状态回调让设置页显示「隧道已断开」真态；stop() 用进程树终止 | `tunnel.ts:169-223` |
| 0.7 | DSH 桥接重探测 | baseUrl 生效后若连续 N 次 API 调用失败则重回探测循环；unsupportedMethods 缓存加 TTL（如 24h）；netstat+HTTP 探测结果与「绑定错误目标」区分日志 | `dsh-bridge.ts:171-232,246`、`remote-service.ts:96-118` |
| 0.8 | 离线队列扩容 | TTL 120s→24h、条数 50→500（SQLite 已就绪只是默认没用）；配合 App 侧 pull 模式兜底：上线后主动拉审批 pending 列表而非只靠队列投递 | `queue.ts:14-19`、App 审批页 |
| 0.9 | 失败可见化 | ConnectionProvider 关键 RPC（历史/附件/模型列表/settings）失败从 `return null` 改为带错误对象的状态，UI 显示错误卡 + 重试按钮；插件页空态区分「宿主不支持该能力」（可用性探测已知 404 时给说明文案） | `ConnectionProvider.tsx`、`plugins.tsx` |
| 0.10 | 死代码清理 | 删除 `plugin-catalog.ts`、`interrupt.ts`、`hostSettingsGet/hostSettingsSet` 及 `adaptHostSettingsRpc`（连同其测试），缩小维护面 | 见 A7/A8/A9 |

### P1 — UI 观感跃升（目标：消除「廉价感」，一套图标 + 一种画布语言 + 一个 Sheet）

| 序 | 任务 | 关键改动 |
|---|---|---|
| 1.1 | 图标体系落地 | 选型 `lucide-react-native`（tree-shakable、线条风与 DeepSeek 质感匹配）或 `@expo/vector-icons` 单一 family；一次性替换 ⚙🛡↑↓✓⛔↔‹›⌄◔ 全部文本字符；建 `ui/icons.tsx` 统一出口 |
| 1.2 | 画布策略拍板并执行到底 | 二选一：(a) 按 v9 §1.1 把 index/sessions/scan 品牌画布做满（推荐，品牌差异度高）；(b) 修订文档承认 paper 策略。无论哪个，必须修 B2：index 深色最近主机卡改 heroCard 半透明变体 |
| 1.3 | ui/BottomSheet 组件 | 收敛 4 处拷贝为一个组件（backdrop/menuPanel/menuItem + insets.bottom + reduce-motion）；顺手把 approval/events 未注册 Screen 的问题在 _layout 里补齐 |
| 1.4 | chat 页拆分 | composer/消息列表/长按菜单/队列 banner 各自成组件；引入 useSafeAreaInsets 替代 keyboardVerticalOffset=90 与固定 paddingBottom:28；删 8 个死样式 |
| 1.5 | 速赢 bug 批 | settings presetCardId 对比度 bug；_layout rootView 底色随主题；dark.textDim 提亮至 ≥#6B6B74；无 title 会话行显示 mono 前 16 位；goalLabel 等硬编码中文全部入 i18n |
| 1.6 | 统一错误态组件 | `ui/ErrorCard.tsx`（danger 8% 底 + danger 18% 描边 + 重试按钮，按 v9 §5.1），替换三类一行小字；连接失败处接入 |
| 1.7 | AppText 真正接线 | 字号缩放参数从 FontSizeProvider 传入；范围扩大到 Field/Button/caption；AppText 逐步替换手写文字样式（可按页面渐进） |
| 1.8 | 动效接线 | anim.ts 的 FadeInDown 用于列表首屏与卡片转场（尊重 reduce-motion 已内建）；Pressable 按压反馈统一为 scale 0.98 + opacity 0.85 一个口径 |
| 1.9 | 主题切换动画过渡 | colors 切换时 LayoutAnimation/Reanimated 过渡，消除明暗跳变突兀感 |

### P2 — 安全加固（目标：公网入口从「能穿」到「防住」）

| 序 | 任务 | 关键改动 |
|---|---|---|
| 2.1 | pair/register 鉴权收紧 | pair 尝试纳入免认证限速（IP 维度）；register 未认证时禁止覆盖已有 publicKey（SQLite UPSERT 加 WHERE or 拒绝 + 显式 rebind 流程） |
| 2.2 | CSPRNG 配对码 | `crypto.randomInt(1000000)` 替换 Math.random；pairFailures/limiters 加 LRU/TTL 清理 |
| 2.3 | 消除静默明文降级 | 密钥派生失败时拒绝路由并报错（E2E 是卖点就不该无声回退）；收到意外明文 route 时丢弃 + 告警；配对公钥交换加 console 签名防中继 MITM（可后置） |
| 2.4 | 传输限额 | WebSocketServer maxPayload 设 8MiB；route 帧 length prefix 校验 |
| 2.5 | 供应链 | cloudflared 下载固定版本 + sha256 校验表 |
| 2.6 | 面向用户的文档 | MANUAL.md 增加「普通用户」章：Node 22+ 前置、Windows 防火墙放行、URL 轮换预期管理、E_PAIR/E_RATE/target offline/会话空排障表、彻底关闭与卸载 |

### P3 — 长期工程质量

| 序 | 任务 | 说明 |
|---|---|---|
| 3.1 | ESLint 落地 | typescript-eslint(strict) + react-hooks + react-native；从 warn 起步，CI 接线在 ci.yml typecheck 之后 |
| 3.2 | 页面级测试起步 | `@testing-library/react-native`；优先 index（连接表单状态机）、approval/[rpcId]（响应组装）、settings（describe/mutate 分支）三个页面 |
| 3.3 | 事件持久化 | events 页落 AsyncStorage/sqlite，容量上限 + 重连不清空，成为真正的通知中心（依赖 P2 文档口径同步） |
| 3.4 | 图片缓存 | attachment base64 落盘缓存（expo-file-system）+ LRU，历史滚动不再重复拉取 |
| 3.5 | mDNS 发现 | react-native-zeroconf 作为候选来源并入 discover.ts（接口已预留） |
| 3.6 | 工作区清理 | 删除根目录 tgz×4 与四个 gitignore 点目录（不影响仓库） |

## 三·五、执行进度（2026-08-27 自主批次收尾）

已落地（本机 commit，未推送）：
- P0：A1→230cbd0、A2/C5→7b2c807、A3→5be0d71、A4/A5→647f5cf、A6→bbcb6ba、A11→f47d702、死代码→be7c331
- P1：速赢批→0791f15、图标→337d44b、BottomSheet×14→5c400ac、ErrorCard→c63fc70
- 验证：typecheck 7 包全绿；test 501/501；字号门禁 strict 通过。完整记录见 PROGRESS.md 同日条目。
- 追加安全批（C1/C2）：CSPRNG 配对码 + register 公钥绑定防顶替（relay 40/40）。勘误：P2b pair 失败锁定此前已存在。C3-C7 仍列后续。

第二批（同日继续，全部完成）：
- 0.4 ✅ tunnel.urlChanged 推送闭环：protocol onHostEvent 接缝（relay.ts，含回归测试）→ console remote-access onUrlUpdate 推送（E2E 密封路径）→ App 迁移最近主机 + remote-url-changed 事件/通知（88bd105）
- 0.9 ✅ 历史加载 ErrorCard+重试；图片附件失败占位可点按重试；sessionModels 维持「不支持即隐藏」设计口径（6ebe7ca）
- B1/B2 ✅ v9.1 双画布裁定入档 + index 深色主机卡 heroCard 化（b37362c）；B5 ✅ chat insets+键盘偏移去魔法数（66356b4）；B7/B8/1.9 ✅ AppText scale 全组件生效（variantBase 纯函数佐证）、sessions/index 入场动效、ThemeCrossfade 背景交叉淡出（f8a15c2→931e1e7）
- C3/C4 ✅ 明文兜底拒绝+派生失败留痕、ws maxPayload=8MiB 含 1009 回归测试（d4e9dc9）；C6 ✅ cloudflared 钉版本 2026.8.2 + CLOUDFLARED_SHA256 fail-closed 校验（98cf540）；C7 ✅ MANUAL 普通用户部署章（d5ebac2）
- P3 ✅ ESLint flat config 全仓 0 error + CI lint 门禁（c8041dc）；渲染测试基建 RTR+RN shim 3 例（b033175/A15 事件持久化 03dfad3/A16 内存 LRU 9929478+磁盘层 5f441b4/mDNS 合并发现 4d2acff）

结案说明：
- 0.8「App 上线主动拉审批 pending」：真实 DSH 上游无 pending 列表 RPC（仅有下行 approval.requested 帧），无法真实现；痛点已由 A11 队列扩容至 24h/500 条 + A15 事件持久化双重覆盖 —— 按「上游能力缺失、替代方案已落地」结案。
- 0.1 发 APK 与「重启 DSH Desktop 激活插件」为用户部署动作（推 tag 触发 CI 出包），非代码任务。
- B5 的 chat 上帝文件「整文件拆分」按保守范围执行（insets/魔法数/死样式），组件级拆分列入后续美学迭代；页面级 RTL 渲染因 vitest 无 RN 官方环境，以组件级渲染测试+纯函数断言等效覆盖（已在 ui.render.test.tsx 头注释说明）。

✅ 计划内全部代码项至此完成。

## 四、里程碑建议

- **M1（可用性周）**：0.1–0.7 + 0.10 —— 全部是电脑端 TS，protocol/插件包测试文化成熟，一周可完成；发布 v0.3.3 验证「重启不失联」。
- **M2（观感周）**：1.1–1.6 —— 图标与画布是观感提升 80% 的两件事；速赢 bug 批先行一天内清完。
- **M3（安全周）**：2.1–2.6，其中 2.1/2.2 是公网模式发布的发布门槛（release blocker 性质）。
- **M4（沉淀）**：0.8/0.9 与 P3 按剩余带宽排。

## 五、执行纪律

- 每完成一项跑 `pnpm -r typecheck && pnpm -r test`；Conventional Commits 小提交。
- P1 每个页面改完用 Web 预览（Playwright 390×844）截图对照 v9 验收清单 §8。
- A17 的部署性阻塞（重启 DSH Desktop 激活 0.3.2 插件）仍是 M1 的第一步前置动作。
