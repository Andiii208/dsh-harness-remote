import { describe, expect, it, vi } from "vitest";
import { apply } from "../src/apply.js";
import type { RemoteAccessService } from "../src/remote-service.js";
import type { RemotePersistedConfig } from "../src/persist.js";

function fakeService() {
  const start = vi.fn(async (_mode?: string) => ({}));
  const stop = vi.fn(async () => ({}));
  const service = { start, stop, status: () => ({ running: false }) };
  return { service: service as unknown as RemoteAccessService, start, stop };
}

function fakeCtx() {
  const disposers: Array<() => unknown> = [];
  return {
    ctx: {
      logger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
      effect: (dispose: () => unknown) => {
        disposers.push(dispose);
      },
    },
    disposers,
  };
}

const noRpc = () => () => {};

describe("apply auto-start from persisted config", () => {
  it("auto-starts with the persisted mode when enabled=true", () => {
    const { service, start } = fakeService();
    const { ctx } = fakeCtx();
    const persisted: RemotePersistedConfig = { enabled: true, mode: "lan" };
    apply(ctx, {}, { service, installRpc: noRpc, readPersisted: () => persisted });
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith("lan");
  });

  it("does not auto-start when nothing was persisted", () => {
    const { service, start } = fakeService();
    const { ctx } = fakeCtx();
    apply(ctx, {}, { service, installRpc: noRpc, readPersisted: () => null });
    expect(start).not.toHaveBeenCalled();
  });

  it("does not auto-start when persisted enabled=false", () => {
    const { service, start } = fakeService();
    const { ctx } = fakeCtx();
    apply(ctx, {}, { service, installRpc: noRpc, readPersisted: () => ({ enabled: false }) });
    expect(start).not.toHaveBeenCalled();
  });

  it("explicit internals.autoStart=false disables persistence-driven start (test escape hatch)", () => {
    const { service, start } = fakeService();
    const { ctx } = fakeCtx();
    apply(ctx, {}, {
      service,
      installRpc: noRpc,
      autoStart: false,
      readPersisted: () => ({ enabled: true, mode: "tunnel" }),
    });
    expect(start).not.toHaveBeenCalled();
  });

  it("explicit internals.autoStart=true still forces a start", () => {
    const { service, start } = fakeService();
    const { ctx } = fakeCtx();
    apply(ctx, {}, { service, installRpc: noRpc, autoStart: true, readPersisted: () => null });
    expect(start).toHaveBeenCalledTimes(1);
  });
});
