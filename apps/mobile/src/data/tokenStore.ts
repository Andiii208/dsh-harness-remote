/**
 * 配对 token 安全存储（M2-T3）— expo-secure-store（Keychain/Keystore）封装。
 * 纯逻辑可注入存储实现，便于单测；App 运行时用 secureStoreAdapter。
 */

export interface SecureStoreApi {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

export const TOKEN_KEY = "dsh-pair-token";

export class TokenStore {
  constructor(private readonly api: SecureStoreApi) {}

  /** 读取配对 token；不存在/失败 → null（不抛错）。 */
  async get(): Promise<string | null> {
    try {
      const v = await this.api.getItemAsync(TOKEN_KEY);
      return v && v.length > 0 ? v : null;
    } catch (err) {
      console.warn("[token] read failed", err);
      return null;
    }
  }

  /** 保存配对 token。 */
  async set(token: string): Promise<void> {
    try {
      await this.api.setItemAsync(TOKEN_KEY, token);
    } catch (err) {
      console.warn("[token] write failed", err);
    }
  }

  /** 清除配对 token。 */
  async clear(): Promise<void> {
    try {
      await this.api.deleteItemAsync(TOKEN_KEY);
    } catch (err) {
      console.warn("[token] clear failed", err);
    }
  }
}
