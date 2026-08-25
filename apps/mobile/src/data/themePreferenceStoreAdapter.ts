/**
 * themePreferenceStoreAdapter — 注入 SecureStore 的主题偏好实例。
 *
 * web 端 expo-secure-store 没有 native module（读写即抛错），主题选择
 * 整页刷新后就丢——降级 localStorage（非敏感偏好，审计 P1 遗留项修复）。
 * 注意：配对 token 等敏感数据仍走 SecureStore，绝不入 localStorage。
 */

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { ThemePreferenceStore } from "./themePreferenceStore";
import { createLocalStorageApi } from "./webStorageApi";
import type { SecureStoreApi } from "./tokenStore";

const secureApi: SecureStoreApi = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

export const themePreferenceStore = new ThemePreferenceStore(
  Platform.OS === "web" ? createLocalStorageApi() : secureApi,
);
