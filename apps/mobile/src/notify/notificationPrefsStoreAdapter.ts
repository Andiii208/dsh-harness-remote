/**
 * notificationPrefsStoreAdapter — expo-secure-store 注入实例。
 */
import * as SecureStore from "expo-secure-store";
import { NotificationPrefsStore } from "./notificationPrefsStore";
import type { SecureStoreApi } from "../data/tokenStore";

const api: SecureStoreApi = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

export const notificationPrefsStore = new NotificationPrefsStore(api);
