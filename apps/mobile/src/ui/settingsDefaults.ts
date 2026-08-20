/**
 * settingsDefaults — 设置页「默认模型 / 默认思考强度」的纯函数映射（可单测）。
 */

import type { HostSettings } from "@dsh-remote/protocol";

export interface SettingsDefaultsView {
  model?: string;
  models: string[];
  thinking?: string;
  thinkingOptions: string[];
  writable: boolean;
}

export function defaultsFromHostSettings(s: HostSettings | null): SettingsDefaultsView {
  if (!s) {
    return { models: [], thinkingOptions: ["low", "medium", "high"], writable: false };
  }
  return {
    model: s.model,
    models: Array.isArray(s.models) ? s.models : [],
    thinking: s.thinking,
    thinkingOptions: ["low", "medium", "high"],
    writable: s.writable === true,
  };
}
