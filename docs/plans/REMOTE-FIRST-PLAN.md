# harness remote 后续规划 v3：远程优先 · 插件化 · 设置迁移

> 制定日期：2026-08-18。基线：main `2c268f6`，工作区干净。
> 全仓绿：protocol 100 / mobile 109 / harness-plugin 23 / relay 31 / mock-harness 29 / capture 24。
> 原则：远程优先、极致简洁、能力可探测、插件可扩展；协议只做加法；每阶段 ≥1 条 conventional commit；卡住写 BLOCKED.md 继续。

---

## 0. 背景与目标

用户最高频需求是把「电脑变成服务器」的中继远程连接，而不是同一 WiFi 下的局域网连接。本规划把 **relay 远程模式设为 App 默认入口**，局域网模式降为切换选项；同时把 DSH「万物皆插件」的理念映射到手机端，并把 DSH 上常用设置迁移到 App。

目标：
- 打开 App 直入远程连接，像 DeepSeek App 一样只有模式横幅 + 模式选项 + 少量表单。
- 电脑端插件对小白做到「一键开启远程访问，看到 6 位码」，不暴露 relay 启动、端口、反代等概念。
- 用户自有 DSH 插件的能力（特殊指令/设置项）能在手机端被发现和操作。
- 常用 DSH 设置（模型、思考强度、上下文容量、权限状态等）在 App 内可看可设，读不到时自动隐藏。

---

## 1. 产品原则

1. **远程优先**：默认模式 = 远程；LAN 是显式切换项。
2. **极简**：单屏只保留「模式横幅 + 模式切换 + 当前模式需要的表单 + 主按钮」；次要功能全部降级。
3. **能力可探测**：App 展示的设置与插件能力全部来自宿主回传，不硬编码 DSH 能力假设；读不到就隐藏，不报错。
4. **插件友好**：用户自有插件通过统一契约暴露给 App，App 不关心插件实现细节。
5. **小白优先**：电脑端只面向「开启远程访问」和「关闭远程访问」两个动作，内部复杂度全部封装。
6. **动效克制且丝滑**：只保留模式切换、列表进入、发送按钮、滚动到底等必要过渡；时长 160–240ms，使用系统动效曲线，尊重「减弱动态」。

---

## 2. 现状盘点（已具备，不重做）

- `packages/protocol`：RelayTransport、relay 信封、E2E 加密（ECDH P-256 + HKDF + AES-256-GCM）、RelayTransport 自动 keypair、pairCode 流程。
- `relay/`：WS 控制面、短时凭证、速率限制、审计日志、离线队列、可选 SQLite store。
- `harness-plugin`：RelayClient（console 侧）、onPaired、自动 keypair、加密数据面；LAN 配对 token。
- `apps/mobile`：Relay/LAN 双模式连接、relayDeviceStore 密钥持久化、精简版 UI。
- 联调：`.shots/relay-pair-integration.mjs` 已跑通 relay + mock-harness + console 桥。

---

## 3. Phase R1：App 首屏改为「远程优先」模式选择

**文件**：`apps/mobile/app/index.tsx`、`apps/mobile/src/transport/relayMode.ts`、相关测试。

**交互设计（学 DeepSeek 手机版）**

```
┌──────────────────────────────────┐
│        🐋 harness remote          │
│  ┌────────────────────────────┐  │
│  │  使用远程模式连接            │  │  ← 横幅文案随模式切换
│  │  通过你自己的中继服务器…     │  │
│  └────────────────────────────┘  │
│  [ 远程模式 ]  [ 局域网模式 ]      │  ← 分段选择
│  ┌────────────────────────────┐  │
│  │ relay 地址                 │  │  ← 远程模式：地址 + 配对码
│  │ 配对码 · 可选              │  │
│  └────────────────────────────┘  │
│        [ 连接 ]                   │
└──────────────────────────────────┘
```

- 默认 `mode = "remote"`。
- 远程模式：relay 地址（可只填 `relay.example.com`，App 自动补 `ws://…:4090`）+ 配对码（可选）。
- 局域网模式：主机 + 端口 + 配对 token（token 收进「高级」）。
- 切换模式时横幅文案、表单、默认端口（远程 4090 / LAN 3080）一起变。
- 历史主机、自动发现、扫码配对继续保留为次级入口，不占首屏。

**动效与小组件**
- 模式切换：横幅文案与表单用 180ms 淡入淡出 + 轻微上移，不放大缩小。
- 主按钮：按下 scale 0.98 + opacity 0.85，松手回弹；连接中显示轻量 loading。
- 新建对话 / 发送消息 / 返回等小组件直接对标 DeepSeek App：圆形按钮、细线条、无描边堆叠。
- 列表进入：消息行 200ms 轻微上浮，滚动时不重复触发。

**验收**
- mobile 测试不降；新增 `relayMode.toRemoteWsUrl` 单测（补 ws://、保留 relay://、默认 4090）。
- Android 真机：默认进入远程模式，切换 LAN 正常，连接 mock-harness 正常。

---

## 4. Phase R2：用户插件能力面（万物皆插件 → App 端）

DSH 插件不同用户不一样，手机端不能写死。方案：**能力清单协议 + App 动态渲染**。

### 4.1 协议新增（加法，不改旧行为）

```ts
// 插件命令：出现在会话长按菜单 / 插件页
interface PluginCommand {
  id: string;            // 稳定 id，如 "my-plugin.commit"
  pluginId: string;
  title: string;         // 中文/英文短名
  description?: string;
  args?: PluginArg[];    // 参数 schema
  risk?: "read" | "write" | "approve";  // 权限等级
}

// 插件设置项：App 设置页动态表单
interface PluginSetting {
  key: string;
  title: string;
  type: "switch" | "select" | "text" | "number";
  options?: string[];
  value: unknown;
}
```

- RPC：`plugin.list` → `{ plugins, commands, settings }`。
- RPC：`plugin.exec` → `{ rpcId, commandId, args }`，返回宿主执行结果；`risk=approve` 的命令走既有审批流。

### 4.2 harness-plugin 侧（参考实现）

- 插件启动时扫描 DSH 插件注册表（宿主接缝允许时），没有宿主能力时先读本地 manifest 目录/默认清单。
- 暴露 HTTP `/api/plugin.list` 与 `/api/plugin.exec`（与 DSH 中间件同构）。
- mock-harness 增加对应 fixtures，App 先对桩联调。

### 4.3 App 侧 UI（克制）

- 会话页长按消息 → 菜单增加「插件指令」。
- 设置页底部一个「插件」入口，进入插件列表；每个插件可展开命令与设置。
- 单屏不堆组件：插件默认只显示名称 + 摘要，点进去才是命令/设置。

**验收**
- protocol 新类型 + 构造器单测。
- harness-plugin `plugin.list` 测试。
- mobile 对 mock-harness 插件 fixtures 渲染插件页。

---

## 5. Phase R3：DSH 设置迁移到 App

App 设置页从「连接设置」扩展为「连接 + 模型与权限 + 插件」三级。

### 5.1 设置项（能力可探测）

| 组 | 设置项 | 说明 |
|---|---|---|
| 连接 | 远程/LAN 模式、自动重连、本地通知 | 已有，迁移到新设置页 |
| 模型 | 模型选择、思考强度 | 读 `host.settings.get`；宿主不支持则隐藏 |
| 状态 | 上下文容量（当前/上限） | 显示为细进度条，不占主视觉 |
| 权限 | 审批权限状态（只读/需审批） | 读宿主权限描述，只读展示 + 可跳转审批历史 |
| 显示 | 字体大小（小/标准/大） | App 本地设置，影响聊天正文与列表正文，不缩放 UI 框架 |
| 关于 | 检查更新、版本号、GitHub | 检查更新走 GitHub Releases 最新版对比，有新版给入口，无新版轻提示 |

### 5.2 协议新增

- `host.settings.get` → `{ model, models[], thinking, contextPercent, contextLimit, permissions }`。
- `host.settings.set`（可选；宿主不支持时 App 只读）。
- 兼容：DSH 当前没有这些方法时，App 静默隐藏，不报错。

**验收**
- protocol 类型 + mock-harness fixtures。
- mobile 设置页对 fixtures 显示模型/思考强度/上下文/权限；缺字段时优雅隐藏。

---

## 6. Phase R4：面向小白的电脑端远程插件

### 6.1 设计目标

小白只做两件事：**开启远程访问**、**关闭远程访问**。relay 启动、端口、TLS、反代全部封装。

### 6.2 形态（二选一，优先 CLI）

- 终端命令（推荐先做）：
  ```bash
  dsh-remote remote
  ```
  运行后自动：
  1. 若本机未检测到 relay，则用插件内置 relay 在 4090 后台启动；
  2. 连接 relay 并注册 console；
  3. 通过 `relay.pair.code` 获取 6 位配对码；
  4. 打印小白卡片：
  ```
  ┌─────────────────────────────────┐
  │  harness remote 远程模式已开启    │
  │  relay:  ws://127.0.0.1:4090     │
  │  配对码: 483920  (10 分钟有效)    │
  │  手机打开 App 输入以上地址和码    │
  └─────────────────────────────────┘
  ```
  5. 手机配对成功后打印 `已配对 device-xxxx`。
  6. Ctrl+C 关闭远程访问（自动清理）。

- 后续可选：DSH 宿主 UI 面板按钮「开启远程访问」，与终端命令等价。

### 6.3 配套协议

- 新增 `relay.pair.code` / `relay.pair.code.ack`（console 向 relay 要码），不暴露 relay store 内部实现。
- relay server 处理 + 测试（未认证拒绝、console 成功取码、码一次性）。

**验收**
- `.shots/relay-pair-integration.mjs` 改为用 `relay.pair.code` 要码，端到端跑通。
- 一个命令开启远程、手机配对成功、Ctrl+C 关闭后手机断线。

---

## 7. Phase R5：验证、文档与 CI 纪律

- Android 真机（MXW-AN00 已连）验证 R1/R4 全流程。
- Web 截图 + 真机截图存 `.shots/`，README `docs/screenshots` 同步。
- 全仓 `pnpm -r build && pnpm -r typecheck && pnpm -r test` 全绿后才 push。
- 更新 `RELAY-M3.md`、`MANUAL.md`、`PROGRESS.md`、`SECURITY.md`。
- CI 有限：本地先全绿，每个 push 只带一个逻辑阶段，避免触发失败。

---

## 8. 执行顺序与并行策略

| 阶段 | 依赖 | 执行 |
|---|---|---|
| R1 远程优先首屏 | 无 | 可并行 |
| R5a `relay.pair.code` 协议+服务端 | 无 | 可并行 |
| R2 插件能力面 | R5a（协议规范统一） | R1 后 |
| R3 设置迁移 | R5a | R2 后 |
| R4 小白远程插件 | R5a | R5a 后 |
| R5b 真机+文档+CI | 全部 | captain 集成 |

- captain 用 `deepseek-v4-pro-0813`，子代理用 `deepseek-v4-flash-0731`。
- 每阶段验收不降：相关包 build/typecheck/test 全绿 + 截图/真机证据。

---

## 9. 风险与开放问题

1. **DSH 插件注册表接缝**：真实 DSH 插件 API 未完全公开。对策：先定义 dsh-remote 插件契约 + mock-harness 桩；宿主 API 明确后只改 harness-plugin 适配层。
2. **设置 RPC 兼容性**：DSH 可能暂无 `host.settings.*`。对策：App 能力可探测，读不到隐藏，不影响连接主流程。
3. **小白自动启动 relay**：内置 relay 进程管理与端口冲突需处理。对策：4090 被占时自动选空闲端口并打印实际地址。
4. **CI 次数有限**：严格本地全绿后 push，每阶段一个 push。

## 9.1 开放问题结论：dsh-remote 自身不做插件宿主

- 用户问「dsh-remote 是否也能插入插件让用户 DIY」：**本轮不纳入**。
- 理由：DSH 已经是插件系统，「万物皆插件」的宿主在电脑端 DSH；dsh-remote 定位是手机视口与远程控制面。让 App 再成为插件宿主会引入安全边界、热加载、权限模型等高复杂度，收益有限。
- 替代方案已写入 R2：App 通过 `plugin.list / plugin.exec` 动态呈现用户在 DSH 上安装的插件能力，让用户 DIY 的插件间接在手机上可用。

---

## 10. 本规划文档状态

- 本文件为后续窗口执行依据；开始执行后按阶段回填完成状态与提交号。
