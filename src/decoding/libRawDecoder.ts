import type LibRaw from 'libraw-wasm';
import type { LibRawSettings, Metadata } from 'libraw-wasm';
import { DecodeError, flipToRotation, importPublicModule, jpegExifOrientation, type DecodeOptions, type DecodedImage, type ExifInfo, type ImageDecoder, type ImageKind } from '../core';
import { fitBitmap, rotateBitmap } from './bitmapTools';

/**
 * Decodes camera RAW files with LibRaw compiled to WASM (libraw-wasm).
 *
 * libraw-wasm is loaded at runtime from public/vendor/libraw (see scripts/copy-vendor.mjs) so its
 * worker and wasm resolve via `import.meta.url` without going through the bundler.
 * Each call uses its own LibRaw instance (= its own Web Worker) and disposes it afterwards,
 * so the WASM heap of one file is released before the next one is opened.
 * Performance: `decode` runs full demosaicing on the CPU; for a 24 MP file this is the
 * dominant cost of the pipeline, so previews should use `embeddedPreview` instead.
 */
let libRawClass: Promise<typeof LibRaw> | undefined;

function loadLibRaw(): Promise<typeof LibRaw> {
  libRawClass ??= importPublicModule<{ default: typeof LibRaw }>('vendor/libraw/index.js').then((m) => m.default);
  return libRawClass;
}

export class LibRawDecoder implements ImageDecoder {
  readonly id = 'libraw-wasm';

  canDecode(kind: ImageKind): boolean {
    return kind === 'raw';
  }

  async readMetadata(file: File): Promise<ExifInfo> {
    return this.withLibRaw(file, {}, undefined, async (raw) => {
      const meta = await raw.metadata(true);
      if (!meta) throw new DecodeError('corrupt', `${file.name}: no metadata`);
      return toExif(meta);
    });
  }

  /**
   * The embedded camera JPEG, upright. LibRaw's metadata dimensions and full decode are already
   * rotated by `flip`; the embedded JPEG is rotated by the browser only if it carries its own EXIF
   * Orientation tag, so it is rotated here by hand when that tag is missing.
   */
  async embeddedPreview(file: File, maxPixelSize: number): Promise<ImageBitmap | null> {
    return this.withLibRaw(file, {}, undefined, async (raw) => {
      const meta = await raw.metadata(true);
      const rotation = flipToRotation(meta?.flip ?? 0);
      const thumb = await raw.thumbnailData();
      if (!thumb || thumb.data.length === 0) return null;
      if (thumb.format === 'jpeg') {
        const bytes = thumb.data as Uint8Array<ArrayBuffer>;
        const full = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
        const upright = jpegExifOrientation(bytes) === undefined ? await rotateBitmap(full, rotation) : full;
        return fitBitmap(upright, maxPixelSize);
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
        return fitBitmap(await rotateBitmap(full, rotation), maxPixelSize);
      }
      return null;
    });
  }

  async decode(file: File, options: DecodeOptions = {}, signal?: AbortSignal): Promise<DecodedImage> {
    const settings: LibRawSettings = {
      outputBps: options.outputBits ?? 16,
      useCameraWb: options.useCameraWhiteBalance ?? true,
      halfSize: options.halfSize ?? false,
      userQual: 3, // AHD demosaic
    };
    return this.withLibRaw(file, settings, signal, async (raw) => {
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

  /** Runs `body` on a fresh LibRaw worker; aborting `signal` disposes the worker immediately. */
  private async withLibRaw<T>(file: File, settings: LibRawSettings, signal: AbortSignal | undefined, body: (raw: LibRaw) => Promise<T>): Promise<T> {
    const aborted = () => new DecodeError('aborted', `${file.name}: 已取消`);
    if (signal?.aborted) throw aborted();
    const LibRawClass = await loadLibRaw();
    const raw = new LibRawClass();
    const onAbort = () => raw.dispose();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      await raw.open(new Uint8Array(await file.arrayBuffer()), settings);
      return await body(raw);
    } catch (e) {
      if (signal?.aborted) throw aborted();
      if (e instanceof DecodeError) throw e;
      throw new DecodeError('failed', `${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      signal?.removeEventListener('abort', onAbort);
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
