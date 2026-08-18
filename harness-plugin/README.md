# dsh-harness-remote — DSH 电脑端插件（手机远程）

把 DeepSeek Harness 装进手机：DSH 设置页一键开启手机远程，公网模式走 cloudflared 免费隧道（无需账号/服务器/公网 IP），手机 App 扫码即连，人在外面也能看会话、发消息、审批。

## 安装（官方标准路径）

```bash
dsh plugin --profile web add dsh-harness-remote -w
```

然后重启 `dsh web`：

```bash
npx @deepseek-ai/dsh web
```

打开 DSH 设置页，左侧会出现 **「手机远程」** 入口：点「开启公网访问」→ 页面显示二维码 + 6 位配对码 → 手机 App 扫码即连。

> 手动安装（仅旧版本兼容）：`pnpm --filter dsh-harness-remote build` 后，把本包按 DSH bundle 插件约定声明到 `<harness-home>/profiles/<profile>/cordis.patch.yml`。

## 模式

| 模式 | 说明 |
|---|---|
| 公网（默认） | 插件自动启动内置 relay（仅回环）→ 注册 console → cloudflared quick tunnel 暴露 `wss://xxx.trycloudflare.com` → 6 位配对码 + 二维码。任何网络可用；地址每次重启自动换新。 |
| 局域网 | 同 Wi-Fi 直连；仅调试/兜底使用，App 里藏在「更多连接方式」。 |
| CLI 后备 | `dsh-remote remote`（开发调试用，不依赖 DSH Web 设置页）。 |

## 安全边界

- 公网入口 URL 随机且重启轮换；真正门禁是 relay 的 **6 位配对码（一次性）+ 失败锁定 + E2E 加密数据面**。
- 设置页 RPC 仅 loopback 可调（`authority: "loopback"`），配对码/公网地址只在电脑本地可读。
- relay 只转发 `{to, ciphertext, nonce}`，不接触 DSH 明文。
- 日志绝不输出配对码。

## 组件

- `src/apply.ts` — DSH bundle 插件入口：加载即自动开启远程，注册 RPC，卸载清理。
- `src/remote-service.ts` — 远程访问服务（状态快照 + 启停 + QR data URL）。
- `src/web-rpc.ts` — 设置页 loopback RPC（`status/start/stop`）。
- `src/remote-access.ts` — 可复用核心：relay + console + 6 位码 + DSH 桥接 + 公网/局域网地址。
- `src/tunnel.ts` — cloudflared 二进制查找/下载/隧道启停/URL 解析。
- `client/` — 设置页「手机远程」面板（esbuild 打包，DSH ModuleLoader 加载）。
- `src/token.ts` / `src/gate.ts` / `src/plugin.ts` — M2 配对围栏组件（保留）。

## 开发

```bash
pnpm --filter dsh-harness-remote build     # tsc + esbuild（lib/client/cli）
pnpm --filter dsh-harness-remote test
pnpm --filter dsh-harness-remote typecheck
```
