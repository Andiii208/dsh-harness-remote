# dsh-remote — 手机远程连接 DeepSeek Harness

dsh-remote 是一个开源社区产品：用手机远程连接 DeepSeek Harness（DSH），离开电脑后也能盯住 agent、接收通知、一键审批、回答提问、继续对话。对标 Claude Code Remote Control 的定位，但面向 DSH 开源生态，代码与数据都留在用户本机，手机只是视口。

- **跨端**：React Native + Expo（TypeScript），iOS + Android 一套代码，EAS 云构建无需 Mac 即可出 iOS 包。
- **LAN 起步、传输可插拔**：MVP 直连局域网内的 DSH（`host:3080`），传输层抽象为 `Transport` 接口，中继/公网为预留演进方向，不平滑推翻重来。
- **协议对齐**：纯 TS 协议包（`packages/protocol`，零 RN 依赖）与 DSH 原生类型零失真对齐；宽容解码，线上层永不因未知数据崩溃。

## 仓库结构

```
dsh-remote/
├── apps/
│   └── mobile/            # Expo RN App（iOS + Android）— 实现中
│       ├── app/           # expo-router 页面：连接、会话列表、聊天、审批、通知
│       ├── src/
│       │   ├── transport/ # LAN Transport 实例化与状态管理
│       │   ├── data/      # SessionStore：会话镜像、折叠、投影派生
│       │   ├── notify/    # 通知分类器 → 本地通知 + 后台任务保活
│       │   └── ui/        # DSH 设计令牌主题、组件、屏幕
│       └── app.json       # EAS 配置（云构建）
├── packages/
│   └── protocol/          # TS 协议核心（纯 JS，无 RN 依赖）— 实现中
│       ├── src/
│       │   ├── envelopes.ts      # client-request / server-response / server-request / client-response
│       │   ├── codec.ts          # lenient 解码：未知 key/类型降级 Unknown*
│       │   ├── rpc.ts            # RpcClient（unary + respond + typert 网关）
│       │   ├── ws.ts             # WsDownlink（仅下行双流）
│       │   ├── loop.ts           # ConnectionLoop（握手、退避、重同步）
│       │   ├── transport.ts      # Transport 接口（LAN 实现 + 中继预留插槽）
│       │   └── dto/              # DSH schemas 的 TS 移植（对齐 api/remotes 类型）
│       └── test/
├── mock-harness/          # TS 实现 /api + WS 的测试桩 — 实现中
├── tools/
│   └── capture/           # 录制真实 DSH 流量 → conformance fixtures — 实现中
├── harness-plugin/        # （预留）dsh-remote 宿主插件：配对 token / 鉴权 / 中继客户端
├── relay/                 # （预留）中继服务器
├── docs/
│   ├── ARCHITECTURE.md    # M0 后补
│   ├── PROTOCOL.md        # M0 后补
│   ├── COMPATIBILITY.md   # 协议版本矩阵 — M0 后补
│   └── SECURITY.md        # M0 后补
└── package.json / pnpm-workspace.yaml / tsconfig 等
```

## 快速开始

```bash
pnpm install
pnpm test
pnpm typecheck

# 起 mock-harness（无需真实 DSH 即可联调）
pnpm --filter mock-harness build
node mock-harness/dist/cli.js --port 3080

# 录制真实 DSH 流量 → conformance fixtures（需要可达的 DSH）
pnpm --filter @dsh-remote/capture build
node tools/capture/dist/cli.js record --host 127.0.0.1 --port 3080 --out ./fixtures
```

## 文档

- 设计文档（v0，已确认）：[docs/superpowers/specs/2026-08-16-dsh-remote-mobile-design.md](docs/superpowers/specs/2026-08-16-dsh-remote-mobile-design.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 架构与数据流
- [docs/PROTOCOL.md](docs/PROTOCOL.md) — 协议参考（信封/端点/WS/连接生命周期）
- [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) — 协议版本矩阵与 fixtures 回归流程
- [docs/SECURITY.md](docs/SECURITY.md) — 安全模型（MVP LAN → M2 配对 → M3 中继）
- [docs/design/UI-SYSTEM.md](docs/design/UI-SYSTEM.md) — App UI 设计系统（暗色终端质感）
- [docs/design/BRAND.md](docs/design/BRAND.md) — 品牌与 App 图标（DeepSeek 黑色鲸鱼）

## 致谢

协议研究与 mock 方法论参考 [sorsama/deepseek-harness-mobile](https://github.com/sorsama/deepseek-harness-mobile)，保持协议兼容。
