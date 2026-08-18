#!/usr/bin/env node
/**
 * dsh-remote remote — 面向小白的一键远程（R4 / P1a 后备 CLI）。
 *
 * 复用 `remote-access.startRemoteAccess()`：启动内置 relay（4090，被占用时
 * 自动选空闲端口）→ 注册 console → 取一次性 6 位配对码 → 打印小白卡片 →
 * 手机配对成功提示 → Ctrl+C 关闭。
 */

import { pathToFileURL } from "node:url";
import qrcode from "qrcode-terminal";
import { startRemoteAccess } from "./remote-access.js";

const HELP = `dsh-remote — DeepSeek Harness 手机视口（电脑端插件）

Usage:
  dsh-remote remote    一键开启远程访问（启动 relay + 生成 6 位配对码）
  dsh-remote --help    显示帮助
`;

function card(handle: { mode: string; host: string; port: number; url: string; code: string; dshUrl: string | null }): string {
  const line = "─".repeat(46);
  const modeLabel = handle.mode === "lan" ? "局域网模式" : "公网模式（任何网络可连）";
  const addrLine = handle.mode === "lan" ? `地址：  ${handle.host}:${handle.port}` : `地址：  ${handle.url}`;
  return [
    "",
    `┌${line}┐`,
    `│  ✅ 远程连接已开启（${modeLabel.padEnd(22)}）│`,
    `│  ${addrLine.padEnd(40)}│`,
    `│  6 位码： ${handle.code.padEnd(34)}│`,
    `│  DSH：   ${(handle.dshUrl ?? "未检测到（会话列表将为空）").padEnd(32)}│`,
    `│  手机打开 App 扫下面的二维码        │`,
    `│  或选择「远程连接」手动输入          │`,
    `└${line}┘`,
    handle.mode === "lan" && handle.host === "127.0.0.1" ? "⚠ 未检测到局域网 IP，请在同一电脑上的模拟器/浏览器使用" : "",
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

  const handle = await startRemoteAccess({
    autoDetectDsh: true,
    onStatus: (line) => console.log(`  · ${line}`),
    onPaired: (info) => console.log(`\n✅ 已配对 ${info.deviceId}`),
  });

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\n正在关闭远程访问…");
    await handle.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  console.log(card(handle));
  console.log("\n📱 手机扫码连接：\n");
  try {
    qrcode.generate(handle.qrPayload, { small: true });
  } catch (err) {
    console.log(`（当前终端无法渲染二维码，请用下面的扫码载荷生成二维码）\n${handle.qrPayload}`);
    console.log(err instanceof Error ? err.message : String(err));
  }
  console.log(`\n扫码载荷：${handle.qrPayload}`);
  console.log("Ctrl+C 关闭远程访问。");

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
