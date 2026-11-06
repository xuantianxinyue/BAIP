import { createSession, getOrt, type ExecutionBackend, type InferenceSession, type Ort } from './ortRuntime';

/** realesr-general-x4v3 (scripts/make_denoise_model.py): runs on a 1/4-size image, output is 4x larger. */
export const DENOISE_MODEL_FILE = 'denoise.onnx';
export const DENOISE_SCALE = 4;
/** Fixed tile size: WebGPU compiles its shaders once, and cancel reacts within one tile. */
export const DENOISE_TILE = 256;
/** The context each tile computes and discards, hiding the seams between tiles. */
export const DENOISE_PAD = 16;

export class Denoiser {
  private constructor(
    private readonly ort: Ort,
    private readonly session: InferenceSession,
    readonly backend: ExecutionBackend,
  ) {}

  /** Loads the model on `backend`, falling back to WASM when WebGPU cannot run it. */
  static async create(backend: ExecutionBackend): Promise<Denoiser> {
    const ort = await getOrt();
    try {
      return new Denoiser(ort, await createSession(DENOISE_MODEL_FILE, backend), backend);
    } catch (e) {
      if (backend === 'wasm') throw e;
      return new Denoiser(ort, await createSession(DENOISE_MODEL_FILE, 'wasm'), 'wasm');
    }
  }

  /** Runs one NCHW tile. The returned array is the model's own output, valid until the next call. */
  infer = async (tile: Float32Array, size: number): Promise<Float32Array> => {
    const input = new this.ort.Tensor('float32', tile, [1, 3, size, size]);
    const outputs = await this.session.run({ [this.session.inputNames[0]]: input });
    return outputs[this.session.outputNames[0]].data as Float32Array;
  };
}
