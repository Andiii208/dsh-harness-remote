import { describe, expect, it } from "vitest";
import { createPluginCatalog, DEFAULT_PLUGIN_CATALOG } from "../src/plugin-catalog.js";

describe("plugin catalog", () => {
  it("lists the default commands and settings", async () => {
    const catalog = await createPluginCatalog();
    const list = catalog.list();
    expect(list.plugins.length).toBeGreaterThan(0);
    expect(list.commands.map((c) => c.id)).toContain("dsh-remote.ping");
    expect(list.settings.map((s) => s.key)).toContain("dsh-remote.notifyLevel");
  });

  it("executes the ping command", async () => {
    const catalog = await createPluginCatalog();
    const result = await catalog.exec("dsh-remote.ping");
    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({ pong: true });
  });

  it("executes the echo command with args", async () => {
    const catalog = await createPluginCatalog();
    const result = await catalog.exec("dsh-remote.echo", { text: "hello" });
    expect(result.ok).toBe(true);
    expect(result.result).toMatchObject({ echo: "hello" });
  });

  it("returns NOT_FOUND for unknown commands", async () => {
    const catalog = await createPluginCatalog();
    const result = await catalog.exec("missing.command");
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("NOT_FOUND");
  });

  it("exposes the default manifest for host adapters", () => {
    expect(DEFAULT_PLUGIN_CATALOG[0]?.commands.length).toBeGreaterThan(0);
  });
});
