/**
 * approvalHistoryStoreAdapter — expo-secure-store 注入实例。
 */
import * as SecureStore from "expo-secure-store";
import { ApprovalHistoryStore } from "./approvalHistoryStore";
import type { SecureStoreApi } from "./tokenStore";

const api: SecureStoreApi = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

export const approvalHistoryStore = new ApprovalHistoryStore(api);
