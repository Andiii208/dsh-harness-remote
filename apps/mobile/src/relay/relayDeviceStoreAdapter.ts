/**
 * relayDeviceStoreAdapter — expo-secure-store 注入的 RelayDeviceStore 单例。
 * Web 端 SecureStore 不可用/抛错时由 store 内的 localStorage 回退处理。
 */

import * as SecureStore from "expo-secure-store";
import { RelayDeviceStore, type RelayDeviceStorage } from "./relayDeviceStore";

const storage: RelayDeviceStorage = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
};

export const relayDeviceStore = new RelayDeviceStore(storage);
