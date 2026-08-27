import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readPersistedConfig, writePersistedConfig } from "../src/persist.js";

function tmpFile(): string {
  return join(mkdtempSync(join(tmpdir(), "dsh-remote-persist-")), "config.json");
}

describe("persist", () => {
  it("returns null when the config file does not exist", () => {
    expect(readPersistedConfig(tmpFile())).toBeNull();
  });

  it("round-trips enabled and mode", () => {
    const path = tmpFile();
    writePersistedConfig({ enabled: true, mode: "lan" }, path);
    expect(readPersistedConfig(path)).toEqual({ enabled: true, mode: "lan" });
  });

  it("returns null for corrupt JSON instead of throwing", () => {
    const path = tmpFile();
    writePersistedConfig({ enabled: true }, path);
    // 模拟 BOM 损坏（审计 2026-08-23：profile package.json 曾因 BOM 损坏）。
    const raw = readFileSync(path, "utf8");
    writeFileSync(path, `\uFEFF${raw}`, "utf8");
    expect(readPersistedConfig(path)).toBeNull();
  });

  it("ignores unknown fields and bad types", () => {
    const path = tmpFile();
    writePersistedConfig({ enabled: true }, path);
    writeFileSync(path, JSON.stringify({ enabled: "yes", mode: "ftp", hack: 1 }), "utf8");
    expect(readPersistedConfig(path)).toBeNull();
  });

  it("round-trips consoleId and ECDH JWKs (A2)", () => {
    const path = tmpFile();
    const peerJwk: JsonWebKey = { kty: "EC", crv: "P-256", x: "x1", y: "y1" };
    const privJwk: JsonWebKey = { kty: "EC", crv: "P-256", x: "x2", y: "y2", d: "d2" };
    writePersistedConfig(
      {
        enabled: true,
        mode: "lan",
        consoleId: "console-fixed",
        ecdhPrivateJwk: privJwk,
        ecdhPeerPublicJwk: peerJwk,
      },
      path,
    );
    expect(readPersistedConfig(path)).toEqual({
      enabled: true,
      mode: "lan",
      consoleId: "console-fixed",
      ecdhPrivateJwk: privJwk,
      ecdhPeerPublicJwk: peerJwk,
    });
  });

  it("rejects malformed consoleId / JWK fields instead of trusting them", () => {
    const path = tmpFile();
    writeFileSync(
      path,
      JSON.stringify({
        enabled: true,
        consoleId: 42,
        ecdhPrivateJwk: "not-an-object",
        ecdhPeerPublicJwk: { nope: true },
      }),
      "utf8",
    );
    expect(readPersistedConfig(path)).toEqual({ enabled: true });
  });

  it("creates missing parent directories on write", () => {
    const dir = mkdtempSync(join(tmpdir(), "dsh-remote-persist-"));
    const path = join(dir, "a", "b", "config.json");
    writePersistedConfig({ enabled: false }, path);
    expect(readPersistedConfig(path)).toEqual({ enabled: false });
  });
});
