/**
 * secureStoreAdapter — expo-secure-store 注入到 TokenStore 的实例。
 * 仅 App 运行时引用（测试直接测 tokenStore.ts 的注入桩）。
 */

import * as SecureStore from "expo-secure-store";
import { TokenStore, type SecureStoreApi } from "./tokenStore";

const api: SecureStoreApi = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

export const tokenStore = new TokenStore(api);
