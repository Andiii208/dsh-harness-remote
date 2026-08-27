/**
 * attachmentDiskAdapter — expo-file-system(SDK57 新 API) 落盘适配。
 * 构造期任何异常（web 无 cache 等）返回 null = 纯内存模式；
 * get/put 内部异常静默降级——缓存绝不能拖垮主链路。
 */

import { Directory, File, Paths } from "expo-file-system";
import type { AttachmentDiskLayer, AttachmentPayload } from "./attachmentCache";

const MAX_FILES = 200;

function safeFileName(key: string): string {
  return `${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
}

export function createFilesystemAttachmentDiskLayer(): AttachmentDiskLayer | null {
  let dir: Directory;
  try {
    dir = new Directory(Paths.cache, "attachment-cache");
    dir.create({ intermediates: true, idempotent: true });
  } catch {
    return null;
  }

  return {
    async get(key): Promise<AttachmentPayload | null> {
      try {
        const file = new File(dir, safeFileName(key));
        if (!file.exists) return null;
        const parsed = JSON.parse(await file.text()) as Partial<AttachmentPayload> | null;
        if (parsed && typeof parsed.mediaType === "string" && typeof parsed.data === "string") {
          return { mediaType: parsed.mediaType, data: parsed.data };
        }
        return null;
      } catch {
        return null;
      }
    },
    async put(key, value): Promise<void> {
      try {
        const names = dir.list().map((e) => e.name).filter((n) => n.endsWith(".json")).sort();
        if (names.length >= MAX_FILES) {
          for (const stale of names.slice(0, Math.ceil(MAX_FILES / 2))) {
            const f = new File(dir, stale);
            if (f.exists) f.delete();
          }
        }
        new File(dir, safeFileName(key)).write(JSON.stringify(value));
      } catch {
        /* 缓存写失败不影响功能 */
      }
    },
  };
}
