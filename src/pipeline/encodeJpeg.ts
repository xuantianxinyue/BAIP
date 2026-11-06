import { buildExifPayload, insertExif, type DecodedImage, type ExifBlock } from '../core';
import { toImageData } from './imageConvert';

/** Encodes to JPEG (`quality` 0–100) and adds the source's EXIF, when it has any. Works in workers. */
export async function encodeJpeg(image: DecodedImage, quality: number, exif: ExifBlock | null): Promise<Blob> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
  ctx.putImageData(toImageData(image), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: Math.min(100, Math.max(0, quality)) / 100 });
  canvas.width = canvas.height = 0; // releases the backing store now rather than at the next GC
  if (!exif) return blob;
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  return new Blob([insertExif(jpeg, buildExifPayload(exif, image.width, image.height)) as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' });
}
