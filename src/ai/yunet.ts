import type { Face } from '../core';

/** YuNet (OpenCV Zoo face_detection_yunet_2023mar, MIT): fixed input, three detection strides. */
export const YUNET_SIZE = 640;
export const YUNET_STRIDES = [8, 16, 32] as const;
/**
 * Above YuNet's usual 0.6, which fired on a hair-dryer cord and a plush monkey at 0.66–0.74. A missed
 * face only goes unretouched, while a false one has non-skin pixels smoothed, so this errs towards missing.
 */
const SCORE_THRESHOLD = 0.75;
const NMS_IOU = 0.3;

export type YuNetOutputs = Record<string, { data: ArrayLike<number> }>;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Decodes the raw model outputs to faces in input-tensor pixels, without NMS. */
export function decodeYuNet(outputs: YuNetOutputs, threshold = SCORE_THRESHOLD): Face[] {
  const faces: Face[] = [];
  for (const stride of YUNET_STRIDES) {
    const cols = YUNET_SIZE / stride;
    const cls = outputs[`cls_${stride}`].data;
    const obj = outputs[`obj_${stride}`].data;
    const bbox = outputs[`bbox_${stride}`].data;
    const kps = outputs[`kps_${stride}`].data;
    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(clamp01(cls[i]) * clamp01(obj[i]));
      if (score < threshold) continue;
      const row = Math.floor(i / cols);
      const col = i % cols;
      const cx = (col + bbox[i * 4]) * stride;
      const cy = (row + bbox[i * 4 + 1]) * stride;
      const width = Math.exp(bbox[i * 4 + 2]) * stride;
      const height = Math.exp(bbox[i * 4 + 3]) * stride;
      const point = (n: number) => ({ x: (kps[i * 10 + n * 2] + col) * stride, y: (kps[i * 10 + n * 2 + 1] + row) * stride });
      faces.push({
        x: cx - width / 2,
        y: cy - height / 2,
        width,
        height,
        score,
        landmarks: { eyeLeft: point(0), eyeRight: point(1), nose: point(2), mouthLeft: point(3), mouthRight: point(4) },
      });
    }
  }
  return faces;
}

function iou(a: Face, b: Face): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const overlap = w * h;
  return overlap / (a.width * a.height + b.width * b.height - overlap);
}

/** Non-maximum suppression, best score first. */
export function suppressOverlaps(faces: Face[], threshold = NMS_IOU): Face[] {
  const kept: Face[] = [];
  for (const face of [...faces].sort((a, b) => b.score - a.score)) {
    if (kept.every((k) => iou(k, face) < threshold)) kept.push(face);
  }
  return kept;
}

/** A square of the image fed to the detector: the source rectangle and its scale to tensor pixels. */
export interface DetectionWindow {
  x: number;
  y: number;
  /** Source pixels covered per side. */
  size: number;
}

/**
 * Windows covering the image: one over the whole frame for large faces, plus overlapping crops so
 * that small faces in a group shot still reach the detector at a usable size.
 */
export function planDetectionWindows(width: number, height: number): DetectionWindow[] {
  const longEdge = Math.max(width, height);
  const windows: DetectionWindow[] = [{ x: 0, y: 0, size: longEdge }];
  if (longEdge <= YUNET_SIZE * 1.5) return windows;
  const size = Math.ceil(longEdge / 3);
  const step = Math.floor(size * 0.75);
  const starts = (extent: number) => {
    const list: number[] = [];
    for (let at = 0; at + size < extent; at += step) list.push(at);
    list.push(Math.max(0, extent - size));
    return list;
  };
  for (const y of starts(height)) for (const x of starts(width)) windows.push({ x, y, size });
  return windows;
}

/** Maps a face from tensor pixels of `window` to image pixels. */
export function toImageSpace(face: Face, window: DetectionWindow): Face {
  const scale = window.size / YUNET_SIZE;
  const map = (p: { x: number; y: number }) => ({ x: window.x + p.x * scale, y: window.y + p.y * scale });
  const { eyeLeft, eyeRight, nose, mouthLeft, mouthRight } = face.landmarks;
  return {
    ...map(face),
    width: face.width * scale,
    height: face.height * scale,
    score: face.score,
    landmarks: { eyeLeft: map(eyeLeft), eyeRight: map(eyeRight), nose: map(nose), mouthLeft: map(mouthLeft), mouthRight: map(mouthRight) },
  };
}
