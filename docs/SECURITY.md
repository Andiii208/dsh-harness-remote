# 安全（SECURITY）

## 威胁模型与阶段

| 阶段 | 暴露面 | 措施 |
|---|---|---|
| MVP（LAN） | 手机与 DSH 同一可信局域网直连 `host:3080` | 官方 user patch 层开 `0.0.0.0:3080`（`<harness-home>/profiles/web/cordis.patch.yml` restate webserver）；沿用 **信任围栏**；文档强制"仅可信网络"；**特权功能只读 + 横幅**；连接页明示安全警告 |
| M2 加固 | 同上 + 公网预告 | `harness-plugin` 配对：宿主生成一次性配对 token，App 扫码/手输，请求带 token 头，插件校验；信任围栏 → **配对围栏** |
| M3 中继（预留） | 任意网络 | 同一插件做设备配对 + E2E 加密出站连接；短时凭证；APNs/FCM 真推送 |

## MVP 信任围栏（DSH 侧，官方行为）

- `/api` Host 头必须是回环或受信地址；自动信任自身 LAN IP 字面量；主机名需 `--trusted-host`。
- 特权功能（设置、凭据、宿主目录选择器、agent-preset 编写）默认 **loopback-only**；网络连接时只读 + 横幅。

## App 侧原则

- 配对 token（M2）只存系统安全存储（Keychain/Keystore，经 `expo-secure-store`）；日志/持久化绝不落明文；连接页提供清除入口。
- 不实现/存储任何凭据（MVP 无鉴权；M2 配对 token 如上）。
- 连接页必须展示安全警告：*"LAN 直连，无鉴权——请仅在可信网络使用"*。
- 渲染会话内容视为不可信输入：长度限制、纯文本渲染、不执行任何内容。

## 协议层安全属性

- `makeRpcId` 仅用于相关性关联，**非认证**。
- WS 仅下行；客户端不发送任何数据（1008 断连），减少注入面。
- 宽容解码杜绝"未知数据导致崩溃"的可用性攻击面。
- **配对 token 传输**：HTTP 走 `Authorization: Bearer` 头；WS 握手不支持自定义头，用 `?pairToken=` query 携带——注意 URL 可能进入代理/访问日志，属已知权衡：token 为短期凭证（15min 过期）+ 单 token 轮换，泄露面有限；M3 中继升级为 E2E 加密握手后移除。token 绝不写入应用日志。

## 报告漏洞

- 私密披露：给维护者发邮件（README 维护者邮箱）；或 GitHub 私有 Security Advisory。
- 公开前 90 天协调披露期。

## 发布检查清单（M2 开源发布前）

- [ ] 无 token 连接被拒（配对围栏生效）
- [ ] 凭证仅存系统安全存储
- [ ] 依赖审计（`pnpm audit`）无已知高危
- [ ] 本文件 + COMPATIBILITY.md 与实现一致
