#!/usr/bin/env node
/**
 * dsh-remote remote — 面向小白的一键远程（R4）。
 *
 * 自动：启动内置 relay（4090，被占用时自动选空闲端口）→ 注册 console →
 * 取一次性 6 位配对码 → 打印小白卡片 → 手机配对成功提示 → Ctrl+C 关闭。
 */

import { networkInterfaces } from "node:os";
import { pathToFileURL } from "node:url";
import { createRelayServer } from "relay";
import qrcode from "qrcode-terminal";
import { buildRemotePairPayload } from "@dsh-remote/protocol";
import { RelayClient } from "./relay-client.js";

const HELP = `dsh-remote — DeepSeek Harness 手机视口（电脑端插件）

Usage:
  dsh-remote remote    一键开启远程访问（启动 relay + 生成 6 位配对码）
  dsh-remote --help    显示帮助
`;

function lanIp(): string | undefined {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return undefined;
}

function card(relayHost: string, code: string, via: "lan" | "loopback"): string {
  const line = "─".repeat(36);
  return [
    "",
    `┌${line}┐`,
    `│  ✅ 远程连接已开启                    │`,
    `│  地址：  ${relayHost.padEnd(26)}│`,
    `│  6 位码： ${code.padEnd(29)}│`,
    `│  手机打开 App 扫下面的二维码          │`,
    `│  或选择「远程连接」手动输入            │`,
    `└${line}┘`,
    via === "loopback" ? "⚠ 未检测到局域网 IP，请在同一电脑上的模拟器/浏览器使用" : "",
  ].filter(Boolean).join("\n");
}

async function main(argv: string[]): Promise<number> {
  if (argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
    console.log(HELP);
    return 0;
  }
  if (argv[0] !== "remote") {
    console.error(HELP);
    return 2;
  }

  const relay = createRelayServer({ host: "0.0.0.0" });
  let port = 4090;
  try {
    await relay.start(port);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
      await relay.start(0);
      port = relay.port;
    } else {
      throw err;
    }
  }

  const ip = lanIp();
  const relayHost = ip ?? "127.0.0.1";

  const clientId = `console-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const client = new RelayClient({
    url: `ws://127.0.0.1:${port}`,
    clientId,
    kind: "console",
    onPaired: (info) => {
      console.log(`\n✅ 已配对 ${info.deviceId}`);
    },
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n正在关闭远程访问…");
    client.close();
    await relay.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await client.connect();
  const code = await client.requestPairCode();

  console.log(card(relayHost, code, ip ? "lan" : "loopback"));
  const payload = buildRemotePairPayload({ addr: relayHost, code });
  console.log("\n📱 手机扫码连接：\n");
  qrcode.generate(payload, { small: true });
  console.log("\nCtrl+C 关闭远程访问。");

  return 0;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  void main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(err);
      process.exitCode = 1;
    },
  );
}
