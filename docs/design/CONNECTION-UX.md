# dsh-remote 连接体验设计（P2）

目标：把「手动输入 IP:端口 + 配对 token + adb reverse / Expo Go / 局域网概念」降到
普通用户可用的程度——**首启 3 步引导，之后一键连接**。本文档是选型与契约说明；
UI 落地遵循 docs/design/UI-SYSTEM.md v2。

## 1. 问题

- 手动输入 LAN IP 与端口：记地址、打错重来，门槛高。
- 配对 token 手工粘贴：字符串长、易错。
- adb reverse / Expo Go / 局域网概念：对非开发者不友好。
- 无记忆：每次冷启动都要重新输入。

## 2. 方案对比

| 方案 | 用户操作 | 需要原生依赖 | Expo Go 可用 | 评价 |
|---|---|---|---|---|
| mDNS/Bonjour 自动发现 | 0（自动列出） | 是（react-native-zeroconf） | 否 | 最顺滑，但需 dev build，且部分路由器/AP 隔离 mDNS |
| 子网 TCP 探测（fetch 探活） | 0（自动列出） | 否 | 是 | 用设备 IP 推断 /24，GET /api/host.describe 探活；Expo Go 可用，实现简单 |
| 二维码配对 | 1（扫码） | expo-camera（Expo Go 内置支持） | 是 | 零输入、token 随 URL 传递，主推路径 |
| 最近主机 + 自动重连 | 0（点击/自动） | 否 | 是 | 记忆与低摩擦的兜底 |
| 首启引导 | 1 次（看完） | 否 | 是 | 把「插件 + 扫码」概念一次讲清 |

## 3. 选型（可组合，按优先级）

1. **二维码配对（主路径）**：harness-plugin 签发一次性配对 token（15 分钟过期）并
   生成配对 URL；宿主终端打印 QR；App 扫码 → 解析 URL → 自动填入 host/port/token
   → 一键连接。
   - 配对 URL 格式（契约，见 PROTOCOL.md）：
     `dshremote://pair?host=<host>&port=<port>&token=<token>`
   - App 同时支持深链打开同一 URL（如从邮件/剪贴板粘贴）。
2. **自动发现（次路径）**：App 通过 expo-network 取本机 IP，推断 /24 候选，
   并发 GET `/api/host.describe` 探活，列出可用 DSH 实例（名称 + 版本 + 地址）。
   - Transport 层提供 `probeHost()` 纯函数（可注入 fetch，可单测）；
   - mDNS/Bonjour 列为 dev build 增强（react-native-zeroconf 接入点已预留
     `DiscoverySource` 接口），Expo Go 下退化为子网探测。
3. **最近主机 + 自动重连**：连接成功后把 `{host, port, name, lastConnectedAt}`
   写入 SecureStore（上限 5 条）；连接页一键重连；冷启动自动连最近主机（可在设置
   关闭——v2 先保留开关位，UI 后置）。
4. **首启引导**：3 步图文（这是远程控制 App → 在电脑上装插件 → 扫码或自动发现），
   一次看完后不再出现。

## 4. 安全边界

- 配对 token：一次性、15 分钟 TTL；QR 只显示在宿主侧，App 扫码后即连接；
  深链/剪贴板路径同样受 TTL 限制。
- 子网探测只读 `host.describe`（不携带凭据），不会触发配对围栏。
- LAN 直连仍建议仅可信网络；未配对时无鉴权（沿用现状提示）。
- QR 里的 token 会出现在屏幕/相册截图中——文档注明风险与 TTL 缓解。

## 5. 契约改动清单（协议先行，mock 定契约）

1. `@dsh-remote/protocol`：`discovery.ts` 提供
   `probeHost()` / `buildPairPayload()` / `parsePairPayload()`（纯函数 + 单测）。
2. mock-harness：`GET /api/pairing/qr` 返回 `{ url }`（仅配置 pairToken 时启用），
   模拟宿主侧生成二维码；fixtures 校验走 capture 规则。
3. App：hostStore（SecureStore 持久化）、discover（子网探测）、扫描页、引导页、
   深链处理。
4. 文档同步：PROTOCOL.md / COMPATIBILITY.md / MANUAL.md。
