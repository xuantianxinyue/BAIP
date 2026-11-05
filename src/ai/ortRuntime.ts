import * as ort from 'onnxruntime-web';
import ortMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';

export type ExecutionBackend = 'webgpu' | 'wasm';

let configured = false;

/**
 * Points ONNX Runtime Web at its own WASM loader/binary emitted by Vite into dist/assets,
 * so nothing is fetched from a CDN, and enables multithreading when the page is
 * cross-origin isolated. The explicit `mjs` path matters: without it ORT spawns its
 * threads from the app's main chunk, which then fails inside the worker.
 */
export function configureOrt(): void {
  if (configured) return;
  ort.env.wasm.wasmPaths = { mjs: ortMjsUrl, wasm: ortWasmUrl };
  ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  configured = true;
}

export function ortThreads(): number {
  return ort.env.wasm.numThreads ?? 1;
}

export async function webGpuAvailable(): Promise<boolean> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

/** Loads a model bundled under public/models. */
export async function createSession(modelFile: string, backend: ExecutionBackend): Promise<ort.InferenceSession> {
  configureOrt();
  return ort.InferenceSession.create(`${import.meta.env.BASE_URL}models/${modelFile}`, {
    executionProviders: [backend],
    graphOptimizationLevel: 'all',
  });
}

export { ort };
