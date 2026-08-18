/**
 * M3.5 pairing-loop integration bridge (dev-only, not part of any package):
 *   relay (4090) + mock-harness (ephemeral) + console-side RelayClient
 *   (harness-plugin). The console registers with a real ECDH public key,
 *   the relay creates a 6-digit pairing code, and the phone pairs through
 *   the connection page by entering ws://127.0.0.1:4090 + that code.
 *
 * After pairing, both sides derive the AES-256-GCM session key from the
 * ECDH public keys the relay exchanged during relay.pair; this script then
 * bridges mock-harness downlink frames over encrypted relay.route to the
 * phone and answers phone unary requests by calling the mock-harness /api
 * surface.
 */
import { createRelayServer } from "../relay/dist/server.js";
import { createMockHarness } from "../mock-harness/dist/index.js";
import { loadFixtureFile } from "../mock-harness/dist/fixture-loader.js";
import { RelayClient } from "../harness-plugin/dist/relay-client.js";
import {
  makeRpcId,
  RELAY_ENVELOPE_VERSION,
} from "../packages/protocol/dist/index.js";

const CONSOLE_ID = "console-1";
const RELAY_PORT = 4090;

// 联调脚本自己组合 fixtures：sessions 提供会话流，settings/plugins 提供
// R2/R3 能力面（host.settings.get / plugin.list），与 relay 无关。
const fixtures = await Promise.all([
  loadFixtureFile("mock-harness/fixtures/sessions.json"),
  loadFixtureFile("mock-harness/fixtures/settings.json"),
  loadFixtureFile("mock-harness/fixtures/plugins.json"),
]);
const harness = await createMockHarness(fixtures, { host: "127.0.0.1", port: 0 });
await harness.start();

const relay = createRelayServer({ host: "127.0.0.1", credentialTtlMs: 60 * 60 * 1000 });
await relay.start(RELAY_PORT);

const relayUrl = `ws://127.0.0.1:${RELAY_PORT}`;
let phoneId = "";

/** Dev-only evidence wrapper: logs relay.route payloads sent by the console.
 *  After E2E pairing this must only ever contain {to, ciphertext, nonce}. */
class LoggingWs extends WebSocket {
  send(data) {
    try {
      const env = JSON.parse(data);
      if (env && env.type === "relay.route") {
        console.log(`CONSOLE_ROUTE_PAYLOAD ${JSON.stringify(env.payload)}`);
      }
    } catch {
      /* not json — send unchanged */
    }
    super.send(data);
  }
}

const consoleClient = new RelayClient({
  url: relayUrl,
  clientId: CONSOLE_ID,
  kind: "console",
  wsImpl: LoggingWs,
  onPaired: (info) => {
    phoneId = info.deviceId;
    console.log(`RELAY_PAIRED device=${info.deviceId}`);
  },
});
await consoleClient.connect();

// R5a：通过 relay.pair.code 协议向 relay 要一次性 6 位配对码（不再直接
// 调用 relay.store），手机连接页输入 relay 地址 + 该码完成配对。
const pairCode = await consoleClient.requestPairCode();
console.log(`RELAY_PAIR_CODE=${pairCode}`);
console.log(
  `RELAY_PAIR_INTEGRATION_READY relay=${relayUrl} mock=${harness.url} console=${CONSOLE_ID}`,
);

function env(type, id, from, to, payload) {
  return {
    v: RELAY_ENVELOPE_VERSION,
    type,
    id,
    from,
    to,
    ts: Date.now(),
    ...(payload !== undefined ? { payload } : {}),
  };
}

async function postUnary(base, method, payload, rpcId) {
  const res = await fetch(`${base}/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rpcId, method, payload }),
  });
  return res.json();
}

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.onopen = () => resolve(ws);
    ws.onerror = (err) => reject(err);
  });
}

// 1) phone → console unary requests (delivered decrypted by RelayClient).
consoleClient.onEnvelope((msg) => {
  if (msg?.type !== "relay.route") return;
  const p = msg.payload;
  if (!p || typeof p !== "object") return;
  const rpcId = p.rpcId;
  const method = p.method;
  if (typeof rpcId !== "string" || typeof method !== "string") return;
  const to = phoneId || msg.from || "relay-device-web1";
  void postUnary(harness.url, method, p.payload ?? {}, rpcId)
    .then((body) =>
      consoleClient.send(
        env("relay.route", makeRpcId(), CONSOLE_ID, to, {
          to,
          rpcId,
          ok: body.ok === true,
          ...(body.ok === true
            ? { result: body.result }
            : { error: body.error ?? { code: "E_UNKNOWN", message: "mock-harness error" } }),
        }),
      ),
    )
    .catch((err) =>
      consoleClient.send(
        env("relay.route", makeRpcId(), CONSOLE_ID, to, {
          to,
          rpcId,
          ok: false,
          error: { code: "E_UNKNOWN", message: String(err) },
        }),
      ),
    );
});

// 2) mock-harness downlink frames → encrypted relay.route to the phone.
for (const stream of ["mux", "host"]) {
  const ws = await connectWs(`${harness.url.replace(/^http/, "ws")}/api/events.${stream}`);
  ws.onmessage = (ev) => {
    if (!phoneId) return;
    const frame = JSON.parse(String(ev.data));
    void consoleClient.send(
      env("relay.route", makeRpcId(), CONSOLE_ID, phoneId, {
        to: phoneId,
        ...frame,
      }),
    );
  };
}
