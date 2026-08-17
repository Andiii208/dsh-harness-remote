import { describe, expect, it } from "vitest";
import { readPluginExec, readPluginList } from "../src/plugin.js";

const sample = {
  plugins: [
    {
      id: "git",
      name: "Git",
      version: "1.0.0",
      description: "git commands",
      commands: [
        {
          id: "git.commit",
          pluginId: "git",
          title: "提交",
          description: "commit staged changes",
          risk: "approve",
          args: [{ name: "message", label: "提交信息", type: "string", required: true }],
        },
        {
          id: "git.status",
          pluginId: "git",
          title: "状态",
          risk: "read",
        },
      ],
      settings: [
        { key: "git.autoPush", title: "自动推送", type: "switch", value: true },
        { key: "git.editor", title: "编辑器", type: "select", options: ["vim", "code"], value: "code" },
      ],
    },
  ],
};

describe("readPluginList", () => {
  it("reads plugins, commands and settings from plugin.list payload", () => {
    const list = readPluginList(sample);
    expect(list.plugins).toHaveLength(1);
    expect(list.commands).toHaveLength(2);
    expect(list.settings).toHaveLength(2);
    expect(list.commands[0]).toMatchObject({
      id: "git.commit",
      pluginId: "git",
      title: "提交",
      risk: "approve",
    });
    expect(list.commands[0]?.args?.[0]).toMatchObject({ name: "message", type: "string" });
  });

  it("degrades gracefully on malformed or missing payloads", () => {
    expect(readPluginList(undefined)).toEqual({ plugins: [], commands: [], settings: [] });
    expect(readPluginList({ plugins: "nope" })).toEqual({ plugins: [], commands: [], settings: [] });
    expect(readPluginList({ plugins: [null, { id: "x" }] })).toEqual({
      plugins: [{ id: "x", name: "x", commands: [], settings: [] }],
      commands: [],
      settings: [],
    });
  });
});

describe("readPluginExec", () => {
  it("reads successful and failed plugin.exec results", () => {
    expect(
      readPluginExec({ rpcId: "r1", commandId: "git.status", ok: true, result: { clean: true } }),
    ).toMatchObject({ rpcId: "r1", commandId: "git.status", ok: true, result: { clean: true } });
    expect(
      readPluginExec({ commandId: "git.commit", ok: false, error: { code: "APPROVE", message: "denied" } }),
    ).toMatchObject({ commandId: "git.commit", ok: false, error: { code: "APPROVE", message: "denied" } });
  });

  it("returns null for malformed payloads", () => {
    expect(readPluginExec(undefined)).toBeNull();
    expect(readPluginExec({ commandId: "x" })).toBeNull();
    expect(readPluginExec({ ok: true })).toBeNull();
  });
});
