/** Denoise tiers; the product default is 'medium'. */
export type DenoiseStrength = 'low' | 'medium' | 'high';

export const DEFAULT_DENOISE_STRENGTH: DenoiseStrength = 'medium';

export interface ExportOptions {
  /** JPEG quality, 0–100. */
  quality: number;
  /** Appends `_processed` to the original file name. */
  addSuffix: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { quality: 90, addSuffix: true };

/** What to do to every photo of a batch. Plain data: it is sent to the pipeline worker. */
export interface ProcessingOptions {
  denoise: DenoiseStrength | null;
  retouch: boolean;
  export: ExportOptions;
}

export interface Point {
  x: number;
  y: number;
}

/** A detected face in image pixels. Landmarks are as seen in the image: left/right are image sides. */
export interface Face {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
  landmarks: { eyeLeft: Point; eyeRight: Point; nose: Point; mouthLeft: Point; mouthRight: Point };
}

/** `IMG_1.CR2` → `IMG_1_processed.jpg`; the source file is never overwritten. */
export function exportFileName(sourceName: string, addSuffix: boolean): string {
  const dot = sourceName.lastIndexOf('.');
  const stem = dot > 0 ? sourceName.slice(0, dot) : sourceName;
  return `${stem}${addSuffix ? '_processed' : ''}.jpg`;
}
