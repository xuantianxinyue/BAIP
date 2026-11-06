import type { ProcessingOptions } from '../core';
import type { ProcessedPhoto } from './batch';

export type WorkerRequest =
  /** Full decode for the viewer: the worker does the RGB → RGBA conversion and returns a bitmap. */
  | { type: 'decode'; id: number; file: File }
  | { type: 'process'; id: number; file: File; options: ProcessingOptions };

export type WorkerResponse =
  | { type: 'decoded'; id: number; bitmap: ImageBitmap }
  | { type: 'processed'; id: number; photo: ProcessedPhoto }
  | { type: 'error'; id: number; message: string };
