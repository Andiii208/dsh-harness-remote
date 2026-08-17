import { describe, expect, it } from "vitest";
import { isRelayUrl, RELAY_DEFAULT_PORT, toRelayWsUrl } from "../src/transport/relayMode";

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

  it("R1: bare host gets ws:// + default relay port 4090", () => {
    expect(toRelayWsUrl("relay.example.com")).toBe(`ws://relay.example.com:${RELAY_DEFAULT_PORT}`);
    expect(toRelayWsUrl("  relay.example.com  ")).toBe(`ws://relay.example.com:${RELAY_DEFAULT_PORT}`);
    expect(toRelayWsUrl("192.168.1.5")).toBe(`ws://192.168.1.5:${RELAY_DEFAULT_PORT}`);
  });

  it("R1: relay:// without port gets default 4090", () => {
    expect(toRelayWsUrl("relay://relay.example.com")).toBe(`ws://relay.example.com:${RELAY_DEFAULT_PORT}`);
  });

  it("R1: IPv6 hosts are bracketed before appending the default port", () => {
    expect(toRelayWsUrl("::1")).toBe(`ws://[::1]:${RELAY_DEFAULT_PORT}`);
    expect(toRelayWsUrl("[::1]")).toBe(`ws://[::1]:${RELAY_DEFAULT_PORT}`);
  });
});
