import { DEFAULT_EXPORT_OPTIONS, exifFields, readExifBlock, type PhotoAsset, type ProcessingOptions } from '../core';
import { BatchQueue, WorkerPhotoProcessor, type ProcessedPhoto } from '../batch';
import { DecoderRouter } from '../decoding';

/** A finished photo as e2e sees it: blobs cannot cross `page.evaluate`. */
type PhotoReport = Omit<ProcessedPhoto, 'blob'> & { bytes: number; exif: ReturnType<typeof exifFields> | null; hash: number };

async function report({ blob, ...info }: ProcessedPhoto): Promise<PhotoReport> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const block = readExifBlock(bytes);
  let hash = 0;
  for (let i = 0; i < bytes.length; i += 4099) hash = (hash * 31 + bytes[i]) >>> 0;
  return { ...info, bytes: bytes.length, exif: block && exifFields(block), hash };
}

/**
 * Test hooks used by e2e: `__decodeLastImport` fully decodes the most recently imported file and
 * reports its dimensions, bit depth, a pixel checksum and the decode time; `__batch` drives the
 * batch queue, which has no UI yet (phase 3).
 */
export function installDevHooks(router: DecoderRouter, lastImported: () => File | undefined, assets: () => PhotoAsset[]) {
  const hooks = window as unknown as Record<string, unknown>;
  hooks.__decodeLastImport = async () => {
    const file = lastImported();
    if (!file) return null;
    const t0 = performance.now();
    const img = await router.decode(file);
    const ms = performance.now() - t0;
    let sum = 0;
    for (let i = 0; i < img.pixels.length; i += 997) sum += img.pixels[i];
    return { name: file.name, width: img.width, height: img.height, channels: img.channels, bitsPerSample: img.bitsPerSample, samples: img.pixels.length, checksum: sum, ms: Math.round(ms) };
  };

  let queue: BatchQueue | undefined;
  let photos: PhotoReport[] = [];
  let outputs: Blob[] = [];
  let finished: Promise<unknown> | undefined;
  hooks.__batch = {
    start(options: Partial<ProcessingOptions>) {
      photos = [];
      outputs = [];
      const processor = new WorkerPhotoProcessor();
      const all: ProcessingOptions = { denoise: 'medium', retouch: true, export: DEFAULT_EXPORT_OPTIONS, ...options };
      queue = new BatchQueue(assets(), all, processor, {
        write: async (p) => {
          outputs.push(p.blob);
          photos.push(await report(p));
        },
      });
      finished = queue.start().finally(() => processor.dispose());
    },
    pause: () => queue?.pause(),
    resume: () => queue?.resume(),
    cancel: () => queue?.cancel(),
    snapshot: () => queue?.snapshot(),
    photos: () => photos,
    /** The exported JPG of the i-th finished photo, as base64. */
    output: async (i: number) => {
      const bytes = new Uint8Array(await outputs[i].arrayBuffer());
      let binary = '';
      for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
      return btoa(binary);
    },
    wait: async () => {
      await finished;
      return { snapshot: queue?.snapshot(), photos };
    },
  };
}
