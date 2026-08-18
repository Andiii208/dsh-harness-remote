import { describe, expect, it } from "vitest";
import { adaptHostRpc, adaptHostSettingsRpc } from "../src/host-adapter.js";

describe("adaptHostRpc", () => {
  it("maps session.interrupt to session.cancel", () => {
    expect(adaptHostRpc("session.interrupt", { sessionId: "s1" })).toEqual({
      method: "session.cancel",
      payload: { sessionId: "s1" },
    });
  });

  it("maps goals/pause and goals/resume to dot-named goal methods", () => {
    expect(adaptHostRpc("goals/pause", { id: "g1" })).toEqual({
      method: "goal.pause",
      payload: { id: "g1" },
    });
    expect(adaptHostRpc("goals/resume", { id: "g1" })).toEqual({
      method: "goal.resume",
      payload: { id: "g1" },
    });
  });

  it("passes through methods that already match the real host", () => {
    expect(adaptHostRpc("session.list", {})).toEqual({ method: "session.list", payload: {} });
  });
});

describe("adaptHostSettingsRpc", () => {
  it("maps host.settings.get to settings.describe", () => {
    expect(adaptHostSettingsRpc("host.settings.get", {})).toEqual({
      method: "settings.describe",
      payload: {},
    });
  });

  it("maps host.settings.set to settings.update", () => {
    expect(adaptHostSettingsRpc("host.settings.set", { model: "x" })).toEqual({
      method: "settings.update",
      payload: { model: "x" },
    });
  });
});
