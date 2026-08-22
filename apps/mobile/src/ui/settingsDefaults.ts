/**
 * settingsDefaults — 设置页「默认模型 / 默认思考强度」的纯函数映射（可单测）。
 *
 * 真实 DSH 没有 host.settings.get/set（404），默认值来自 settings.describe 的
 * `agent-default-model` 命名空间；可选模型清单来自 `llm-deepseek` 命名空间。
 */

import type { HostSettings } from "@dsh-remote/protocol";

export interface SettingsDefaultsView {
  model?: string;
  models: string[];
  thinking?: string;
  thinkingOptions: string[];
  writable: boolean;
}

export interface SettingsNamespaceLite {
  ns: string;
  value: unknown;
  revision: number;
  applies: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** 旧 host.settings.get 路径的映射（保留给 mock/未来宿主）。 */
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

/**
 * 真实 DSH settings.describe 路径：
 * - `agent-default-model.value` = { provider, model, reasoningEffort? }
 * - `llm-deepseek.value.models[]` = 可选模型清单（取 id）
 */
export function defaultsFromSettingsNamespaces(
  namespaces: SettingsNamespaceLite[] | null | undefined,
  writable: boolean,
): SettingsDefaultsView {
  const list = Array.isArray(namespaces) ? namespaces : [];
  const modelNs = list.find((n) => n.ns === "agent-default-model");
  const llmNs = list.find((n) => n.ns === "llm-deepseek");

  const modelNsValue = modelNs?.value;
  let modelValue: Record<string, unknown> = {};
  if (isRecord(modelNsValue)) modelValue = modelNsValue;
  else if (str(modelNsValue)) {
    try {
      const parsed: unknown = JSON.parse(modelNsValue as string);
      if (isRecord(parsed)) modelValue = parsed;
    } catch {
      /* keep empty */
    }
  }

  const llmNsValue = llmNs?.value;
  let llmValue: Record<string, unknown> = {};
  if (isRecord(llmNsValue)) llmValue = llmNsValue;
  else if (str(llmNsValue)) {
    try {
      const parsed: unknown = JSON.parse(llmNsValue as string);
      if (isRecord(parsed)) llmValue = parsed;
    } catch {
      /* keep empty */
    }
  }

  const model = str(modelValue.model);
  const thinking = str(modelValue.reasoningEffort);
  const llmModels = Array.isArray(llmValue.models)
    ? llmValue.models
        .map((m) => (isRecord(m) ? str(m.id) : undefined))
        .filter((m): m is string => m !== undefined)
    : [];
  const models = llmModels.length > 0 ? llmModels : (model !== undefined ? [model] : []);

  return {
    ...(model !== undefined ? { model } : {}),
    models,
    ...(thinking !== undefined ? { thinking } : {}),
    thinkingOptions: ["low", "medium", "high"],
    writable,
  };
}
