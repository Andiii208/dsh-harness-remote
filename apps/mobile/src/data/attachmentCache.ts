/**
 * attachmentCache — 附件内存 LRU（P3 / 审计 A16）。
 *
 * 此前每次气泡挂载都经 relay 拉 base64，历史滚动一屏会重复请求
 * 同一批附件（慢且耗流量）。LRU 封顶 100 条（base64 大图约占
 * 数百 KB～MB 级，防止无界增长）；磁盘层待引入 expo-file-system 后叠加。
 */

export interface AttachmentPayload {
  mediaType: string;
  data: string;
}

export interface AttachmentCache {
  get(key: string): AttachmentPayload | undefined;
  put(key: string, value: AttachmentPayload): void;
  /** 测试/清理用。 */
  size(): number;
}

const DEFAULT_MAX_ENTRIES = 100;

/** 提取为独立函数便于与磁盘层组合：先内存后磁盘后网络。 */
export function createAttachmentCache(maxEntries: number = DEFAULT_MAX_ENTRIES): AttachmentCache {
  const map = new Map<string, AttachmentPayload>();
  return {
    get(key) {
      const value = map.get(key);
      if (value === undefined) return undefined;
      // 触摸即续期（真 LRU 而非 FIFO）。
      map.delete(key);
      map.set(key, value);
      return value;
    },
    put(key, value) {
      map.delete(key);
      while (map.size >= maxEntries) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
      map.set(key, value);
    },
    size() {
      return map.size;
    },
  };
}

/** 可插拔磁盘层：读写字符串化的 AttachmentPayload（JSON）。 */
export interface AttachmentDiskLayer {
  get(key: string): Promise<AttachmentPayload | null>;
  put(key: string, value: AttachmentPayload): Promise<void>;
}

/**
 * 组合读取口径：内存命中即返回；未命中走磁盘并回填内存；
 * 都未命中返回 undefined（调用方再走网络）。
 */
export async function getFromLayers(
  layers: { memory: AttachmentCache; disk?: AttachmentDiskLayer },
  key: string,
): Promise<AttachmentPayload | undefined> {
  const hit = layers.memory.get(key);
  if (hit) return hit;
  const diskValue = layers.disk ? await layers.disk.get(key) : null;
  if (diskValue) {
    layers.memory.put(key, diskValue);
    return diskValue;
  }
  return undefined;
}
