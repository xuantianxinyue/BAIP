import { describe, expect, it } from 'vitest';
import type { Face } from '../core';
import { decodeYuNet, planDetectionWindows, suppressOverlaps, toImageSpace, YUNET_SIZE, YUNET_STRIDES, type YuNetOutputs } from './yunet';

const point = { x: 0, y: 0 };
const face = (x: number, y: number, size: number, score: number): Face => ({
  x,
  y,
  width: size,
  height: size,
  score,
  landmarks: { eyeLeft: point, eyeRight: point, nose: point, mouthLeft: point, mouthRight: point },
});

function blankOutputs(): YuNetOutputs {
  const out: YuNetOutputs = {};
  for (const s of YUNET_STRIDES) {
    const n = (YUNET_SIZE / s) ** 2;
    out[`cls_${s}`] = { data: new Float32Array(n) };
    out[`obj_${s}`] = { data: new Float32Array(n) };
    out[`bbox_${s}`] = { data: new Float32Array(n * 4) };
    out[`kps_${s}`] = { data: new Float32Array(n * 10) };
  }
  return out;
}

describe('decodeYuNet', () => {
  it('decodes a detection from the grid cell, stride and log-size', () => {
    const outputs = blankOutputs();
    const cols = YUNET_SIZE / 16;
    const cell = 5 * cols + 7; // row 5, col 7
    (outputs.cls_16.data as Float32Array)[cell] = 0.81;
    (outputs.obj_16.data as Float32Array)[cell] = 1;
    (outputs.bbox_16.data as Float32Array).set([0.5, 0.25, Math.log(4), Math.log(2)], cell * 4);
    (outputs.kps_16.data as Float32Array).set([1, 2], cell * 10);
    const [f, ...rest] = decodeYuNet(outputs);
    expect(rest).toEqual([]);
    expect(f.score).toBeCloseTo(0.9);
    expect(f.width).toBeCloseTo(64);
    expect(f.height).toBeCloseTo(32);
    expect(f.x + f.width / 2).toBeCloseTo(7.5 * 16);
    expect(f.y + f.height / 2).toBeCloseTo(5.25 * 16);
    expect(f.landmarks.eyeLeft).toEqual({ x: 8 * 16, y: 7 * 16 });
  });

  it('ignores low scores and clamps out-of-range ones', () => {
    const outputs = blankOutputs();
    (outputs.cls_8.data as Float32Array)[0] = 0.2;
    (outputs.obj_8.data as Float32Array)[0] = 0.2;
    (outputs.cls_8.data as Float32Array)[1] = 1.5;
    (outputs.obj_8.data as Float32Array)[1] = 1.5;
    const faces = decodeYuNet(outputs);
    expect(faces).toHaveLength(1);
    expect(faces[0].score).toBe(1);
  });
});

describe('suppressOverlaps', () => {
  it('keeps the best of overlapping boxes and all separate ones', () => {
    const kept = suppressOverlaps([face(0, 0, 100, 0.7), face(5, 5, 100, 0.9), face(300, 300, 50, 0.65)]);
    expect(kept.map((f) => f.score)).toEqual([0.9, 0.65]);
  });
});

describe('planDetectionWindows', () => {
  it('uses one window for small images', () => {
    expect(planDetectionWindows(640, 480)).toEqual([{ x: 0, y: 0, size: 640 }]);
  });

  it('covers every pixel of a 24 MP frame with overlapping crops', () => {
    const [whole, ...crops] = planDetectionWindows(6000, 4000);
    expect(whole.size).toBe(6000);
    for (const [px, py] of [[0, 0], [5999, 3999], [3000, 2000], [5999, 0]]) {
      expect(crops.some((w) => px >= w.x && px < w.x + w.size && py >= w.y && py < w.y + w.size)).toBe(true);
    }
    expect(crops.every((w) => w.x + w.size <= 6000 && w.y + w.size <= 4000)).toBe(true);
    expect(crops.length).toBeLessThanOrEqual(12);
  });
});

describe('toImageSpace', () => {
  it('maps tensor pixels through the window scale and offset', () => {
    const mapped = toImageSpace(face(64, 128, 32, 0.8), { x: 1000, y: 500, size: 1280 });
    expect(mapped).toMatchObject({ x: 1128, y: 756, width: 64, height: 64, score: 0.8 });
    expect(mapped.landmarks.nose).toEqual({ x: 1000, y: 500 });
  });
});
