/**
 * appSettingsAdapter — 注入 SecureStore 的 App 本地设置实例。
 */

import * as SecureStore from "expo-secure-store";
import { AppSettingsStore } from "./appSettingsStore";
import type { SecureStoreApi } from "./tokenStore";

const api: SecureStoreApi = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

export const appSettingsStore = new AppSettingsStore(api);
