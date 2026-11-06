import { DecodeError, exifFields, readExifBlock, type DecodedImage, type ExifInfo, type ImageDecoder, type ImageKind } from '../core';
import { fitBitmap } from './bitmapTools';

/**
 * Decodes JPEG/PNG with the browser's native decoder.
 * EXIF sits at the start of a JPEG, so only its first bytes are read for metadata.
 */
const EXIF_SCAN_BYTES = 128 * 1024;

export class BitmapDecoder implements ImageDecoder {
  readonly id = 'browser-bitmap';

  canDecode(kind: ImageKind): boolean {
    return kind === 'bitmap';
  }

  async readMetadata(file: File): Promise<ExifInfo> {
    const bmp = await this.open(file);
    const { width, height } = bmp;
    bmp.close();
    const head = new Uint8Array(await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer());
    const block = readExifBlock(head);
    return { ...(block && exifFields(block)), width, height, orientation: 0 };
  }

  async embeddedPreview(file: File, maxPixelSize: number): Promise<ImageBitmap | null> {
    return fitBitmap(await this.open(file), maxPixelSize);
  }

  async decode(file: File, _options?: unknown, signal?: AbortSignal): Promise<DecodedImage> {
    if (signal?.aborted) throw new DecodeError('aborted', `${file.name}: 已取消`);
    const bmp = await this.open(file);
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new DecodeError('failed', 'OffscreenCanvas 2D context unavailable');
    ctx.drawImage(bmp, 0, 0);
    const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
    const pixels = new Uint8Array(bmp.width * bmp.height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      pixels[j] = data[i];
      pixels[j + 1] = data[i + 1];
      pixels[j + 2] = data[i + 2];
    }
    const image: DecodedImage = { width: bmp.width, height: bmp.height, channels: 3, bitsPerSample: 8, pixels };
    bmp.close();
    return image;
  }

  private async open(file: File): Promise<ImageBitmap> {
    try {
      return await createImageBitmap(file);
    } catch (e) {
      throw new DecodeError('corrupt', `${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
