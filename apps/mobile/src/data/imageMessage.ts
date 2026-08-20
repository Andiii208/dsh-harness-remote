/**
 * imageMessage — 图片消息解析/折叠（纯 TS，零 RN 依赖，可单测）。
 * 契约来自真实 DSH sessions.schema.js：
 *   prompt 发送：content part { type:"image", mediaType: image/png|jpeg|webp|gif, data, name? }
 *   attachment 返回：{ attachment: { attachmentId, mediaType, bytes, width, height, name? }, data }
 * 历史事件 content block 是 merge-extensible 的 { type:"image", mediaType, attachmentId?, ... }。
 */

export const IMAGE_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

export interface TranscriptImage {
  attachmentId: string;
  mediaType: ImageMediaType;
}

/** 宿主 imageLimits 投影（sessions.schema.js imageLimitsProjectionSchema）。 */
export interface ImageLimits {
  maxImageBytes: number;
  maxImagesPerMessage: number;
  maxMessageImageBytes: number;
  maxImagePixels: number;
  mediaTypes: ImageMediaType[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function isImageMediaType(v: unknown): v is ImageMediaType {
  return typeof v === "string" && (IMAGE_MEDIA_TYPES as readonly string[]).includes(v);
}

export function toImageMediaType(v: unknown): ImageMediaType | null {
  return isImageMediaType(v) ? v : null;
}

/** 从 expo-image-picker 返回的资产中解析出 wire 允许的 mediaType；解析不出返回 null。 */
export function resolveImageMediaType(asset: {
  mimeType?: string;
  fileName?: string | null;
  uri?: string;
}): ImageMediaType | null {
  const direct = toImageMediaType(asset.mimeType);
  if (direct) return direct;
  const name = typeof asset.fileName === "string" ? asset.fileName : asset.uri ?? "";
  const extMatch = name.toLowerCase().match(/\.(png|jpe?g|webp|gif)(\?|$)/);
  if (!extMatch) return null;
  const ext = extMatch[1];
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return null;
}

/** 解析宿主 imageLimits 投影；字段缺失/非法返回 null（UI 视为宿主未返回限制）。 */
export function parseImageLimits(v: unknown): ImageLimits | null {
  if (!isRecord(v)) return null;
  const pos = (key: string): number | null => {
    const n = (v as Record<string, unknown>)[key];
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
  };
  const maxImageBytes = pos("maxImageBytes");
  const maxImagesPerMessage = pos("maxImagesPerMessage");
  const maxMessageImageBytes = pos("maxMessageImageBytes");
  const maxImagePixels = pos("maxImagePixels");
  if (maxImageBytes === null || maxImagesPerMessage === null || maxMessageImageBytes === null || maxImagePixels === null) {
    return null;
  }
  if (!Array.isArray(v.mediaTypes)) return null;
  const mediaTypes = (v.mediaTypes as unknown[]).filter(isImageMediaType);
  return {
    maxImageBytes,
    maxImagesPerMessage,
    maxMessageImageBytes,
    maxImagePixels,
    mediaTypes,
  };
}

/** 估算 base64 字符串解码后的字节数（无前缀纯 base64）；空/非法返回 0。 */
export function estimateBase64Bytes(data: string): number {
  if (typeof data !== "string" || data.length === 0) return 0;
  const cleaned = data.replace(/\s/g, "");
  if (cleaned.length === 0) return 0;
  const padding = cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0;
  return Math.floor((cleaned.length * 3) / 4) - padding;
}

/** 从 DSH 事件 content 数组中折叠图片块：type==="image" 且带 attachmentId 才收录。 */
export function extractTranscriptImages(content: unknown): TranscriptImage[] {
  if (!Array.isArray(content)) return [];
  const out: TranscriptImage[] = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type !== "image") continue;
    const attachmentId = typeof block.attachmentId === "string" && block.attachmentId.length > 0 ? block.attachmentId : undefined;
    const mediaType = toImageMediaType(block.mediaType);
    if (attachmentId && mediaType) {
      out.push({ attachmentId, mediaType });
    }
  }
  return out;
}
