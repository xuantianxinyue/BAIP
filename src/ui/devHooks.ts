import { DecoderRouter } from '../decoding';

/**
 * Test hook used by e2e/phase1.spec.ts: fully decodes the most recently imported file and
 * reports its dimensions, bit depth, a pixel checksum and the decode time.
 */
export function installDevHooks(router: DecoderRouter, lastImported: () => File | undefined) {
  (window as unknown as Record<string, unknown>).__decodeLastImport = async () => {
    const file = lastImported();
    if (!file) return null;
    const t0 = performance.now();
    const img = await router.decode(file);
    const ms = performance.now() - t0;
    let sum = 0;
    for (let i = 0; i < img.pixels.length; i += 997) sum += img.pixels[i];
    return { name: file.name, width: img.width, height: img.height, channels: img.channels, bitsPerSample: img.bitsPerSample, samples: img.pixels.length, checksum: sum, ms: Math.round(ms) };
  };
}
