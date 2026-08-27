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
