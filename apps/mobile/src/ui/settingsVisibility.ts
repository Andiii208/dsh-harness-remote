/**
 * settingsVisibility — 设置页分组可见性纯函数（可单测）。
 */

/** 插件入口：读取完成且宿主确实返回插件时才显示。 */
export function pluginsRowVisible(pluginRead: boolean, pluginCount: number): boolean {
  return pluginRead && pluginCount > 0;
}

/** 模型与权限分组：在线且至少有一类数据（settings 命名空间或 Agent 预设）才显示。 */
export function modelsPermissionsVisible(opts: {
  online: boolean;
  settingsInfoPresent: boolean;
  presetRead: boolean;
  presetCount: number;
}): boolean {
  if (!opts.online) return false;
  return opts.settingsInfoPresent || (opts.presetRead && opts.presetCount > 0);
}
