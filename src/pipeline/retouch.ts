import type { DecodedImage, Face, Point } from '../core';

/**
 * Natural skin retouch, deliberately without parameters.
 *
 * Works on the luminance of each face region, split into a smooth base (edge-preserving guided
 * filter) and fine detail. Inside a soft skin mask the detail is attenuated, not removed, so pores
 * survive; small dark blemishes are replaced by their surroundings; skin colour is evened out.
 * Eyes, brows and lips are excluded from the mask and nothing outside the face region is touched.
 */
const DETAIL_KEPT = 0.45;
const SKIN_BLEND = 0.75;
const TONE_BLEND = 0.5;
const BLEMISH_CONTRAST = 0.018;
const BLEMISH_FULL = 0.05;
/** Skin chroma tolerance around the face's own median, in 0–1 YCbCr units. */
const SKIN_CHROMA_RADIUS = 0.07;
/** Faces smaller than this have no skin texture worth retouching. */
const MIN_FACE_PIXELS = 48;

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

function faceRegion(face: Face, width: number, height: number): Region {
  const padX = face.width * 0.15;
  const padY = face.height * 0.15;
  const x = Math.max(0, Math.floor(face.x - padX));
  const y = Math.max(0, Math.floor(face.y - padY));
  return { x, y, width: Math.min(width, Math.ceil(face.x + face.width + padX)) - x, height: Math.min(height, Math.ceil(face.y + face.height + padY)) - y };
}

/** Mean over a (2r+1)² window with edge clamping, O(1) per pixel via a separable running sum. */
export function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const horizontal = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const size = 2 * radius + 1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += src[row + Math.min(width - 1, Math.max(0, i))];
    for (let x = 0; x < width; x++) {
      horizontal[row + x] = sum / size;
      sum += src[row + Math.min(width - 1, x + radius + 1)] - src[row + Math.max(0, x - radius)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += horizontal[Math.min(height - 1, Math.max(0, i)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / size;
      sum += horizontal[Math.min(height - 1, y + radius + 1) * width + x] - horizontal[Math.max(0, y - radius) * width + x];
    }
  }
  return out;
}

/** Self-guided filter (He et al.): smooths flat areas, keeps edges whose variance exceeds `epsilon`. */
function guidedFilter(src: Float32Array, width: number, height: number, radius: number, epsilon: number): Float32Array {
  const mean = boxBlur(src, width, height, radius);
  const squares = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) squares[i] = src[i] * src[i];
  const meanSquares = boxBlur(squares, width, height, radius);
  const a = squares;
  const b = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    const variance = Math.max(0, meanSquares[i] - mean[i] * mean[i]);
    a[i] = variance / (variance + epsilon);
    b[i] = mean[i] * (1 - a[i]);
  }
  const meanA = boxBlur(a, width, height, radius);
  const meanB = boxBlur(b, width, height, radius);
  const out = meanA;
  for (let i = 0; i < src.length; i++) out[i] = meanA[i] * src[i] + meanB[i];
  return out;
}

const smoothstep = (edge0: number, edge1: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] ?? 0;
}

interface Planes {
  luma: Float32Array;
  cb: Float32Array;
  cr: Float32Array;
}

function readPlanes(image: DecodedImage, region: Region, scale: number): Planes {
  const size = region.width * region.height;
  const planes: Planes = { luma: new Float32Array(size), cb: new Float32Array(size), cr: new Float32Array(size) };
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const at = ((region.y + y) * image.width + region.x + x) * 3;
      const r = image.pixels[at] * scale;
      const g = image.pixels[at + 1] * scale;
      const b = image.pixels[at + 2] * scale;
      const i = y * region.width + x;
      planes.luma[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      planes.cb[i] = (b - planes.luma[i]) * 0.564;
      planes.cr[i] = (r - planes.luma[i]) * 0.713;
    }
  }
  return planes;
}

/** Soft weight inside an ellipse: 1 in the middle, falling to 0 over the outer `feather` of the radius. */
function ellipse(x: number, y: number, centre: Point, rx: number, ry: number, feather: number): number {
  const d = Math.hypot((x - centre.x) / rx, (y - centre.y) / ry);
  return 1 - smoothstep(1 - feather, 1, d);
}

/** Skin weight per pixel of the region: face oval × skin chroma × not an eye, brow or lip. */
function skinMask(face: Face, region: Region, { cb, cr }: Planes): Float32Array {
  const { eyeLeft, eyeRight, nose, mouthLeft, mouthRight } = face.landmarks;
  const local = (p: Point): Point => ({ x: p.x - region.x, y: p.y - region.y });
  const [eyeL, eyeR, mouthL, mouthR, noseP] = [eyeLeft, eyeRight, mouthLeft, mouthRight, nose].map(local);
  const eyeGap = Math.max(1, Math.hypot(eyeR.x - eyeL.x, eyeR.y - eyeL.y));
  const centre = { x: face.x + face.width / 2 - region.x, y: face.y + face.height / 2 - region.y };
  const mouthCentre = { x: (mouthL.x + mouthR.x) / 2, y: (mouthL.y + mouthR.y) / 2 };
  const mouthWidth = Math.max(1, Math.hypot(mouthR.x - mouthL.x, mouthR.y - mouthL.y));

  // The face's own skin colour, sampled on the cheeks: works for any skin tone and white balance.
  const cheek = eyeGap * 0.25;
  const cbSamples: number[] = [];
  const crSamples: number[] = [];
  for (const anchor of [{ x: (eyeL.x + mouthL.x) / 2, y: (eyeL.y + mouthL.y) / 2 }, { x: (eyeR.x + mouthR.x) / 2, y: (eyeR.y + mouthR.y) / 2 }, noseP]) {
    for (let dy = -cheek; dy <= cheek; dy += Math.max(1, cheek / 4)) {
      for (let dx = -cheek; dx <= cheek; dx += Math.max(1, cheek / 4)) {
        const x = Math.round(anchor.x + dx);
        const y = Math.round(anchor.y + dy);
        if (x < 0 || y < 0 || x >= region.width || y >= region.height) continue;
        cbSamples.push(cb[y * region.width + x]);
        crSamples.push(cr[y * region.width + x]);
      }
    }
  }
  const skinCb = median(cbSamples);
  const skinCr = median(crSamples);

  const mask = new Float32Array(region.width * region.height);
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const i = y * region.width + x;
      let weight = ellipse(x, y, centre, face.width * 0.56, face.height * 0.62, 0.25);
      if (weight === 0) continue;
      weight *= 1 - smoothstep(SKIN_CHROMA_RADIUS * 0.6, SKIN_CHROMA_RADIUS, Math.hypot(cb[i] - skinCb, cr[i] - skinCr));
      for (const eye of [eyeL, eyeR]) {
        weight *= 1 - ellipse(x, y, eye, eyeGap * 0.42, eyeGap * 0.3, 0.4);
        weight *= 1 - ellipse(x, y, { x: eye.x, y: eye.y - eyeGap * 0.32 }, eyeGap * 0.45, eyeGap * 0.17, 0.4);
      }
      weight *= 1 - ellipse(x, y, mouthCentre, mouthWidth * 0.68, mouthWidth * 0.42, 0.4);
      mask[i] = weight;
    }
  }
  return boxBlur(mask, region.width, region.height, Math.max(1, Math.round(eyeGap / 40)));
}

/**
 * How much darker each pixel is than its surroundings, taken as the minimum
 * over eight directions at `radius`. A spot is darker in all of them; a smile line or a strand of
 * hair is not along its own length, and a jaw edge is not on its dark side. Those must stay.
 */
function spotContrast(luma: Float32Array, width: number, height: number, radius: number): Float32Array {
  const soft = boxBlur(luma, width, height, 1);
  const diagonal = Math.round(radius * Math.SQRT1_2);
  const offsets = [[radius, 0], [-radius, 0], [0, radius], [0, -radius], [diagonal, diagonal], [diagonal, -diagonal], [-diagonal, diagonal], [-diagonal, -diagonal]];
  const contrast = new Float32Array(luma.length);
  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const i = y * width + x;
      let lowest = Infinity;
      for (const [dx, dy] of offsets) lowest = Math.min(lowest, soft[i + dy * width + dx]);
      contrast[i] = lowest - soft[i];
    }
  }
  return contrast;
}

function retouchFace(image: DecodedImage, out: DecodedImage, face: Face, scale: number) {
  const region = faceRegion(face, image.width, image.height);
  if (region.width < MIN_FACE_PIXELS || region.height < MIN_FACE_PIXELS) return;
  const { width, height } = region;
  const planes = readPlanes(image, region, scale);
  const mask = skinMask(face, region, planes);

  const smoothRadius = Math.max(2, Math.round(face.width / 40));
  const base = guidedFilter(planes.luma, width, height, smoothRadius, 0.0009);
  const blemishRadius = Math.max(3, Math.round(face.width / 22));
  const surround = boxBlur(planes.luma, width, height, blemishRadius);
  const contrast = spotContrast(planes.luma, width, height, blemishRadius);
  const blemish = new Float32Array(planes.luma.length);
  for (let i = 0; i < blemish.length; i++) blemish[i] = smoothstep(BLEMISH_CONTRAST, BLEMISH_FULL, contrast[i]) * mask[i];
  const spread = boxBlur(blemish, width, height, Math.max(1, Math.round(face.width / 100)));
  const toneRadius = Math.max(3, Math.round(face.width / 16));
  const cbSmooth = boxBlur(planes.cb, width, height, toneRadius);
  const crSmooth = boxBlur(planes.cr, width, height, toneRadius);

  const maximum = 2 ** image.bitsPerSample - 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const weight = mask[i];
      if (weight === 0) continue;
      const luma = planes.luma[i];
      const smooth = base[i] + DETAIL_KEPT * (luma - base[i]);
      const repair = Math.min(1, spread[i] * 2);
      const target = smooth + (surround[i] - smooth) * repair;
      const dLuma = (target - luma) * weight * SKIN_BLEND;
      const dCb = (cbSmooth[i] - planes.cb[i]) * weight * TONE_BLEND;
      const dCr = (crSmooth[i] - planes.cr[i]) * weight * TONE_BLEND;
      const at = ((region.y + y) * image.width + region.x + x) * 3;
      const write = (channel: number, delta: number) => {
        out.pixels[at + channel] = Math.round(Math.min(1, Math.max(0, out.pixels[at + channel] * scale + delta)) * maximum);
      };
      write(0, dLuma + 1.402 * dCr);
      write(1, dLuma - 0.344 * dCb - 0.714 * dCr);
      write(2, dLuma + 1.772 * dCb);
    }
  }
}

/** Retouches every face and returns a new image; with no faces the input itself is returned. */
export function retouchFaces(image: DecodedImage, faces: readonly Face[]): DecodedImage {
  if (faces.length === 0) return image;
  const out: DecodedImage = { ...image, pixels: image.pixels.slice() };
  const scale = 1 / (2 ** image.bitsPerSample - 1);
  for (const face of faces) retouchFace(image, out, face, scale);
  return out;
}
