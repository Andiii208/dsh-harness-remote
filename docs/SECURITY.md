# 安全（SECURITY）

## 威胁模型与阶段

| 阶段 | 暴露面 | 措施 |
|---|---|---|
| MVP（LAN） | 手机与 DSH 同一可信局域网直连 `host:3080` | 官方 user patch 层开 `0.0.0.0:3080`（`<harness-home>/profiles/web/cordis.patch.yml` restate webserver）；沿用 **信任围栏**；文档强制"仅可信网络"；**特权功能只读 + 横幅**；连接页明示安全警告 |
| M2 加固 | 同上 + 公网预告 | `harness-plugin` 配对：宿主生成一次性配对 token，App 扫码/手输，请求带 token 头，插件校验；信任围栏 → **配对围栏** |
| M3 中继（配对闭环已实现） | 任意网络 | 同一插件做设备配对 + E2E 加密出站连接；短时凭证；APNs/FCM 真推送 |

## MVP 信任围栏（DSH 侧，官方行为）

- `/api` Host 头必须是回环或受信地址；自动信任自身 LAN IP 字面量；主机名需 `--trusted-host`。
- 特权功能（设置、凭据、宿主目录选择器、agent-preset 编写）默认 **loopback-only**；网络连接时只读 + 横幅。

## App 侧原则

- 配对 token（M2）只存系统安全存储（Keychain/Keystore，经 `expo-secure-store`）；日志/持久化绝不落明文；连接页提供清除入口。
- 不实现/存储任何凭据（MVP 无鉴权；M2 配对 token 如上）。
- 连接页必须展示安全警告：*"LAN 直连，无鉴权——请仅在可信网络使用"*。
- 渲染会话内容视为不可信输入：长度限制、纯文本渲染、不执行任何内容。

## 公网隧道安全默认（2026-08-22 已实现）

- 插件**默认不自动开启公网隧道**：`apply.ts` 仅在显式 `autoStart: true`（或测试注入）时随插件加载自动启动。
- 用户需在 DSH 设置页「手机远程」手动点击「开启公网访问」或「仅局域网」；关闭后立即释放 relay/tunnel/console/DSH 桥接。
- CLI `dsh-remote remote` 仍为显式开启路径（用户主动运行命令，不属于自动开隧道）。

## 协议层安全属性

- `makeRpcId` 仅用于相关性关联，**非认证**。
- WS 仅下行；客户端不发送任何数据（1008 断连），减少注入面。
- 宽容解码杜绝"未知数据导致崩溃"的可用性攻击面。
- **配对 token 传输**：HTTP 走 `Authorization: Bearer` 头；WS 握手不支持自定义头，用 `?pairToken=` query 携带——注意 URL 可能进入代理/访问日志，属已知权衡：token 为短期凭证（15min 过期）+ 单 token 轮换，泄露面有限；M3 中继升级为 E2E 加密握手后移除。token 绝不写入应用日志。

## M3 中继配对闭环（2026-08-17 已实现）

- 数据面采用 ECDH(P-256) + HKDF-SHA256 派生 AES-256-GCM 会话密钥；每方向独立密钥（`packages/protocol/src/relay-crypto.ts`）。
- `relay.route` 的 payload 对 relay 只暴露 `{ to, ciphertext, nonce }`；relay 服务端只读 `to`，不解析、不记录 ciphertext/nonce，日志仅 `type/from/to/ts`。
- 密文被篡改或 nonce 重放时 `openRelayPayload` 校验失败拒绝（GCM 认证），单测覆盖（`relay-crypto.test.ts`）。
- 短时凭证与配对码均为一次性/TTL 限制；私钥不出设备（App/插件各自持有）。
- M3.5 配对闭环：手机输入 relay URL + 6 位配对码即完成 ECDH 公钥交换与会话密钥派生；`relay.pair` 成功会向被配对 console 推送对端公钥（在线直投/离线入队），双方据此启用加密数据面。
- M3.5 密钥持久化：mobile 的 relay deviceId 与 ECDH 私钥经 `expo-secure-store` 持久化（Web 回退 localStorage，不可用降级内存不崩溃）；console 侧私钥由 harness-plugin 进程内生成/注入持有。

## M3 中继配对加固（P2b，2026-08-18 已实现）

- `relay.pair` 未认证/已认证配对尝试都受**失败锁定**保护：默认连续 10 次失败锁定 60s（`maxPairAttempts` / `pairLockMs` 可配），锁定后返回 `E_RATE`，防止爆破 6 位码。
- 单 console 同时持有的**未使用配对码数量**默认上限 5（`maxPairingCodesPerConsole`），超出后 `relay.pair.code` 返回 `E_RATE`。
- 审计日志新增 `pair_fail` / `pair_lock` / `pair_code_limit` 事件，仍只含 `event/from/to/ts/ok` 元数据，不含 payload/明文。

## 报告漏洞

- 私密披露：给维护者发邮件（README 维护者邮箱）；或 GitHub 私有 Security Advisory。
- 公开前 90 天协调披露期。

## 发布检查清单（M2 开源发布前）

- [x] 无 token 连接被拒（配对围栏生效）——mock-harness 配对测试（pairing.test.ts / gate.test.ts）覆盖；真机端到端待 development build
- [x] 凭证仅存系统安全存储——tokenStore 经 expo-secure-store（Keychain/Keystore），日志不落明文
- [x] 依赖审计（`pnpm audit --prod`）——仅 3 个构建期传递漏洞（uuid/image-size，moderate，非运行时，expo 工具链）
- [x] 本文件 + COMPATIBILITY.md 与实现一致——2026-08-16 真机联调轮已校准
