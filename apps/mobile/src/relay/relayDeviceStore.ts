/**
 * RelayDeviceStore — M3.5 中继设备身份持久化。
 *
 * 保存 deviceId 与本地 ECDH P-256 私钥/公钥 JWK。优先使用注入的
 * RelayDeviceStorage（App 运行时为 expo-secure-store），不可用时回退
 * globalThis.localStorage，再不行使用实例内存（同一实例内稳定返回同一记录）。
 * 纯逻辑、可注入，便于单测；不依赖 expo-secure-store。
 */

import { generateRelayKeyPair } from "@dsh-remote/protocol";

export interface RelayDeviceRecord {
  deviceId: string;
  privateKeyJwk: JsonWebKey | null;
  publicKeyJwk: JsonWebKey | null;
}

export interface RelayDeviceStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export const RELAY_DEVICE_KEY = "dsh-relay-device";

interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isJwk(v: unknown): v is JsonWebKey {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseRecord(raw: string): RelayDeviceRecord | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (typeof o.deviceId !== "string" || o.deviceId.length === 0) return null;
    return {
      deviceId: o.deviceId,
      privateKeyJwk: isJwk(o.privateKeyJwk) ? o.privateKeyJwk : null,
      publicKeyJwk: isJwk(o.publicKeyJwk) ? o.publicKeyJwk : null,
    };
  } catch {
    return null;
  }
}

function getLocalStorage(): LocalStorageLike | null {
  try {
    return (globalThis as { localStorage?: LocalStorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
}

export class RelayDeviceStore {
  private record: RelayDeviceRecord | null = null;

  constructor(
    private readonly storage?: RelayDeviceStorage,
    private readonly crypto?: Crypto,
  ) {}

  async getOrCreate(): Promise<RelayDeviceRecord> {
    if (this.record) return this.record;

    // 1) 注入 storage（SecureStore）→ 2) localStorage → 3) 内存降级。
    const persisted = await this.readPersisted();
    if (persisted) {
      this.record = persisted;
      return persisted;
    }

    const cryptoImpl = this.crypto
      ?? (globalThis as { crypto?: Crypto }).crypto;
    let privateKeyJwk: JsonWebKey | null = null;
    let publicKeyJwk: JsonWebKey | null = null;
    if (cryptoImpl) {
      try {
        const pair = await generateRelayKeyPair(cryptoImpl);
        privateKeyJwk = pair.privateKeyJwk;
        publicKeyJwk = pair.publicKeyJwk;
      } catch (err) {
        console.warn("[relay-device] key generation failed, proceeding without keys", err);
      }
    }

    const next: RelayDeviceRecord = {
      deviceId: `relay-device-${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`,
      privateKeyJwk,
      publicKeyJwk,
    };
    this.record = next;

    await this.writePersisted(next);
    return next;
  }

  private async readPersisted(): Promise<RelayDeviceRecord | null> {
    if (this.storage) {
      try {
        const raw = await this.storage.getItemAsync(RELAY_DEVICE_KEY);
        if (raw) {
          const record = parseRecord(raw);
          if (record) return record;
        }
      } catch (err) {
        console.warn("[relay-device] storage read failed", err);
      }
    }

    const local = getLocalStorage();
    if (local) {
      try {
        const raw = local.getItem(RELAY_DEVICE_KEY);
        if (raw) {
          const record = parseRecord(raw);
          if (record) return record;
        }
      } catch (err) {
        console.warn("[relay-device] localStorage read failed", err);
      }
    }

    return null;
  }

  private async writePersisted(record: RelayDeviceRecord): Promise<void> {
    const raw = JSON.stringify(record);
    if (this.storage) {
      try {
        await this.storage.setItemAsync(RELAY_DEVICE_KEY, raw);
        return;
      } catch (err) {
        console.warn("[relay-device] storage write failed", err);
      }
    }

    const local = getLocalStorage();
    if (local) {
      try {
        local.setItem(RELAY_DEVICE_KEY, raw);
      } catch (err) {
        console.warn("[relay-device] localStorage write failed", err);
      }
    }
  }
}
