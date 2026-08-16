/**
 * keepaliveAdapter — expo-background-task 表面注入（App 运行时使用；
 * 测试直接测 keepalive.ts 的决策逻辑与注入桩）。
 */

import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { KEEPALIVE_TASK, type BackgroundTaskApi } from "./keepalive.js";

export const backgroundTaskApi: BackgroundTaskApi = {
  defineTask: (name, task) => TaskManager.defineTask(name, task as never),
  registerTaskAsync: (name, options) => BackgroundTask.registerTaskAsync(name, options as never),
  unregisterTaskAsync: (name) => BackgroundTask.unregisterTaskAsync(name),
};

export { KEEPALIVE_TASK };
