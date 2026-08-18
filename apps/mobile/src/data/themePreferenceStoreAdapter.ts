/**
 * themePreferenceStoreAdapter — 注入 SecureStore 的主题偏好实例。
 */

import * as SecureStore from "expo-secure-store";
import { ThemePreferenceStore } from "./themePreferenceStore";
import type { SecureStoreApi } from "./tokenStore";

const api: SecureStoreApi = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

export const themePreferenceStore = new ThemePreferenceStore(api);
