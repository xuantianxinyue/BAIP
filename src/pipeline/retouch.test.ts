import { describe, expect, it } from 'vitest';
import type { DecodedImage, Face } from '../core';
import { boxBlur, retouchFaces } from './retouch';

const SIZE = 400;
const FACE: Face = {
  x: 100,
  y: 100,
  width: 200,
  height: 200,
  score: 0.9,
  landmarks: { eyeLeft: { x: 160, y: 170 }, eyeRight: { x: 240, y: 170 }, nose: { x: 200, y: 210 }, mouthLeft: { x: 170, y: 255 }, mouthRight: { x: 230, y: 255 } },
};

/** Deterministic noise, so the tests do not flake. */
function noise(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5) * 2;
}

/** Skin-coloured frame with pore noise, a dark blemish on a cheek and dark eyes on a grey background. */
function portrait(bits: 8 | 16): DecodedImage {
  const max = 2 ** bits - 1;
  const pixels = bits === 16 ? new Uint16Array(SIZE * SIZE * 3) : new Uint8Array(SIZE * SIZE * 3);
  const random = noise(1);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const inFace = Math.hypot((x - 200) / 100, (y - 200) / 110) < 1;
      const grain = random() * 0.02;
      let [r, g, b] = inFace ? [0.82, 0.62, 0.52] : [0.4, 0.4, 0.42];
      if (Math.hypot(x - 150, y - 225) < 5) [r, g, b] = [0.62, 0.42, 0.36];
      for (const eye of [FACE.landmarks.eyeLeft, FACE.landmarks.eyeRight]) if (Math.hypot(x - eye.x, (y - eye.y) * 2) < 16) [r, g, b] = [0.12, 0.1, 0.1];
      const at = (y * SIZE + x) * 3;
      pixels[at] = (r + grain) * max;
      pixels[at + 1] = (g + grain) * max;
      pixels[at + 2] = (b + grain) * max;
    }
  }
  return { width: SIZE, height: SIZE, channels: 3, bitsPerSample: bits, pixels };
}

const at = (image: DecodedImage, x: number, y: number, channel = 1) => image.pixels[(y * SIZE + x) * 3 + channel] / (2 ** image.bitsPerSample - 1);

function deviation(image: DecodedImage, x0: number, y0: number, size: number): number {
  const values: number[] = [];
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) values.push(at(image, x, y));
  const mean = values.reduce((a, b) => a + b) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
}

describe.each([8, 16] as const)('retouchFaces (%s bit)', (bits) => {
  const source = portrait(bits);
  const before = source.pixels.slice();
  const result = retouchFaces(source, [FACE]);

  it('does not mutate its input', () => {
    expect(source.pixels).toEqual(before);
  });

  it('reduces skin texture without erasing it', () => {
    const was = deviation(source, 230, 215, 30);
    const now = deviation(result, 230, 215, 30);
    expect(now).toBeLessThan(was * 0.85);
    expect(now).toBeGreaterThan(was * 0.15);
  });

  it('keeps a smile line: it is long, not a spot', () => {
    const lined = portrait(bits);
    const max = 2 ** bits - 1;
    for (let y = 226; y < 229; y++) {
      for (let x = 225; x < 275; x++) for (const [c, v] of [0.62, 0.42, 0.36].entries()) lined.pixels[(y * SIZE + x) * 3 + c] = v * max;
    }
    const out = retouchFaces(lined, [FACE]);
    const depth = (image: DecodedImage) => at(image, 250, 235) - at(image, 250, 227);
    expect(depth(out)).toBeGreaterThan(depth(lined) * 0.7);
  });

  it('mostly removes a blemish', () => {
    const skin = at(source, 250, 225);
    expect(Math.abs(at(result, 150, 225) - skin)).toBeLessThan(Math.abs(at(source, 150, 225) - skin) * 0.5);
  });

  it('leaves the eyes alone', () => {
    expect(at(result, 160, 170)).toBeCloseTo(at(source, 160, 170), 2);
    expect(at(result, 240, 170)).toBeCloseTo(at(source, 240, 170), 2);
  });

  it('does not touch anything outside the face region', () => {
    for (const [x, y] of [[10, 10], [390, 390], [40, 200], [200, 60]]) expect(at(result, x, y)).toBe(at(source, x, y));
  });
});

describe('retouchFaces', () => {
  it('returns the same image when there are no faces', () => {
    const image = portrait(8);
    expect(retouchFaces(image, [])).toBe(image);
  });

  it('skips faces too small to retouch', () => {
    const image = portrait(8);
    const tiny = { ...FACE, width: 20, height: 20 };
    expect(retouchFaces(image, [tiny]).pixels).toEqual(image.pixels);
  });

  it('handles a face cut off by the frame', () => {
    const shift = (p: { x: number; y: number }) => ({ x: p.x - 190, y: p.y - 190 });
    const { eyeLeft, eyeRight, nose, mouthLeft, mouthRight } = FACE.landmarks;
    const cut = { ...FACE, x: -90, y: -90, landmarks: { eyeLeft: shift(eyeLeft), eyeRight: shift(eyeRight), nose: shift(nose), mouthLeft: shift(mouthLeft), mouthRight: shift(mouthRight) } };
    expect(() => retouchFaces(portrait(8), [cut])).not.toThrow();
  });
});

describe('boxBlur', () => {
  it('keeps a constant image constant and averages a window', () => {
    expect([...boxBlur(new Float32Array(25).fill(3), 5, 5, 1)].every((v) => Math.abs(v - 3) < 1e-5)).toBe(true);
    const spike = new Float32Array(25);
    spike[12] = 9;
    expect(boxBlur(spike, 5, 5, 1)[12]).toBeCloseTo(1);
  });
});
