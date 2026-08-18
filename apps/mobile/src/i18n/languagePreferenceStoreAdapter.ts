/**
 * languagePreferenceStoreAdapter — 注入 SecureStore 的语言偏好实例。
 */

import * as SecureStore from "expo-secure-store";
import { LanguagePreferenceStore } from "./languagePreferenceStore";
import type { SecureStoreApi } from "../data/tokenStore";

const api: SecureStoreApi = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

export const languagePreferenceStore = new LanguagePreferenceStore(api);
