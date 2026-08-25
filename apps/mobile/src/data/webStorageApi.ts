/**
 * webStorageApi — web 端 localStorage 版 SecureStoreApi。
 *
 * expo-secure-store 在 web 没有 native module（调用即抛 "native unavailable"），
 * 导致主题偏好这类**非敏感**偏好整页刷新后丢失（审计 P1 遗留项）。
 * 这里用 localStorage 提供同形 API；**只允许用于非敏感数据**——
 * 配对 token 等秘密仍必须走 SecureStore，绝不入 localStorage（XSS 可读）。
 */

import type { SecureStoreApi } from "./tokenStore";

export function createLocalStorageApi(
  getStorage: () => Storage | undefined = () =>
    typeof localStorage === "undefined" ? undefined : localStorage,
): SecureStoreApi {
  return {
    getItemAsync: async (key) => {
      const storage = getStorage();
      if (!storage) throw new Error("localStorage unavailable");
      return storage.getItem(key);
    },
    setItemAsync: async (key, value) => {
      const storage = getStorage();
      if (!storage) throw new Error("localStorage unavailable");
      storage.setItem(key, value);
    },
    deleteItemAsync: async (key) => {
      const storage = getStorage();
      if (!storage) throw new Error("localStorage unavailable");
      storage.removeItem(key);
    },
  };
}
