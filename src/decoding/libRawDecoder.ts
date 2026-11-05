import LibRaw, { type LibRawSettings, type Metadata } from 'libraw-wasm';
import { DecodeError, type DecodeOptions, type DecodedImage, type ExifInfo, type ImageDecoder, type ImageKind } from '../core';

/**
 * Decodes camera RAW files with LibRaw compiled to WASM (libraw-wasm).
 *
 * Each call uses its own LibRaw instance (= its own Web Worker) and disposes it afterwards,
 * so the WASM heap of one file is released before the next one is opened.
 * Performance: `decode` runs full demosaicing on the CPU; for a 24 MP file this is the
 * dominant cost of the pipeline, so previews should use `embeddedPreview` instead.
 */
export class LibRawDecoder implements ImageDecoder {
  readonly id = 'libraw-wasm';

  canDecode(kind: ImageKind): boolean {
    return kind === 'raw';
  }

  async readMetadata(file: File): Promise<ExifInfo> {
    return this.withLibRaw(file, {}, async (raw) => {
      const meta = await raw.metadata(true);
      if (!meta) throw new DecodeError('corrupt', `${file.name}: no metadata`);
      return toExif(meta);
    });
  }

  async embeddedPreview(file: File, maxPixelSize: number): Promise<ImageBitmap | null> {
    return this.withLibRaw(file, {}, async (raw) => {
      const thumb = await raw.thumbnailData();
      if (!thumb || thumb.data.length === 0) return null;
      if (thumb.format === 'jpeg') {
        const blob = new Blob([thumb.data as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' });
        const full = await createImageBitmap(blob);
        return fitBitmap(full, maxPixelSize);
      }
      if (thumb.format === 'bitmap') {
        const rgba = new Uint8ClampedArray(thumb.width * thumb.height * 4);
        for (let i = 0, j = 0; i < thumb.width * thumb.height; i++, j += 3) {
          rgba[i * 4] = thumb.data[j];
          rgba[i * 4 + 1] = thumb.data[j + 1];
          rgba[i * 4 + 2] = thumb.data[j + 2];
          rgba[i * 4 + 3] = 255;
        }
        const full = await createImageBitmap(new ImageData(rgba, thumb.width, thumb.height));
        return fitBitmap(full, maxPixelSize);
      }
      return null;
    });
  }

  async decode(file: File, options: DecodeOptions = {}): Promise<DecodedImage> {
    const settings: LibRawSettings = {
      outputBps: options.outputBits ?? 16,
      useCameraWb: options.useCameraWhiteBalance ?? true,
      halfSize: options.halfSize ?? false,
      userQual: 3, // AHD demosaic
    };
    return this.withLibRaw(file, settings, async (raw) => {
      const img = await raw.imageData();
      if (!img) throw new DecodeError('failed', `${file.name}: no image data`);
      if (img.colors !== 3) throw new DecodeError('unsupported', `${file.name}: ${img.colors} colour channels`);
      return {
        width: img.width,
        height: img.height,
        channels: 3,
        bitsPerSample: img.bits === 16 ? 16 : 8,
        pixels: img.data,
      };
    });
  }

  private async withLibRaw<T>(file: File, settings: LibRawSettings, body: (raw: LibRaw) => Promise<T>): Promise<T> {
    const raw = new LibRaw();
    try {
      await raw.open(new Uint8Array(await file.arrayBuffer()), settings);
      return await body(raw);
    } catch (e) {
      if (e instanceof DecodeError) throw e;
      throw new DecodeError('failed', `${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      raw.dispose();
    }
  }
}

function toExif(m: Metadata): ExifInfo {
  const positive = (v: number | undefined) => (v !== undefined && v > 0 ? v : undefined);
  const date = m.timestamp instanceof Date ? m.timestamp : m.timestamp ? new Date(m.timestamp) : undefined;
  return {
    cameraMake: m.camera_make || undefined,
    cameraModel: m.camera_model || undefined,
    lensModel: m.lens?.Lens || undefined,
    iso: positive(m.iso_speed),
    exposureTime: positive(m.shutter),
    aperture: positive(m.aperture),
    focalLength: positive(m.focal_len),
    captureDate: date && !Number.isNaN(date.getTime()) && date.getTime() > 0 ? date : undefined,
    width: m.width,
    height: m.height,
    orientation: m.flip,
  };
}

/** Downscales a bitmap so its long edge is at most `maxPixelSize`, closing the original. */
export async function fitBitmap(bitmap: ImageBitmap, maxPixelSize: number): Promise<ImageBitmap> {
  const scale = maxPixelSize / Math.max(bitmap.width, bitmap.height);
  if (scale >= 1) return bitmap;
  const resized = await createImageBitmap(bitmap, {
    resizeWidth: Math.round(bitmap.width * scale),
    resizeHeight: Math.round(bitmap.height * scale),
    resizeQuality: 'high',
  });
  bitmap.close();
  return resized;
}
