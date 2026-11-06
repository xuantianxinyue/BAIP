import { describe, expect, it } from 'vitest';
import type { DecodedImage } from '../core';
import { estimateResidualNoise, mirror, planTiles, restoreDetail, runTiled, toPlanar, type TileInfer } from './tiledInference';

function gradient(width: number, height: number, bits: 8 | 16 = 16): DecodedImage {
  const max = 2 ** bits - 1;
  const pixels = bits === 16 ? new Uint16Array(width * height * 3) : new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 3;
      pixels[at] = Math.round((x / (width - 1)) * max);
      pixels[at + 1] = Math.round((y / (height - 1)) * max);
      pixels[at + 2] = Math.round(((x + y) / (width + height - 2)) * max);
    }
  }
  return { width, height, channels: 3, bitsPerSample: bits, pixels };
}

/** Stands in for the model: nearest-neighbour upscale by `scale`, i.e. what the net does to flat areas. */
const upscaler = (scale: number): TileInfer => async (tile, size) => {
  const outSize = size * scale;
  const out = new Float32Array(3 * outSize * outSize);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < outSize; y++) {
      for (let x = 0; x < outSize; x++) {
        out[c * outSize * outSize + y * outSize + x] = tile[c * size * size + Math.floor(y / scale) * size + Math.floor(x / scale)];
      }
    }
  }
  return out;
};

describe('planTiles', () => {
  it('partitions the image exactly', () => {
    const tiles = planTiles(100, 70, 32);
    const seen = new Uint8Array(100 * 70);
    for (const t of tiles) for (let y = t.y; y < t.y + t.height; y++) for (let x = t.x; x < t.x + t.width; x++) seen[y * 100 + x]++;
    expect(seen.every((v) => v === 1)).toBe(true);
  });
});

describe('mirror', () => {
  it('reflects at both edges, even far outside', () => {
    expect([-2, -1, 0, 4, 5, 6].map((v) => mirror(v, 5))).toEqual([2, 1, 0, 4, 3, 2]);
    expect(mirror(-17, 3)).toBeGreaterThanOrEqual(0);
    expect(mirror(9, 1)).toBe(0);
  });
});

describe('toPlanar', () => {
  it('box-averages and handles sizes the scale does not divide', () => {
    const pixels = new Uint8Array(3 * 3 * 3).fill(0);
    pixels[0] = 255; // top-left red
    const { planes, width, height } = toPlanar({ width: 3, height: 3, channels: 3, bitsPerSample: 8, pixels }, 2);
    expect([width, height]).toEqual([2, 2]);
    expect(planes[0]).toBeCloseTo(0.25);
    expect(planes[3]).toBe(0);
  });
});

describe('runTiled', () => {
  it.each([1, 2, 4] as const)('reassembles the image without seams at scale %s', async (scale) => {
    const image = gradient(203, 131);
    const out = await runTiled(image, { infer: upscaler(scale), tileSize: 48, pad: 8, scale });
    let worst = 0;
    for (let i = 0; i < image.pixels.length; i++) worst = Math.max(worst, Math.abs(out.pixels[i] - image.pixels[i]));
    expect(worst / 65535).toBeLessThan((scale * 2) / 131);
  });

  it('is exact at scale 1, and leaves the input alone', async () => {
    const image = gradient(100, 60, 8);
    const before = image.pixels.slice();
    const out = await runTiled(image, { infer: upscaler(1), tileSize: 32, pad: 4, scale: 1 });
    expect(out.pixels).toEqual(image.pixels);
    expect(image.pixels).toEqual(before);
  });

  it('sends every tile at the same size and reports progress', async () => {
    const sizes = new Set<number>();
    const progress: number[] = [];
    await runTiled(gradient(70, 45), { infer: (t, s) => (sizes.add(s), upscaler(1)(t, s)), tileSize: 32, pad: 4, scale: 1, onProgress: (d) => progress.push(d) });
    expect([...sizes]).toEqual([32]);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('handles an image smaller than one tile', async () => {
    const image = gradient(10, 7);
    expect((await runTiled(image, { infer: upscaler(1), tileSize: 32, pad: 4, scale: 1 })).pixels).toEqual(image.pixels);
  });

  it('stops at the next tile when aborted', async () => {
    const abort = new AbortController();
    let calls = 0;
    const infer: TileInfer = (t, s) => {
      if (++calls === 2) abort.abort();
      return upscaler(1)(t, s);
    };
    await expect(runTiled(gradient(100, 100), { infer, tileSize: 32, pad: 4, scale: 1, signal: abort.signal })).rejects.toThrow();
    expect(calls).toBe(2);
  });
});

describe('restoreDetail', () => {
  /** Flat grey base; the source adds pseudo-random noise plus one bright line. */
  function scene() {
    const width = 128;
    const height = 128;
    const base: DecodedImage = { width, height, channels: 3, bitsPerSample: 16, pixels: new Uint16Array(width * height * 3).fill(30000) };
    const pixels = new Uint16Array(base.pixels);
    let s = 7;
    for (let i = 0; i < width * height; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const n = (s / 2 ** 32 - 0.5) * 2000;
      for (let c = 0; c < 3; c++) pixels[i * 3 + c] += n;
    }
    for (let y = 0; y < height; y++) for (let dx = 0; dx < 3; dx++) for (let c = 0; c < 3; c++) pixels[(y * width + 64 + dx) * 3 + c] += 8000;
    return { source: { ...base, pixels } as DecodedImage, base };
  }
  const luma = (image: DecodedImage, x: number, y: number) => image.pixels[(y * image.width + x) * 3 + 1];

  it('estimates a positive noise level, and zero for identical images', () => {
    const { source, base } = scene();
    expect(estimateResidualNoise(source, base)).toBeGreaterThan(0);
    expect(estimateResidualNoise(source, source)).toBe(0);
  });

  it('brings back structure and leaves noise out', () => {
    const { source, base } = scene();
    restoreDetail(source, base, 2);
    expect(luma(base, 65, 60) - 30000).toBeGreaterThan(4000);
    let flat = 0;
    for (let x = 5; x < 50; x++) flat += Math.abs(luma(base, x, 60) - 30000);
    expect(flat / 45).toBeLessThan(100);
  });

  it('shifts all channels equally, so colour stays that of the base', () => {
    const { source, base } = scene();
    for (let i = 0; i < base.pixels.length; i += 3) base.pixels[i] = 28000;
    restoreDetail(source, base, 2);
    const at = (60 * 128 + 65) * 3;
    expect(base.pixels[at + 1] - base.pixels[at]).toBe(2000);
  });

  it('never overflows the sample range', () => {
    const { source, base } = scene();
    source.pixels.fill(65535);
    base.pixels.fill(65000);
    base.pixels[100] = 0;
    expect(() => restoreDetail(source, base, 0.1)).not.toThrow();
    expect(Math.max(...base.pixels)).toBeLessThanOrEqual(65535);
  });
});
