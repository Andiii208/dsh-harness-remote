# 兼容性（COMPATIBILITY）

## 协议基线

当前基线：**DSH harness `0.1.0-rc.5`**。协议以 `packages/protocol` 为唯一事实源；每次适配新 DSH 版本走 **conformance fixtures 回归**。

## 版本矩阵

| DSH 版本 | 适配状态 | fixtures 回归 | 备注 |
|---|---|---|---|
| `0.1.0-rc.5` | ✅ 基线 | ✅（mock-harness 内置 5 组样例 + capture 录制路径） | 当前锁定 |
| 后续版本 | ⏳ 待录制 | — | 见下方流程 |

## 配对围栏（M2）

- `mock-harness` 支持 `pairToken` 配置模拟配对围栏：HTTP 要求 `Authorization: Bearer <token>`（或 `X-DSH-Pair-Token`），WS 要求 `?pairToken=` query；未匹配 → `ok:false UNAUTHORIZED` / 拒绝升级。
- `harness-plugin` 提供真实宿主侧实现（token 签发/校验/过期/回环豁免），插件接缝待真机校准。
- 协议层：`LanTransport` 在 `auth.token` 存在时自动携带（HTTP 头 + WS query）。

## fixtures 工作流

1. **录制**：`tools/capture`（`dsh-capture record --host … --port 3080 --out ./fixtures --duration 30`）连真实 DSH，采集 unary 响应 + 双流 WS 帧。
2. **校验入库**：`dsh-capture validate ./fixtures`（宽容校验：未知字段忽略、类型错误报告）。
3. **回放**：`mock-harness` 按 fixtures 提供 `/api` + WS；App / protocol 测试与联调全部走它，不依赖真实 harness。
4. **协议漂移 diff**：升级 DSH 后重录 → 对比新旧 fixtures 的字段/帧类型 → 更新本矩阵与 `PROTOCOL.md`。

## 宽容解码如何吸收演进

- 未知 envelope/frame 类型 → `Unknown*` 透传，线上层不崩溃。
- 未知 key 忽略；未知 error code → `UnknownError`（`details.originalCode` 保留原始值）。
- DTO 全可选字段 + `raw` 透传：新字段自动可见。

## 录制注意事项

- 仅可信网络（LAN 直连无鉴权）；录制内容含真实提示词/命令，入库前脱敏检查。
- `record` 需要可达的 DSH（默认 127.0.0.1:3080）。
