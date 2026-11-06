import type { DecodedImage } from '../core';

/** Runs the model on one square NCHW float tile (values 0–1); the result is `size * scale` per side. */
export type TileInfer = (tile: Float32Array, size: number) => Promise<Float32Array>;

export interface TiledInferenceOptions {
  infer: TileInfer;
  /** Tile side in model-input pixels. Every tile has this size, so GPU shaders compile only once. */
  tileSize: number;
  /** Context around each tile that is computed and thrown away, hiding seams. */
  pad: number;
  /** The image is shrunk by this factor for the model, whose output is this factor larger. 1 = full resolution. */
  scale: 1 | 2 | 4;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Splits `width × height` into the areas each tile is responsible for; they partition the image exactly. */
export function planTiles(width: number, height: number, inner: number): TileRect[] {
  const tiles: TileRect[] = [];
  for (let y = 0; y < height; y += inner) {
    for (let x = 0; x < width; x += inner) tiles.push({ x, y, width: Math.min(inner, width - x), height: Math.min(inner, height - y) });
  }
  return tiles;
}

/** Mirrors a coordinate into 0..size-1, however far outside it is. */
export function mirror(v: number, size: number): number {
  if (size === 1) return 0;
  const period = 2 * (size - 1);
  const m = ((v % period) + period) % period;
  return m < size ? m : period - m;
}

/** Box-downsamples to planar float RGB (0–1); edges of sizes not divisible by `scale` average what exists. */
export function toPlanar(image: DecodedImage, scale: number): { planes: Float32Array; width: number; height: number } {
  const width = Math.ceil(image.width / scale);
  const height = Math.ceil(image.height / scale);
  const plane = width * height;
  const planes = new Float32Array(plane * 3);
  const unit = 1 / (2 ** image.bitsPerSample - 1);
  for (let y = 0; y < height; y++) {
    const rows = Math.min(scale, image.height - y * scale);
    for (let x = 0; x < width; x++) {
      const cols = Math.min(scale, image.width - x * scale);
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < rows; dy++) {
        let at = ((y * scale + dy) * image.width + x * scale) * 3;
        for (let dx = 0; dx < cols; dx++, at += 3) {
          r += image.pixels[at];
          g += image.pixels[at + 1];
          b += image.pixels[at + 2];
        }
      }
      const norm = unit / (rows * cols);
      const to = y * width + x;
      planes[to] = r * norm;
      planes[plane + to] = g * norm;
      planes[2 * plane + to] = b * norm;
    }
  }
  return { planes, width, height };
}

/** Fills `tile` (NCHW) with the `size`² window at (x0, y0) of the planes, mirrored past the edges. */
function fillTile(tile: Float32Array, planes: Float32Array, width: number, height: number, x0: number, y0: number, size: number) {
  const plane = width * height;
  const tilePlane = size * size;
  for (let y = 0; y < size; y++) {
    const row = mirror(y0 + y, height) * width;
    for (let x = 0; x < size; x++) {
      const from = row + mirror(x0 + x, width);
      const to = y * size + x;
      tile[to] = planes[from];
      tile[tilePlane + to] = planes[plane + from];
      tile[2 * tilePlane + to] = planes[2 * plane + from];
    }
  }
}

/**
 * Runs a model over an image tile by tile and assembles the full-size result. The input is released
 * only by the caller; memory beyond input and output is one tile plus the small planar copy.
 */
export async function runTiled(image: DecodedImage, options: TiledInferenceOptions): Promise<DecodedImage> {
  const { infer, tileSize, pad, scale, signal, onProgress } = options;
  const { planes, width, height } = toPlanar(image, scale);
  const tiles = planTiles(width, height, tileSize - 2 * pad);
  const pixels = image.bitsPerSample === 16 ? new Uint16Array(image.pixels.length) : new Uint8Array(image.pixels.length);
  const maximum = 2 ** image.bitsPerSample - 1;
  const input = new Float32Array(3 * tileSize * tileSize);
  const outSize = tileSize * scale;
  const outPlane = outSize * outSize;

  for (const [index, tile] of tiles.entries()) {
    signal?.throwIfAborted();
    fillTile(input, planes, width, height, tile.x - pad, tile.y - pad, tileSize);
    const result = await infer(input, tileSize);
    const x1 = Math.min(image.width, (tile.x + tile.width) * scale);
    const y1 = Math.min(image.height, (tile.y + tile.height) * scale);
    for (let y = tile.y * scale; y < y1; y++) {
      const row = (y - (tile.y - pad) * scale) * outSize;
      for (let x = tile.x * scale; x < x1; x++) {
        const from = row + x - (tile.x - pad) * scale;
        const to = (y * image.width + x) * 3;
        pixels[to] = Math.round(Math.min(1, Math.max(0, result[from])) * maximum);
        pixels[to + 1] = Math.round(Math.min(1, Math.max(0, result[outPlane + from])) * maximum);
        pixels[to + 2] = Math.round(Math.min(1, Math.max(0, result[2 * outPlane + from])) * maximum);
      }
    }
    onProgress?.(index + 1, tiles.length);
  }
  return { ...image, pixels };
}

const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;
/** Samples used to estimate the noise level; a stride keeps it cheap on 24 MP. */
const NOISE_SAMPLES = 1 << 19;

/** The luma difference source − base of one row, 3-tap box filtered along the row. */
function residualRow(source: DecodedImage, base: DecodedImage, y: number, out: Float32Array) {
  const { width } = source;
  const a = source.pixels;
  const b = base.pixels;
  const row = new Float32Array(width);
  for (let x = 0, at = y * width * 3; x < width; x++, at += 3) {
    row[x] = LUMA_R * (a[at] - b[at]) + LUMA_G * (a[at + 1] - b[at + 1]) + LUMA_B * (a[at + 2] - b[at + 2]);
  }
  for (let x = 0; x < width; x++) out[x] = (row[Math.max(0, x - 1)] + row[x] + row[Math.min(width - 1, x + 1)]) / 3;
}

/** Robust noise level of the smoothed residual (median absolute deviation). */
export function estimateResidualNoise(source: DecodedImage, base: DecodedImage): number {
  const { width, height } = source;
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / NOISE_SAMPLES)));
  const rows: Float32Array[] = [new Float32Array(width), new Float32Array(width), new Float32Array(width)];
  const samples: number[] = [];
  for (let y = 1; y + 1 < height; y += step) {
    for (let i = 0; i < 3; i++) residualRow(source, base, y - 1 + i, rows[i]);
    for (let x = 0; x < width; x += step) samples.push(Math.abs((rows[0][x] + rows[1][x] + rows[2][x]) / 3));
  }
  samples.sort((p, q) => p - q);
  return 1.4826 * (samples[samples.length >> 1] ?? 0);
}

/**
 * Puts real image detail back into a denoised base, on luma only so colour noise stays out.
 * The residual is smoothed 3×3 first, then soft-thresholded at `threshold` noise levels: isolated
 * noise spikes do not pass, continuous structure does. The result replaces `base`'s pixels in place.
 */
export function restoreDetail(source: DecodedImage, base: DecodedImage, threshold: number): void {
  const { width, height } = source;
  const limit = threshold * estimateResidualNoise(source, base);
  const maximum = 2 ** source.bitsPerSample - 1;
  let above = new Float32Array(width);
  let current = new Float32Array(width);
  let below = new Float32Array(width);
  const add = new Float32Array(width);
  residualRow(source, base, 0, current);
  above.set(current);
  for (let y = 0; y < height; y++) {
    residualRow(source, base, Math.min(height - 1, y + 1), below);
    for (let x = 0; x < width; x++) {
      const r = (above[x] + current[x] + below[x]) / 3;
      add[x] = r > limit ? r - limit : r < -limit ? r + limit : 0;
    }
    for (let x = 0, at = y * width * 3; x < width; x++, at += 3) {
      if (add[x] === 0) continue;
      base.pixels[at] = Math.min(maximum, Math.max(0, Math.round(base.pixels[at] + add[x])));
      base.pixels[at + 1] = Math.min(maximum, Math.max(0, Math.round(base.pixels[at + 1] + add[x])));
      base.pixels[at + 2] = Math.min(maximum, Math.max(0, Math.round(base.pixels[at + 2] + add[x])));
    }
    [above, current, below] = [current, below, above];
  }
}
