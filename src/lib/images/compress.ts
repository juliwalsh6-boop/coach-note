/**
 * 食事写真をブラウザで縮小・圧縮する（AI 解析と保存の前に必ず通す）。
 *   - 長辺 1568px 以内（AI の画像処理で十分な大きさ。これ以上は送っても縮小される）
 *   - JPEG で再保存（位置情報などのメタデータも消える）
 *   - 元の画像の SHA-256（同じ写真の二重登録を見つけるため）
 */

export const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
export const MAX_LONG_EDGE = 1568;
const TARGET_MAX_BYTES = 1.5 * 1024 * 1024;

export type CompressedImage = {
  blob: Blob;
  width: number;
  height: number;
  /** 元の画像の SHA-256（16 進） */
  hash: string;
};

export class ImageProcessingError extends Error {
  readonly code: "invalid_image" | "image_too_large";

  constructor(code: "invalid_image" | "image_too_large") {
    super(code);
    this.code = code;
  }
}

function looksLikeImage(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name);
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decodeWithImageElement(file: File): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageProcessingError("invalid_image");
  }
  // 端末の向き（EXIF）は表示上の向きで描画される
  return {
    source: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    release: () => URL.revokeObjectURL(url),
  };
}

async function decodeWithBitmap(file: File): Promise<Decoded> {
  if (typeof createImageBitmap !== "function") throw new ImageProcessingError("invalid_image");
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    throw new ImageProcessingError("invalid_image");
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function compressImage(file: File): Promise<CompressedImage> {
  if (!looksLikeImage(file)) throw new ImageProcessingError("invalid_image");
  if (file.size === 0) throw new ImageProcessingError("invalid_image");
  if (file.size > MAX_SOURCE_BYTES) throw new ImageProcessingError("image_too_large");

  const hash = await sha256Hex(await file.arrayBuffer());

  let decoded: Decoded;
  try {
    decoded = await decodeWithImageElement(file);
  } catch {
    decoded = await decodeWithBitmap(file);
  }

  try {
    if (!decoded.width || !decoded.height) throw new ImageProcessingError("invalid_image");
    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(decoded.width, decoded.height));
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ImageProcessingError("invalid_image");
    context.fillStyle = "#ffffff"; // 透過 PNG の背景を白に
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);

    let blob = await toBlob(canvas, 0.82);
    if (blob && blob.size > TARGET_MAX_BYTES) {
      blob = await toBlob(canvas, 0.68);
    }
    if (!blob || blob.size === 0) throw new ImageProcessingError("invalid_image");
    return { blob, width, height, hash };
  } finally {
    decoded.release();
  }
}
