import type { DecodedImage } from './decodedImage';
import type { ExifInfo } from './exif';
import type { ImageKind } from './imageFormat';

export interface DecodeOptions {
  /** Half-size decode (4x fewer pixels, much faster) for previews. */
  halfSize?: boolean;
  useCameraWhiteBalance?: boolean;
  outputBits?: 8 | 16;
}

/** A source format decoder. Implementations live in `decoding/`; the UI only sees this interface. */
export interface ImageDecoder {
  readonly id: string;
  canDecode(kind: ImageKind): boolean;
  readMetadata(file: File): Promise<ExifInfo>;
  /** Embedded/fast preview no larger than `maxPixelSize` on the long edge, or null if unavailable. */
  embeddedPreview(file: File, maxPixelSize: number): Promise<ImageBitmap | null>;
  decode(file: File, options?: DecodeOptions): Promise<DecodedImage>;
}

/** One step of the processing chain (denoise, portrait retouch, ...). Stages must not mutate their input. */
export interface ProcessingStage {
  readonly id: string;
  readonly displayName: string;
  process(image: DecodedImage, signal?: AbortSignal): Promise<DecodedImage>;
}

export type DecodeErrorCode = 'unsupported' | 'corrupt' | 'failed';

export class DecodeError extends Error {
  constructor(
    readonly code: DecodeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DecodeError';
  }
}
