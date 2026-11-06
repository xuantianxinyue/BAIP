import type { Face, PhotoAsset, ProcessingOptions } from '../core';

/** Where the time of one photo went, in ms. Reported per photo so the performance targets can be checked. */
export interface PhotoTimings {
  decode: number;
  denoise?: number;
  retouch?: number;
  encode: number;
  total: number;
}

export interface ProcessedPhoto {
  fileName: string;
  blob: Blob;
  width: number;
  height: number;
  /** Faces retouched; undefined when retouching was off. */
  faces?: Face[];
  /** Inference backend of the denoise stage; undefined when denoising was off. */
  backend?: string;
  /** WASM threads ORT ran with: 1 means the page lost cross-origin isolation. */
  threads?: number;
  timings: PhotoTimings;
}

/** Decode → stages → encode for one photo. Rejects when `signal` aborts. */
export interface PhotoProcessor {
  process(asset: PhotoAsset, options: ProcessingOptions, signal: AbortSignal): Promise<ProcessedPhoto>;
}

/** Receives finished files; implementations decide where they end up. */
export interface ExportSink {
  write(photo: ProcessedPhoto): Promise<void>;
}

export type BatchEvent =
  | { type: 'started'; assetId: string }
  | { type: 'finished'; assetId: string; ms: number; photo: Omit<ProcessedPhoto, 'blob'> }
  | { type: 'failed'; assetId: string; message: string }
  | { type: 'completed'; succeeded: number; failed: number; cancelled: number };

/**
 * Runs a batch serially and streams progress. Implementations must keep at most one
 * decoded image alive at a time (decode → stages → export → release) and honour `signal`
 * for cancel; pause/resume is layered on top by the queue.
 */
export interface BatchRunner {
  run(assets: PhotoAsset[], options: ProcessingOptions, signal?: AbortSignal): AsyncIterable<BatchEvent>;
}
