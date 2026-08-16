# dsh-remote M2 执行计划（跨端与安全：配对 token 鉴权 / 兼容矩阵回归 / 开源发布准备）

- 日期：2026-08-16
- 规格来源：`docs/superpowers/specs/2026-08-16-dsh-remote-mobile-design.md` §4（M2 加固）、§5（M2 验收）
- 依赖：M0/M1 已交付（140/140 测试；protocol Auth.token 已预留；SECURITY.md 已写配对围栏设计）
- 分支策略：main 直接推进；SDD：控制器实现 + 评审子代理把关

## Global Constraints

1. 不变式 1-5 沿用（宽容解码/HTTP 载体/WS 仅下行/loopback 特权/基线 rc.5）。
2. **不做 DSH 宿主源码修改**——只用 user patch 层与插件接缝（设计 §9）。
3. 配对 token 只存系统安全存储（Keychain/Keystore）；日志/持久化绝不落明文。
4. UI 遵循 UI-SYSTEM.md；token 输入/扫码页与连接页同风格。
5. 本机无 Mac/真机——EAS 配置交付 + 构建说明，实际云构建留用户执行。

## 任务列表

### M2-T1 — harness-plugin 配对插件（DSH 宿主侧）
- 内容：`harness-plugin/`——DSH 插件骨架（按 DSH 插件接缝：cordis.patch.yml 兼容格式 + 插件入口），功能：生成一次性配对 token（内存 + 过期时间，默认 15min）、校验请求 `Authorization: Bearer <token>`（或 `X-DSH-Pair-Token` 头）、未带/失效 token 对**非回环**请求返回 ok:false UNAUTHORIZED（配对围栏，替代纯信任围栏）；`--help`/README 说明安装方式（user patch 层）。
- 验收：插件逻辑（token 生成/校验/过期/回环豁免）纯函数可单测；vitest 绿；README 明确「插件 API 基于 DSH rc.5 文档，需真机验证后校准」。

### M2-T2 — protocol 配对支持（Auth.token 落地）
- 内容：`packages/protocol`——`LanTransport.connect` 把 `auth.token` 加到 RPC 请求头（fetch headers）与 WS 握手头（WebSocket 协议头/子协议？WS 原生不支持自定义头——改为 token 经 query 参数 `?token=` 或首帧？**决策**：WS 用 `?pairToken=` query（记录安全权衡），HTTP 用 `Authorization` 头）；`Auth` 类型已有 token 字段。
- 验收：单测断言请求头/URL 携带 token；无 token 时不带。

### M2-T3 — App 配对页 + 安全存储
- 内容：`apps/mobile`——连接页增补「配对 token」输入（或扫码：expo-camera 扫描 token QR，M2 内扫码为可选）；token 存 `expo-secure-store`（Keychain/Keystore）；连接时 `connect(host, port, token)`。
- 验收：secure-store 存取封装可单测（注入桩）；token 输入/保存/清除 UI；断连不清 token。

### M2-T4 — 兼容矩阵回归 + 安全文档校准
- 内容：mock-harness 支持带 token 请求（可选 fixture 元数据 `authRequired`）；COMPATIBILITY.md 更新配对围栏行为；SECURITY.md 校对 M2 章节与实现一致。
- 验收：文档与实现一致（评审核对）；mock-harness 配对场景测试绿。

### M2-T5 — EAS 构建配置 + 开源发布准备
- 内容：app.json EAS 字段校准（ios.bundleIdentifier/android.package 已有）；`eas.json`（build profiles: development/preview/production）；README 开源化（徽章、dsh-plugin 话题、贡献指南 CONTRIBUTING.md、CODE_OF_CONDUCT.md、SECURITY 政策链接）；`pnpm audit` 检查说明。
- 验收：eas.json 合法（schema 校验或 expo 识别）；CONTRIBUTING/COC 就位；README 完整。

## 验证顺序

1. `pnpm -r typecheck` + `pnpm -r test` 全仓
2. harness-plugin 单测绿；mock-harness 配对场景冒烟
3. `npx expo config` 合法
4. 增量提交 + 推送；M2 评审；发布前检查清单（SECURITY.md 列出的项）

## 风险

- DSH 插件 API 无本机真实 harness 可验证 → 插件按文档骨架交付，README 明示需真机校准；协议层配对是自洽契约（mock-harness 闭环测试）。
