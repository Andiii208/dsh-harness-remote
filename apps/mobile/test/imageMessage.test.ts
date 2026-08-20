import { describe, expect, it } from "vitest";
import {
  estimateBase64Bytes,
  extractTranscriptImages,
  parseImageLimits,
  resolveImageMediaType,
  toImageMediaType,
} from "../src/data/imageMessage";

describe("imageMessage", () => {
  it("extracts image blocks with attachmentId from DSH content arrays", () => {
    const images = extractTranscriptImages([
      { type: "text", text: "看这张图" },
      { type: "image", mediaType: "image/png", attachmentId: "att_1" },
      { type: "image", mediaType: "image/webp", attachmentId: "att_2" },
      { type: "image", mediaType: "image/svg+xml", attachmentId: "att_bad" },
      { type: "image", mediaType: "image/gif" },
    ]);
    expect(images).toEqual([
      { attachmentId: "att_1", mediaType: "image/png" },
      { attachmentId: "att_2", mediaType: "image/webp" },
    ]);
  });

  it("parses imageLimits projection and estimates base64 bytes", () => {
    expect(parseImageLimits({
      maxImageBytes: 5_000_000,
      maxImagesPerMessage: 4,
      maxMessageImageBytes: 8_000_000,
      maxImagePixels: 20_000_000,
      mediaTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    })).toEqual({
      maxImageBytes: 5_000_000,
      maxImagesPerMessage: 4,
      maxMessageImageBytes: 8_000_000,
      maxImagePixels: 20_000_000,
      mediaTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    });
    expect(parseImageLimits({ maxImageBytes: 0, mediaTypes: [] })).toBeNull();
    expect(parseImageLimits(null)).toBeNull();
    expect(parseImageLimits({
      maxImageBytes: 5,
      maxImagesPerMessage: 1,
      maxMessageImageBytes: 5,
      maxImagePixels: 10,
      mediaTypes: ["image/png", "image/bmp"],
    })).toEqual({
      maxImageBytes: 5,
      maxImagesPerMessage: 1,
      maxMessageImageBytes: 5,
      maxImagePixels: 10,
      mediaTypes: ["image/png"],
    });
    expect(estimateBase64Bytes("")).toBe(0);
    expect(estimateBase64Bytes("aGk=")).toBe(2); // "hi"
    expect(estimateBase64Bytes("aGk")).toBe(2);
  });

  it("resolves picker assets to wire media types", () => {
    expect(resolveImageMediaType({ mimeType: "image/png" })).toBe("image/png");
    expect(resolveImageMediaType({ mimeType: "image/jpeg" })).toBe("image/jpeg");
    expect(resolveImageMediaType({ fileName: "photo.JPEG" })).toBe("image/jpeg");
    expect(resolveImageMediaType({ uri: "file:///tmp/a.webp" })).toBe("image/webp");
    expect(resolveImageMediaType({ uri: "file:///tmp/a.gif" })).toBe("image/gif");
    expect(resolveImageMediaType({ mimeType: "image/bmp" })).toBeNull();
    expect(toImageMediaType("image/png")).toBe("image/png");
    expect(toImageMediaType("image/tiff")).toBeNull();
  });
});
