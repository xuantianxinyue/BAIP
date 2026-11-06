import type { DecodedImage, Face } from '../core';
import { createSession, type ExecutionBackend, type InferenceSession, getOrt } from './ortRuntime';
import { decodeYuNet, planDetectionWindows, suppressOverlaps, toImageSpace, YUNET_SIZE, type DetectionWindow, type YuNetOutputs } from './yunet';

export const FACE_MODEL_FILE = 'face_yunet.onnx';

/** Fills the BGR 0–255 NCHW tensor YuNet expects with a nearest-neighbour sample of `window`. */
function windowTensor(image: DecodedImage, window: DetectionWindow, tensor: Float32Array) {
  const { width, height, pixels, bitsPerSample } = image;
  const plane = YUNET_SIZE * YUNET_SIZE;
  const scale = window.size / YUNET_SIZE;
  const unit = bitsPerSample === 16 ? 1 / 257 : 1;
  tensor.fill(0);
  for (let y = 0; y < YUNET_SIZE; y++) {
    const sy = Math.floor(window.y + (y + 0.5) * scale);
    if (sy >= height) break;
    for (let x = 0; x < YUNET_SIZE; x++) {
      const sx = Math.floor(window.x + (x + 0.5) * scale);
      if (sx >= width) break;
      const from = (sy * width + sx) * 3;
      const to = y * YUNET_SIZE + x;
      tensor[to] = pixels[from + 2] * unit;
      tensor[plane + to] = pixels[from + 1] * unit;
      tensor[2 * plane + to] = pixels[from] * unit;
    }
  }
}

export class FaceDetector {
  private constructor(private readonly session: InferenceSession) {}

  static async create(backend: ExecutionBackend): Promise<FaceDetector> {
    return new FaceDetector(await createSession(FACE_MODEL_FILE, backend));
  }

  /** All faces of an upright image, in image pixels. */
  async detect(image: DecodedImage, signal?: AbortSignal): Promise<Face[]> {
    const ort = await getOrt();
    const tensor = new Float32Array(3 * YUNET_SIZE * YUNET_SIZE);
    const faces: Face[] = [];
    for (const window of planDetectionWindows(image.width, image.height)) {
      signal?.throwIfAborted();
      windowTensor(image, window, tensor);
      const input = new ort.Tensor('float32', tensor, [1, 3, YUNET_SIZE, YUNET_SIZE]);
      const outputs = await this.session.run({ [this.session.inputNames[0]]: input });
      const found = decodeYuNet(outputs as unknown as YuNetOutputs);
      for (const value of Object.values(outputs)) value.dispose();
      faces.push(...found.map((f) => toImageSpace(f, window)));
    }
    return suppressOverlaps(faces);
  }
}
