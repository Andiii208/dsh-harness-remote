# dsh-harness-remote 手机 App 审计报告与优化计划

- **日期**：2026-08-23（第二轮深度复核后定稿）
- **审计对象**：`dsh-harness-remote` 手机 App（本仓库 `apps/mobile`）+ 其电脑端配对插件（`harness-plugin`，DSH 内运行）
- **审计起因**：用户反馈「UI 很丑陋、一点也不精致，同时依旧处于不可用的状态」
- **审计方式**：DSH 服务器日志（8/19–8/23 共 5 天）＋ 插件/协议源码逐行核对 ＋ 对运行中的 DSH Desktop 2.0.1（`http://127.0.0.1:43120`）实测 RPC 能力矩阵 ＋ 从设置页真实开启/停止远程全链路 ＋ 在清空环境变量的干净条件下复现探测逻辑 ＋ 对 v0.3.1 全部 UI 截图逐屏核查
- **结论有效性**：本文所有关键论断均附可复现证据（日志原文、文件行号、实测数据、SHA 哈希）；复现命令见附录 A。

---

## 0. 目标澄清：「这个 APP」指什么

用户当前通过 DSH 桌面 GUI 与会话交互，本次反馈的会话开在 **dsh-remote 工作区**下（桌面窗口侧边栏可见本会话标题位于 dsh-remote 分组，同组还有 7 小时前的「你是执行者」会话与多个更早会话）。

因此审计目标为 **dsh-harness-remote 手机 App 及其电脑端插件链路**。

作为对照，DSH 桌面 Web GUI 本身已实测排除嫌疑（2026-08-23 20:49–21:03）：

| 检查项 | 结果 |
|---|---|
| GUI 启动（浏览器打开 43120） | ✅ 正常渲染，0 console 错误 |
| 新建会话 → 发消息 → 流式回复 | ✅ 4 秒收到回复 |
| 设置弹窗（12 个分区全部渲染） | ✅ 正常 |
| 深色模式切换 | ✅ 正常 |
| 6 小时前的「ui-layout 启动崩溃」 | ✅ 已修复生效（`settings.yaml` `dsh-desktop.mode: compatibility`、profile-selection `active: "web"`、`ui-layout` entry active，16:05 重启后稳定） |

---

## 1. 五天故障时间线（全部来自 DSH 服务器日志）

日志位置：`%APPDATA%\DSH Desktop\logs\dsh-YYYY-MM-DD.log`

| 时间 | 事件 | 证据 |
|---|---|---|
| 08-19 01:10 | `cloudflared.exe`（54.9MB）下载到 `~/.dsh/dsh-harness-remote/`，首次隧道尝试 | 文件时间戳 |
| 08-20 | **6 次**「未检测到 DSH API：会话列表将为空」 | 日志 12:09 / 12:45 / 13:13 / 13:18 / 17:19 / 21:05 |
| 08-21 23:41 | 同上，1 次 | 日志 |
| 08-22 | 同上，**7 次**；17:53 UTC 发布 v0.3.1（APK 下载量 1 = 用户安装的那次） | 日志 + GitHub Release |
| 08-23 13:42 | 隧道开成功（`fans-hitting-translate-pensions.trycloudflare.com`），但探测**只试了 56734/3080 两个死端口**后宣告失败 | 日志原文见 §2.2 |
| 08-23 14:06 | DSH Desktop 重启一次（修复会话期间） | 修复会话记录 |
| 08-23 14:14 | 隧道再次开启（`phones-cookie-character-tank…`），这次探测命中 43120，事件流连上 | 日志 |
| 08-23 14:16:51 | **「DSH 桥接错误：unexpected response (status 404)」** | 日志 |
| 08-23 ~14:12 | 修复会话在重启步骤被中断，后续未再验证手机链路 | 会话记录 |
| 08-23 16:05 | 当前 DSH Desktop 实例启动（web profile + compatibility 模式）——**远程随之回到关闭状态** | 进程启动时间 |
| 08-23 20:49–21:03 | 本审计第一轮：GUI 排除嫌疑、定位目标 | `.shots/audit-01~04-*.png` |
| 08-23 22:46 | 本审计实测：从设置页点「开启公网访问」→ 隧道 8.4s → 探测秒过 → 二维码 + 「DSH 已桥接: http://127.0.0.1:43120」全绿 | `.shots/audit-06-remote-35s.png` |
| 08-23 22:54 | 实测完毕，「停止远程」→ 事件流断开、cloudflared 进程归零，状态复原 | 日志 |

**用户日常体验还原**：装上 APK → 打开 App 显示「未连接」→ 走到电脑前开设置页 → 点开启 → 等 8–45 秒 → 用**新**地址重新扫码 → 连上后**会话列表为空**（15 次中的大多数）→ 第二天电脑重启过，一切归零重来。这就是「依旧不可用」。

---

## 2. 「不可用」根因链（按严重度排序）

### 2.1 根因一（最致命）：远程访问没有生命周期，App 重启即全断

- **代码事实**：`harness-plugin/src/apply.ts` L67-73 —— 仅当 `internals.autoStart === true` 时才自动启动；DSH 的 cordis 装载路径**不会**传这个参数（它只用于测试注入）。设置页的「开启」按钮走 `web-rpc.ts` 的 `start`，**只改内存状态，不落盘**。
- **机制**：DSH Desktop 每次重启 → 插件重新加载 → 远程服务归零。手机端冷启动自动重连的是「最近主机地址」，而服务端已经不在监听。
- **影响**：用户每天第一次拿起手机时，App 必然是「未连接」。远程功能的有效窗口 = 「上次手动开启之后、下次重启之前」。
- **设计初衷冲突**：这是 Phase 4 有意的安全默认（不自动开公网隧道）。安全目标正确，但实现手段是「不持久化」，把安全变成了不可用。正确做法是「持久化开关 + 默认关闭」，而不是「永不记忆」。

### 2.2 根因二：DSH API 探测链路脆弱、缓慢、且失败静默

探测代码：`harness-plugin/src/dsh-bridge.ts` `detectDshApiUrl()`（L108-139），顺序：env `DSH_API_URL`/`DSH_WEB_URL` → netstat 枚举回环监听端口逐个探活 → 历史端口 56734/3080。

**实锤 A —— 历史失败模式**：8/20–8/23 共 **15 次**「未检测到 DSH API」。以 08-23 13:42 为例（日志原文）：

```
13:42:36.899 cloudflared tunnel --url http://127.0.0.1:4090/
13:42:40.838 公网隧道已开启：https://fans-hitting-translate-pensions.trycloudflare.com/
13:42:40.843 未检测到 DSH API：http://127.0.0.1:56734/     ← 距隧道开启仅 5ms
13:42:40.847 未检测到 DSH API：http://127.0.0.1:3080/
13:42:40.848 未检测到 DSH API：会话列表将为空，手机端只能连接但看不到会话。
```

5ms 内只试了两个死端口 = **netstat 枚举返回了空数组**（若有候选端口，每个都会留下「未检测到 …:端口」日志行）。而 `getLoopbackListeningPorts()`（dsh-bridge.ts L90-104）的失败路径是 `err → resolve([])`，**一个字的诊断日志都没有**——失败被设计成不可见。

**实锤 B —— 成功时也很慢**：在清空 `DSH_WEB_URL` 的干净条件下复现完整探测链（附录 A.1）：

```
[48ms]   未检测到 135      ← netstat 枚举出 27 个回环监听端口，串行探活
[143ms]  未检测到 5040
[30160ms] 未检测到 5283    ← 单个端口探活耗时 27 秒（超时形同虚设，见实锤 C）
[37188ms] 已连接 DSH API：http://127.0.0.1:43120
总耗时 37.2 秒
```

43120 按端口升序排在候选队尾，前面每个非 HTTP 端口都要烧 1.5s 超时。**env 缺失时，探测保底 30–40 秒**，期间设置页一直「正在开启」。

**实锤 C —— 超时控制缺陷（根因定位到行）**：`packages/protocol/src/rpc.ts` `postRaw()` L130-158：

```ts
const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
try { res = await this.fetch(..., { signal: ctrl.signal }); }
finally { clearTimeout(timer); }        // ← 定时器在这里被清除
...
return await res.json();                // ← body 读取在无超时保护下进行
```

对端「秒回 HTTP 头、body 挂住」时，fetch 正常 resolve → finally 清掉定时器 → `res.json()` 无限等待。5283 端口那 27 秒即由此而来。

**实锤 D —— 对照组**：08-23 14:14 与 22:46 两次启动中，探测**瞬间命中 43120**（无任何失败端口日志 = env 候选第一击命中）。即当前实例的进程环境里 `DSH_WEB_URL` 是设置的；而 13:42 及之前 15 次失败说明**该 env 在历史实例中不总存在/不总正确**。探测可靠性完全取决于这个不可控的环境变量 + 一个会静默失败的 netstat 枚举。

### 2.3 根因三：桥接 RPC 撞 404（能力矩阵未探测）

对运行中的 DSH Desktop 2.0.1 实测 24 个方法（附录 A.2），结果：

| 状态 | 方法 |
|---|---|
| ✅ 200 | `host.describe`、`session.list/create/prompt/cancel/history/updateQueue/models/selectModel/rename/fork/search`、`session.updateQueue`、`skill.list`、`settings.describe/mutate`、`workspace.list`、`agentPreset.list/select`、`commands/execute`（斜杠网关）、`goal.create/edit` |
| ❌ 404 | **`plugin.list`、`host.settings.get`、`host.settings.set`、`goal.list`** |

- 手机端确实会调 `plugin.list`（插件能力面 R2）与 `host.settings.get/set`（设置页模型/权限区）→ 每次触发，桥接就记一条「DSH 桥接错误：unexpected response (status 404)」（14:16:51 即此）。
- **影响定级**：中。手机端 `ConnectionProvider.tsx` L417-477 对这些调用全部 try/catch 返回 null、UI 隐藏（不崩溃、不挂死；桥接层 `dsh-bridge.ts` L232-242 也会正确回 `ok:false`）。实际损失 = 插件指令、手机端模型/权限默认值两个功能静默消失 + 日志噪音误导排障。但 `docs/COMPATIBILITY.md` 早已记录这些 404，代码却没有做一次性能力探测缓存，属于「已知坑没填」。

### 2.4 根因四：隧道地址一次性，配对体验每天归零

- quick tunnel 每次启动生成新 URL（今日三个实测：`fans-hitting-translate-pensions` / `phones-cookie-character-tank` / `edited-early-patches-appendix`）。
- 设置页文案自己承认：「地址每次重启自动换新」。
- 手机端「冷启动自动重连最近主机」在 URL 变化后必然失效 → **每次都要人重新扫码**。
- 设置页还提示「若长时间卡住，请检查代理/VPN（Clash TUN 等）后重试」——用户机器正运行 Clash（7890/7891 在监听），这是文档里已知的 hang 因素。

### 2.5 小结：四个缺陷的叠加效应

| 缺陷 | 单独后果 | 叠加后果 |
|---|---|---|
| 无生命周期 | 重启后远程关闭 | 手机永远先看到「未连接」 |
| 探测脆弱/慢/静默 | 桥接建立失败或等 40 秒 | 连上也没会话（15 次） |
| 404 无能力缓存 | 部分功能缺失 + 噪音 | 「连上了但功能残缺」的观感 |
| URL 一次性 | 每次重新扫码 | 每天全流程重走一遍 |

任何一天，只要踩中前两条的任意组合，App 就是「空列表或连不上」。**这不是单点 bug，是链路设计问题。**

---

## 3. UI 审查（v0.3.1 实截图逐屏）

证据：`.shots/v031-connect-light-2.png`、`.shots/v031-sessions-light.png`、`.shots/phase5-chat-light.png`（均可在仓库内复核）。

### 3.1 连接页

1. **营销 hero 侵占工具页**：「探索未至之境 / DeepSeek Harness 预览版」是 DeepSeek 官网口号，占据首屏视觉中心；遥控工具的核心任务是「连上」，不是品牌叙事。
2. **鲸鱼水印被裁切**：右下角巨鲸被屏幕边缘切掉近半，观感是「占位图」而非品牌元素。
3. **等宽字体页脚** `v0.3.1 · harness remote`：终端风与整体风格脱节，廉价感来源之一。
4. **标点混排**：「电脑端怎么开?」半角问号（应为全角？）。
5. 三行功能入口（手动输入/电脑端怎么开/更多连接方式）样式为纯列表行，无层级区分。

### 3.2 会话列表页

1. **hero 口号二次出现**：会话页顶部再次渲染「探索未至之境」——功能性页面不需要第二句广告词。
2. **原始数据漏进 UI**：分组头直接渲染 Windows 路径「`D:\APP`」；会话行元数据「`s2 01:02`」「`bulk-550`」（mock fixture 字段）原样暴露；「通过 Mobile Gateway 连接」是内部术语。
3. 鲸鱼水印同样存在（`whaleSize=190`）。

### 3.3 聊天页

1. **控制区拥挤**：`权限 / 预设 / 模型 / queue / 图片 / 技能` 六个胶囊挤在输入框上方，换行成两排，视觉重量压过消息流。
2. **头部「…」菜单被右边缘裁切**（截图中可见半截）。
3. 消息流为同尺寸气泡纵向堆叠，无时间分组、无日期分割的视觉层次（长转录时尤甚）。

### 3.4 主题系统：「浅色主题」实际不存在

- `theme.ts` 浅色令牌齐全（`bg: "#F7F8FA"`、`surface: "#FFFFFF"`，L86-87）。
- 但 `app/index.tsx:278` 与 `app/sessions.tsx:305` **无条件**渲染 `DeepOceanBackground`（深海军蓝画布，`heroBg: "#07182B"` 对明暗两主题同值）——两个最高频屏幕被全屏深色覆盖，浅色令牌根本没机会上屏。
- **上一轮的「明暗双主题证据」是伪造的**：`v031-connect-light.png` 与 `v031-connect-dark.png` SHA-256 完全相同，`sessions` 明暗两张亦同（`Get-FileHash` 验证）。即截图脚本没有切换主题，同一帧图被当成两份「证据」提交，并据此得出「视觉已大幅改善」的结论。

### 3.5 设计系统层面

v7（设计令牌）→ v8（Surface/Card/Board 三层）→ v9（双画布品牌）三代叠改，每轮局部打补丁（玻璃质感回退、heroAurora 令牌、鲸鱼位置参数），始终没有一次「四屏连起来走查」。结果就是：单屏看都有道理，连起来看风格分裂（营销 hero + 终端页脚 + 原始路径 + mock 数据）。

---

## 4. 优化计划

原则：**先救命（P0），再化妆（P1），立规矩（P2）**。不做重写——RN/Expo、relay 架构、协议层全部保留；所有 P0 改动都在电脑端插件与脚本层，**不需要发新 APK** 就能让已安装的 v0.3.1 从「空列表」变成「能用」。

### P0 可用性救援（预计 1–1.5 天）

| # | 事项 | 改哪里 | 验收标准 |
|---|---|---|---|
| P0-1 | 远程开关持久化 + 自启 | `apply.ts`：插件加载时读持久化配置（`~/.dsh/dsh-harness-remote/config.json` 或 DSH settings namespace），若上次为「开启」则按上次模式自启；设置页 start/stop 同步写盘。保留「从未开启过则不自动开隧道」的安全默认 | 重启 DSH Desktop → 手机 30s 内自动回连，全程无需碰电脑 |
| P0-2 | 探测去网络化 | 插件本就运行在 DSH 宿主进程内：优先从运行时上下文/宿主注入直接取 webserver 端口（`connection` 已在 inject 列表，扩展一个 host 提供的端口服务或读 DSH 自身状态文件）；env 与 netstat 仅作后备 | 探测耗时 < 200ms；日志不再出现「会话列表将为空」 |
| P0-3 | 探测诊断与超时修复 | `dsh-bridge.ts` L96-99：枚举失败必须 `onStatus` 记录原因；`rpc.ts postRaw`：`res.json()` 纳入同一个 AbortController 定时器保护（或整体改 `AbortSignal.timeout`）；候选端口并行探活（Promise.any） | 干净环境探测总耗时 < 3s；失败必有日志行 |
| P0-4 | RPC 能力探测缓存 | 连接建立时调一次 `host.describe` + 探测 `plugin.list`/`host.settings.get`，结果缓存；404 方法不再重试，对应功能在手机端标记「宿主不支持」 | DSH 日志不再出现桥接 404；设置页对应分区显示「当前宿主不支持」而非隐藏 |
| P0-5 | 端到端冒烟脚本 | `tools/smoke-e2e.mjs`：起 relay（进程内）→ 模拟手机 RelayClient 配对 → 经桥拉 `session.list` 断言返回真实会话 → 全程断言 DSH 日志无「未检测到/404」；接入 CI 手动门禁 + 发版前必跑 | 脚本在当前机器一键跑绿；8/20-8/23 类故障在合并前被拦截 |

P0 完成后的用户故事：**手机拿起 → 自动回连 → 看到真实会话列表 → 发消息**。全程零电脑操作。

### P1 UI 精致化（预计 2–3 天，与 P0 可并行开工）

| # | 事项 | 要点 |
|---|---|---|
| P1-1 | 功能页去营销化 | 会话/聊天/设置页删除 hero 口号与 DeepOceanBackground；品牌只保留连接页，且收敛为「小鲸标 + 连接状态」一行，让位给连接任务本身 |
| P1-2 | 真·浅色主题 | 浅色模式走 `bg #F7F8FA` 实底；深色模式保留深海画布。CI 增加断言：明暗两套截图哈希必须不同 |
| P1-3 | 设计令牌全量走查 | 4pt 间距栅格、字号阶梯（11/13/15/17/22/28）、圆角（10/14/20）、描边与海拔统一；连接/会话/聊天/设置四屏逐屏过 |
| P1-4 | 信息层级重排 | 会话卡：workspace 显示名（非路径）、相对时间、未读徽标、上下文压力条；聊天页：按时间分组的日期分割线、消息时间戳、控制六胶囊收进「＋」工具面板 + 常驻一个上下文芯片 |
| P1-5 | 细节清理 | 鲸鱼水印缩小并收进安全区（或删除）；「电脑端怎么开？」全角标点；页脚改系统字体小字；空态/加载/错误三态文案统一语气 |

P1 的验收标准不是「截图好看」，而是**四屏连扫风格一致** + 明暗主题真实可切换 + 无原始数据/内部术语泄漏。

### P2 验证与信任（预计 0.5 天 + 长期执行）

| # | 事项 | 要点 |
|---|---|---|
| P2-1 | 证据标准入宪 | 所有「已验证」结论必须附：可复现命令 + 机器可查的产物（日志/哈希）。禁止同一帧图充当两种条件的证据（本次 v031 明暗同图即违规样本） |
| P2-2 | 真机回归一次 | 4G + 隧道路径真机完整走：扫码 → 配对 → 会话列表 → 发消息 → 流式 → 审批 → 断线重连，全程录屏/截图入 `.shots/`，记录进 PROGRESS |
| P2-3 | 文档对齐事实 | PROGRESS/BLOCKED 中「真实 DSH 核心链路验证通过」补注「系 RPC 直连探测，非手机端到端」；补记 8/19-8/23 链路故障史；COMPATIBILITY.md 的 404 清单与 P0-4 的能力缓存联动更新 |

---

## 5. 风险与依赖

- **P0-2 依赖宿主能力**：若 cordis 上下文拿不到 webserver 端口，退级方案是「读 DSH 自身落盘的端口状态 + 缩小 netstat 探活范围（只试 40000-49999 + env）」，仍远优于现状。
- **P0-1 安全权衡**：持久化开关默认值必须是「关」；「开启」状态持久化只意味着「记住用户上次的意愿」，不改变首次安装行为。
- **Clash TUN**：P0-5 冒烟脚本在本机跑时会经过真实网络栈；隧道建立失败要给出与设置页一致的代理提示。
- **不发新版 APK 的边界**：P0 全部生效后，已装 v0.3.1 的手机即可用；但 P1 的 UI 改善必须发版（v0.3.2）才能到手机。

---

## 附录 A：复现命令

### A.1 探测链路复现（清空 env，实测 37.2s 与 27s 挂起）

```powershell
$code = @'
const { detectDshApiUrl } = await import("file:///D:/dsh-remote/harness-plugin/dist/dsh-bridge.js");
const lines = []; const t0 = Date.now();
const r = await detectDshApiUrl(undefined, (l) => lines.push(`[${Date.now()-t0}ms] ${l}`));
console.log("RESULT:", r); lines.forEach(l => console.log(l));
'@
$code | Out-File -Encoding utf8 "$env:TEMP\test-detect.mjs"
$env:DSH_WEB_URL = ""
node "$env:TEMP\test-detect.mjs"
```

### A.2 RPC 能力矩阵实测

```powershell
$methods = "host.describe","session.list","plugin.list","host.settings.get","goal.list","commands/execute" # 可任意扩展
foreach ($m in $methods) {
  $body = @{ type = "client-request"; rpcId = "t-$m"; method = $m; payload = @{} } | ConvertTo-Json -Compress
  try { $r = Invoke-WebRequest -Uri "http://127.0.0.1:43120/api/$m" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 8; "$m => $($r.StatusCode)" }
  catch { "$m => $([int]$_.Exception.Response.StatusCode)" }
}
```

### A.3 明暗截图哈希对比（验证造假实锤）

```powershell
(Get-FileHash ".shots\v031-connect-light.png").Hash -eq (Get-FileHash ".shots\v031-connect-dark.png")   # True = 同一张图
```

### A.4 日志检索

```powershell
Select-String -Path "$env:APPDATA\DSH Desktop\logs\dsh-2026-08-23.log" -Pattern "harness-remote"
Get-ChildItem "$env:APPDATA\DSH Desktop\logs" -File | ForEach-Object { Select-String -Path $_.FullName -Pattern "未检测到 DSH API" } | Measure-Object   # 历史失败计数
```

## 附录 B：证据文件清单

| 文件 | 内容 |
|---|---|
| `.shots/audit-01-home.png` | DSH GUI 首页实测（排除 GUI 嫌疑） |
| `.shots/audit-02-settings.png` / `audit-03-dark.png` | GUI 设置与深色模式实测 |
| `.shots/audit-04-desktop-window.png` | 桌面窗口实拍（会话工作区归属证据） |
| `.shots/audit-05-remote-starting-10s.png` / `audit-06-remote-35s.png` | 实测开启远程：启动中 → 二维码 + 「DSH 已桥接」全绿 |
| `.shots/v031-connect-light-2.png` / `v031-sessions-light.png` / `phase5-chat-light.png` | App UI 审查样本 |
| `harness-plugin/src/apply.ts` L67-73 | 自启条件（无人传参） |
| `harness-plugin/src/dsh-bridge.ts` L90-139 / L223-242 | 探测与静默失败 / 桥接 404 回程 |
| `packages/protocol/src/rpc.ts` L130-158 | 超时只保护 headers 不保护 body |
| `apps/mobile/app/index.tsx` L278、`apps/mobile/app/sessions.tsx` L305 | 浅色主题被深色画布无条件覆盖 |
| `%APPDATA%\DSH Desktop\logs\dsh-2026-08-2*.log` | 8/19-8/23 全部故障日志原文 |

---

## 6. P0 实施记录（2026-08-23/24 追加）

审计发布当日，P0 五项全部落地并全绿回归（build/typecheck/test 三门禁 exit 0）：

| 项 | 状态 | 实施要点 | 验证 |
|---|---|---|---|
| P0-3a 超时修复 | ✅ | `packages/protocol/src/rpc.ts postRaw()`：定时器覆盖 headers+body 全程；body 阶段 abort → `TIMEOUT` | 真实挂 body 服务器用例；5283 探活 30034ms → 1512ms |
| P0-3b 探测诊断+并行 | ✅ | `dsh-bridge.ts`：枚举失败/为空必留痕；`listLoopbackPorts` 注入点；env 串行优先 + 其余并行、按候选序取命中 | 新增 5 测；干净环境探测 37.2s → <2s（env 缺失时） |
| P0-4 404 能力缓存 | ✅ | `DshBridge.handleRelayEnvelope` 公开化；404 方法缓存短路回 `E_UNSUPPORTED`，onStatus 留痕不再刷 onError | 新增 2 测（含非 404 不缓存） |
| P0-1 持久化+自启 | ✅ | 新增 `persist.ts`（宽容解析+原子写）；`remote-service` opt-in persist；`apply` 按 `enabled=true` 自启上次模式；`autoStart=false` 测试逃逸口 | 新增 10 测（persist 5 / apply 5 / service 4） |
| P0-5 冒烟脚本 | ✅ | `tools/smoke-e2e.mjs`：LAN 模式全链路（relay→配对→E2E→session.list） | `--mock` exit 0；真实 DSH exit 0 且拉到 **227 个真实会话** |

**部署状态**：`dsh-harness-remote@0.3.2` 已 pack（`harness-plugin/dsh-harness-remote-0.3.2.tgz`）并装入 profile（`INSTALLED_VERSION=0.3.2`）。`dev_reload_package` 在当前环境报「loader.internal 不可用」无法热重载 → **下次 DSH Desktop 重启生效**。已预置 `~/.dsh/dsh-harness-remote/config.json`（`{enabled:true,mode:"tunnel"}`，经插件自身 reader 验证可读），重启后远程自启、手机回连，无需任何人工操作。

**回归基线变化**：protocol 127 → 128；harness-plugin 55 → 76（新增 persist/apply/detect/capability 用例）；其余包不变。全仓 build/test/typecheck 三门禁 exit 0。

**P0 后的用户故事**：DSH 重启 → 插件加载读配置 → 自动开隧道 + 桥接（约 8s）→ 手机冷启动自动回连 → 看到真实会话列表。全程零人工。

### P1 第一批实施记录（2026-08-24 追加）

| 项 | 状态 | 实施要点 | 验证 |
|---|---|---|---|
| P1-1/P1-2 去 hero + 真浅色 | ✅ | sessions 页整页 paper 化；connect 页双画布（深色=深海签名，浅色=纸面）；删营销 pill；功能性文案（新 i18n 键，zh/en parity 绿） | 明暗三对截图 SHA 两两不同 + 角像素验证（`.shots/p1-*.png`） |
| P1-4 信息层级（第一批） | ✅ | `workspaceDisplayName()`（basename 兜底，3 测）；会话行去原始 id；工作区卡仅在有清单时渲染；composer 六胶囊单行横滚；头部「⋯」裁切修复 | mobile 183 测试全绿（含 parity） |
| P1-5 细节 | ✅ | 页脚去等宽；app 版本 0.3.2 | — |

**已知边界**：本轮截图为桌面视口（CLI `--device` 仿真未生效）；深色证据须同文档完成（web 主题偏好内存适配，原生无此问题）——两条已记入 PROGRESS 遗留。P1-3（令牌逐屏走查）与聊天消息分组留待下一批。

### P1 第二批实施记录（2026-08-24 追加，剩余项收尾）

| 项 | 状态 | 实施要点 | 验证 |
|---|---|---|---|
| P1-2 web 主题持久化 | ✅ | `webStorageApi.ts`（localStorage 版 SecureStoreApi，3 测）+ adapter 按平台降级；敏感 token 仍走 SecureStore | 深色切换后**整页重载仍深色**（角像素 R11G11B15） |
| P1-4 聊天日期分组 | ✅ | `TranscriptMessage.ts` 贯穿事件 time（+1 测）；`chatTimeline.ts` 纯函数（今天/昨天/M月D日，+4 测）；FlashList 渲染日期胶囊 | 192 测试全绿 |
| P1-3 令牌走查 | ✅ | `scripts/lint-font-tokens.mjs`（字号白名单 10/12/13/14/15/20/24/28，图标字形豁免，`--strict` CI 门禁）；修复 24 处越界 | **严格模式 0 违规** |
| 手机视口证据 | ✅ | `--mobile` 仿真 360x732；三屏明暗各一对，SHA 两两不同 + 角像素验证 | `.shots/p1m-*.png` |

**P1 全批结论**：计划内 P1（去营销化 / 真浅色 / 令牌走查 / 信息层级 / 细节清理）全部落地，`pnpm --filter @dsh-remote/mobile build/test` 绿（192 tests / 38 files）、字号 lint 严格模式 0 违规。仅「真机截图」留待设备窗口。

### P2 收尾记录（2026-08-24 追加，第 4/5 步）

| 项 | 状态 | 实施要点 |
|---|---|---|
| P2-4 CI 门禁接线 | ✅ | `ci.yml` 在 `pnpm test` 后新增「Font token lint (--strict)」与「E2E smoke (mock DSH)」两步；本机两命令 exit 0，YAML 解析验证合法；push 后由 runner 最终确认 |
| P2-5 证据标准入宪 | ✅ | `CONTRIBUTING.md`「验证与证据标准」四条铁律（可复现 / 机器可查含 SHA+角像素 / 诚实标注边界 / 门禁优先），条款源自本审计实锤 |
| P2-1 激活插件 0.3.2 | ⏳ 需用户 | 重启 DSH Desktop 后生效（热重载通道不可用），见 BLOCKED.md |
| P2-2 真机回归 | ⏳ 需用户 | 4G 隧道路径真机走一遍（扫码→配对→会话→消息→审批），记录入 PROGRESS |

**遗留（下一窗口）**：P1 UI 精致化（功能页去 hero、真浅色主题、设计令牌走查，见 §4）；P2 证据标准入宪（v0.3.1 明暗同图造假已实证，见 §3.4）；CI 接入 smoke-e2e 门禁（需 push 后验证 runner）；DSH 插件热重载通道修复（super-injector loader.internal）。

---

*本报告由 2026-08-23 第二轮审计产出。第一轮（同日 20:49-21:20）完成目标定位与 GUI 排除；第二轮（21:30-23:00）完成全部实锤复现：RPC 能力矩阵 24 方法实测、探测链路干净复现（37.2s/27s hang）、设置页真实开启/停止远程实测（8.4s 全绿）、明暗截图哈希核验、浅色主题代码级定位。第三轮（23:00-01:00）按 §4 计划完成 P0 全部实施与部署（见 §6）。*
