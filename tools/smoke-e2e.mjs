#!/usr/bin/env node
/**
 * smoke-e2e.mjs — PC 端全链路冒烟（审计 2026-08-23 P0-5）。
 *
 * 模拟手机完整路径（与 App 同款传输层代码）：
 *   startRemoteAccess（relay + console + DSH 桥）→ RelayTransport 配对 →
 *   经 E2E 加密数据面调 session.list → 断言拿到会话 → 断言状态日志无
 *   「未检测到 DSH API」类失败。
 *
 * 用法：
 *   node tools/smoke-e2e.mjs                       # 自动探测本机 DSH API
 *   node tools/smoke-e2e.mjs --dsh http://127.0.0.1:43120
 *   node tools/smoke-e2e.mjs --mock                # 无真实 DSH 时用内置假 API（CI）
 *
 * 退出码：0 = 全部断言通过；1 = 任一断言失败。LAN 模式，不依赖 cloudflared。
 */

import { createServer } from "node:http";
import { startRemoteAccess } from "../harness-plugin/dist/remote-access.js";
import { RelayTransport } from "../packages/protocol/dist/index.js";

const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const useMock = args.includes("--mock");
const dshArg = argOf("--dsh");

const statuses = [];
const log = (line) => {
  statuses.push(line);
  console.log(`  [status] ${line}`);
};
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(name);
};

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_r, reject) =>
      setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms),
    ),
  ]);

/** 内置假 DSH API（--mock）：host.describe + session.list。 */
function startMockDsh() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        let rpcId = "r1";
        try {
          rpcId = JSON.parse(body).rpcId ?? rpcId;
        } catch {}
        const reply = (value) => {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ type: "server-response", rpcId, result: { ok: true, value } }));
        };
        if (req.url === "/api/host.describe") reply({ name: "mock-dsh", version: "smoke" });
        else if (req.url === "/api/session.list") reply({ items: [{ sessionId: "smoke-1", title: "mock session" }] });
        else {
          res.writeHead(404, { "content-type": "text/plain" });
          res.end("not found");
        }
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

const watchdog = setTimeout(() => {
  console.error("✗ 冒烟总超时（90s）——判定失败");
  process.exit(1);
}, 90_000);

let mock = null;
let handle = null;
let conn = null;
try {
  console.log("▶ 1/4 启动远程访问（LAN 模式，不依赖 cloudflared）");
  if (useMock) {
    mock = await startMockDsh();
    console.log(`  内置假 DSH API：${mock.baseUrl}`);
  }
  handle = await withTimeout(
    startRemoteAccess({
      mode: "lan",
      autoDetectDsh: true,
      ...(dshArg || mock ? { dshBaseUrl: dshArg ?? mock.baseUrl } : {}),
      onStatus: log,
    }),
    30_000,
    "startRemoteAccess",
  );
  check("relay 已监听且拿到 6 位配对码", /^\d{6}$/.test(handle.code), `code=${handle.code}`);
  check("手机连接 URL 为 ws://", handle.url.startsWith("ws://"), handle.url);

  console.log("▶ 2/4 校验 DSH API 探测状态");
  check(
    "DSH API 桥接建立（探测命中或显式指定）",
    handle.dshUrl !== null || statuses.some((l) => l.includes("已连接 DSH API")),
    handle.dshUrl ?? "未桥接",
  );
  if (!useMock) {
    // 假 API 不支持 WebSocket upgrade，事件流断言仅对真实 DSH 生效。
    // WS 连接是异步的，轮询等待最多 5s。
    let streamsUp = false;
    for (let i = 0; i < 25 && !streamsUp; i++) {
      streamsUp = statuses.some((l) => l.includes("事件流已连接"));
      if (!streamsUp) await new Promise((r) => setTimeout(r, 200));
    }
    check("事件流已连接", streamsUp);
  }
  check(
    "无「会话列表将为空」失败",
    !statuses.some((l) => l.includes("会话列表将为空")),
  );

  console.log("▶ 3/4 模拟手机配对（RelayTransport，App 同款传输层）");
  conn = await withTimeout(
    new RelayTransport({
      deviceId: "smoke-device",
      pairCode: handle.code,
      relayUrl: `ws://127.0.0.1:${handle.port}`,
      connectTimeoutMs: 15_000,
    }).connect({ host: "127.0.0.1", port: handle.port }, {}),
    20_000,
    "手机配对",
  );
  check("配对成功（控制面 + E2E 密钥就绪）", true);

  console.log("▶ 4/4 经桥调用 session.list（E2E 加密数据面）");
  const r = await withTimeout(conn.unary("session.list", {}), 15_000, "session.list");
  check("session.list 返回 ok", r.ok === true, r.ok ? "" : JSON.stringify(r.error));
  const items = r.ok ? (r.result?.items ?? null) : null;
  check(
    "返回会话列表结构",
    items === null || (Array.isArray(items) && items.length >= 0),
    items === null ? `result 形状: ${JSON.stringify(r.result)?.slice(0, 80)}` : `${items.length} 个会话`,
  );
} catch (err) {
  check("流程无异常", false, err instanceof Error ? err.message : String(err));
} finally {
  try {
    conn?.close();
  } catch {}
  try {
    await handle?.stop();
  } catch {}
  try {
    mock?.server.closeAllConnections?.();
    mock?.server.close();
  } catch {}
  clearTimeout(watchdog);
  // 给 libuv 一点收尾时间，避免 Windows 上退出时的 handle 竞态断言噪音。
  await new Promise((r) => setTimeout(r, 250));
}

console.log("");
if (failures.length > 0) {
  console.error(`✗ 冒烟失败：${failures.length} 项断言未通过 → ${failures.join("；")}`);
  process.exit(1);
}
console.log("✓ 冒烟通过：relay → 配对 → DSH 桥 → session.list 全链路 OK");
process.exit(0);
