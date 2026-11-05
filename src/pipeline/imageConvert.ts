import type { DecodedImage } from '../core';

/** Converts decoded RGB (8/16 bit) to canvas RGBA8. 16-bit samples are truncated to their high byte. */
export function toImageData(image: DecodedImage): ImageData {
  const { width, height, pixels, bitsPerSample } = image;
  const shift = bitsPerSample === 16 ? 8 : 0;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; j < pixels.length; i += 4, j += 3) {
    rgba[i] = pixels[j] >> shift;
    rgba[i + 1] = pixels[j + 1] >> shift;
    rgba[i + 2] = pixels[j + 2] >> shift;
    rgba[i + 3] = 255;
  }
  return new ImageData(rgba, width, height);
}

/**
 * Encodes a bitmap to a JPEG object URL for <img> elements, optionally downscaled so the long
 * edge is at most `maxPixelSize`. The bitmap is left open; the caller must revoke the URL.
 */
export async function bitmapToObjectUrl(bitmap: ImageBitmap, { quality = 0.85, maxPixelSize = Infinity } = {}): Promise<string> {
  const scale = Math.min(1, maxPixelSize / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  return URL.createObjectURL(blob);
}
