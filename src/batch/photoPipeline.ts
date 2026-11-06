import { exportFileName, readExifBlock, type DecodedImage, type DecodeOptions, type ImageDecoder, type ProcessingOptions } from '../core';
import { Denoiser, FaceDetector, ortThreads, preferredBackend } from '../ai';
import { encodeJpeg } from '../pipeline';
import type { PhotoTimings, ProcessedPhoto } from './batch';
import { createDenoiseStage, createRetouchStage } from './stages';

const DECODE_OPTIONS: DecodeOptions = { outputBits: 16 };

/**
 * Decode → denoise → retouch → encode for one photo, run inside the pipeline worker. Each stage's
 * input is dropped as soon as the next image exists, so at most one photo's pixels stay alive
 * (plus its successor during a stage). Models load on first use and stay for the next photos.
 */
export class PhotoPipeline {
  private denoiser?: Promise<Denoiser>;
  private detector?: Promise<FaceDetector>;

  constructor(private readonly decoder: Pick<ImageDecoder, 'decode'>) {}

  async process(file: File, options: ProcessingOptions, signal: AbortSignal): Promise<ProcessedPhoto> {
    const start = performance.now();
    const elapsed = async <T>(run: () => Promise<T>): Promise<[T, number]> => {
      const t0 = performance.now();
      const value = await run();
      return [value, performance.now() - t0];
    };
    const exif = readExifBlock(new Uint8Array(await file.arrayBuffer()));
    let [image, decode] = await elapsed(() => this.decoder.decode(file, DECODE_OPTIONS, signal));
    const timings: PhotoTimings = { decode, encode: 0, total: 0 };
    const photo: Omit<ProcessedPhoto, 'blob'> = { fileName: exportFileName(file.name, options.export.addSuffix), width: image.width, height: image.height, timings };

    if (options.denoise) {
      const strength = options.denoise;
      const denoiser = await this.loadDenoiser();
      photo.backend = denoiser.backend;
      photo.threads = await ortThreads();
      const input: DecodedImage = image;
      [image, timings.denoise] = await elapsed(() => createDenoiseStage(denoiser, strength).process(input, signal));
    }
    if (options.retouch) {
      const detector = await this.loadDetector();
      const input: DecodedImage = image;
      [image, timings.retouch] = await elapsed(() => createRetouchStage(detector, (faces) => (photo.faces = faces)).process(input, signal));
    }
    signal.throwIfAborted();
    const finished: DecodedImage = image;
    const [blob, encode] = await elapsed(() => encodeJpeg(finished, options.export.quality, exif));
    timings.encode = encode;
    timings.total = performance.now() - start;
    return { ...photo, blob };
  }

  private loadDenoiser(): Promise<Denoiser> {
    this.denoiser ??= preferredBackend().then((backend) => Denoiser.create(backend));
    return this.denoiser;
  }

  private loadDetector(): Promise<FaceDetector> {
    this.detector ??= preferredBackend().then((backend) => FaceDetector.create(backend));
    return this.detector;
  }
}
