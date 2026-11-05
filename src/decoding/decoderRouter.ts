import { classifyFile, DecodeError, type DecodeOptions, type DecodedImage, type ExifInfo, type ImageDecoder } from '../core';
import { BitmapDecoder } from './bitmapDecoder';
import { LibRawDecoder } from './libRawDecoder';

/** Dispatches each file to the first decoder that handles its format. */
export class DecoderRouter {
  constructor(readonly decoders: ImageDecoder[] = [new LibRawDecoder(), new BitmapDecoder()]) {}

  decoderFor(file: File): ImageDecoder {
    const kind = classifyFile(file.name);
    const decoder = kind ? this.decoders.find((d) => d.canDecode(kind)) : undefined;
    if (!decoder) throw new DecodeError('unsupported', `${file.name}: 不支持的格式`);
    return decoder;
  }

  readMetadata(file: File): Promise<ExifInfo> {
    return this.decoderFor(file).readMetadata(file);
  }

  embeddedPreview(file: File, maxPixelSize: number): Promise<ImageBitmap | null> {
    return this.decoderFor(file).embeddedPreview(file, maxPixelSize);
  }

  decode(file: File, options?: DecodeOptions, signal?: AbortSignal): Promise<DecodedImage> {
    return this.decoderFor(file).decode(file, options, signal);
  }
}
