# @dsh-remote/capture — DSH 流量录制工具

把真实 DSH（`0.1.0-rc.5` 基线）的流量录制为 **conformance fixtures**，供 `mock-harness` 回放与协议漂移回归。

## 用法

```bash
# 录制 15 秒（默认探针 host.describe）
pnpm --filter @dsh-remote/capture build
node tools/capture/dist/cli.js record --host 127.0.0.1 --port 3080 --out ./fixtures --duration 15

# 校验 fixture
node tools/capture/dist/cli.js validate ./fixtures
```

## Fixture 格式（v1）

```jsonc
{
  "meta": {
    "baselineVersion": "0.1.0-rc.5",
    "recordedAt": "2026-08-16T…Z",
    "source": { "host": "127.0.0.1", "port": 3080 },
    "describe": { "name": "dsh", "version": "0.1.0-rc.5" }
  },
  "unaryResponses": [
    { "method": "host.describe", "response": { "ok": true, "result": { … } } }
  ],
  "wsFrames": [
    { "stream": "mux", "frame": { "type": "session/event", … } },
    { "stream": "host", "frame": { "type": "session/registry", … } }
  ],
  "scenarios": [ { "id": "drop", "disconnectAfter": 5 } ]
}
```

校验为宽容模式：未知字段忽略，类型错误收集为错误（不抛异常）。

## 约束

- 零运行时依赖（Node ≥22 原生 fetch / WebSocket）。
- `record` 需要可达的 DSH（`--host 127.0.0.1 --port 3080`）；不可达时清晰报错退出码 1。
- 录制真实流量前请确认网络环境可信（LAN 直连无鉴权）。
