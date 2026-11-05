import type { DecodeOptions, PhotoAsset, ProcessingStage } from '../core';

/** What to run on every selected photo. Stages execute in order. */
export interface BatchConfiguration {
  stages: ProcessingStage[];
  decodeOptions: DecodeOptions;
}

export type BatchEvent =
  | { type: 'started'; assetId: string }
  | { type: 'finished'; assetId: string; ms: number }
  | { type: 'failed'; assetId: string; message: string }
  | { type: 'completed'; succeeded: number; failed: number };

/**
 * Runs a batch serially and streams progress. Implementations must keep at most one
 * decoded image alive at a time (decode → stages → export → release) and honour `signal`
 * for cancel; pause/resume is layered on top by the queue (phase 2).
 */
export interface BatchRunner {
  run(assets: PhotoAsset[], configuration: BatchConfiguration, signal?: AbortSignal): AsyncIterable<BatchEvent>;
}
