/**
 * hostStoreAdapter — expo-secure-store 注入到 HostStore 的实例。
 */
import * as SecureStore from "expo-secure-store";
import { HostStore } from "./hostStore";
import type { SecureStoreApi } from "../data/tokenStore";

const api: SecureStoreApi = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

export const hostStore = new HostStore(api);
