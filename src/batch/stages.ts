import type { DecodedImage, DenoiseStrength, Face, ProcessingStage } from '../core';
import { DENOISE_PAD, DENOISE_SCALE, DENOISE_TILE, type Denoiser, type FaceDetector } from '../ai';
import { restoreDetail, retouchFaces, runTiled } from '../pipeline';

/**
 * Detail restored per tier, in noise levels (see `restoreDetail`): a higher threshold lets less of
 * the original through, so it removes more noise and keeps less fine texture.
 */
export const DETAIL_THRESHOLD: Record<DenoiseStrength, number> = { low: 0.75, medium: 1, high: 1.5 };

/**
 * AI denoise. The net runs on a 1/4-size image: on real, demosaiced noise this beats running it at
 * full size, for 1/16 of the compute (measurements in docs/web-plan.md). That base supplies colour;
 * real luma detail then comes back from the original.
 */
export function createDenoiseStage(denoiser: Denoiser, strength: DenoiseStrength): ProcessingStage {
  return {
    id: `denoise-${strength}`,
    displayName: 'AI 降噪',
    async process(image: DecodedImage, signal?: AbortSignal) {
      const base = await runTiled(image, { infer: denoiser.infer, tileSize: DENOISE_TILE, pad: DENOISE_PAD, scale: DENOISE_SCALE, signal });
      restoreDetail(image, base, DETAIL_THRESHOLD[strength]);
      return base;
    },
  };
}

/** Portrait retouch; `onFaces` reports what was found. A photo without faces passes through unchanged. */
export function createRetouchStage(detector: FaceDetector, onFaces: (faces: Face[]) => void = () => {}): ProcessingStage {
  return {
    id: 'retouch',
    displayName: '人像轻修',
    async process(image: DecodedImage, signal?: AbortSignal) {
      const faces = await detector.detect(image, signal);
      onFaces(faces);
      return retouchFaces(image, faces);
    },
  };
}
