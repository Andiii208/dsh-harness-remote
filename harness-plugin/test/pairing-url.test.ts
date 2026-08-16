import { describe, expect, it } from "vitest";
import { parsePairPayload } from "@dsh-remote/protocol";
import { createPairingPlugin } from "../src/plugin.js";

describe("pairingUrl (P2 QR)", () => {
  it("issues a token and builds a parseable pair URL", () => {
    const plugin = createPairingPlugin({ rand: () => "fixed-token" });
    const url = plugin.pairingUrl("192.168.1.5", 3080);
    const parsed = parsePairPayload(url);
    expect(parsed).toEqual({ host: "192.168.1.5", port: 3080, token: "fixed-token" });
    expect(plugin.store.isActive()).toBe(true);
    expect(plugin.store.validate("fixed-token")).toBe(true);
  });
});
