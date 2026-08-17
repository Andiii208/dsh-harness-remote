import { describe, expect, it } from "vitest";
import { isRelayUrl, toRelayWsUrl } from "../src/transport/relayMode";

describe("relay mode selection", () => {
  it("detects relay:// ws:// wss:// as relay mode", () => {
    expect(isRelayUrl("relay://relay.example:4090")).toBe(true);
    expect(isRelayUrl("ws://relay.example:4090")).toBe(true);
    expect(isRelayUrl("wss://relay.example")).toBe(true);
  });

  it("keeps LAN hosts on the existing path", () => {
    expect(isRelayUrl("192.168.1.5")).toBe(false);
    expect(isRelayUrl("myhost.local")).toBe(false);
  });

  it("converts relay:// to ws:// and leaves ws(s):// unchanged", () => {
    expect(toRelayWsUrl("relay://relay.example:4090")).toBe("ws://relay.example:4090");
    expect(toRelayWsUrl("ws://relay.example:4090")).toBe("ws://relay.example:4090");
    expect(toRelayWsUrl("wss://relay.example")).toBe("wss://relay.example");
  });
});
