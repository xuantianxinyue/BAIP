import { importPublicModule, publicUrl } from '../core';

export type Ort = typeof import('onnxruntime-web');
export type InferenceSession = import('onnxruntime-web').InferenceSession;
export type ExecutionBackend = 'webgpu' | 'wasm';

let ortPromise: Promise<Ort> | undefined;

/**
 * Loads ONNX Runtime Web from public/vendor/ort (copied there by scripts/copy-vendor.mjs),
 * so nothing is fetched from a CDN and the bundler never touches the WASM runtime.
 * The non-bundled `ort.min.mjs` is used on purpose: it loads its WASM loader from `wasmPaths`,
 * and the explicit `mjs` path makes ORT spawn its threads from that file rather than from an app chunk.
 * Multithreading is enabled only when the page is cross-origin isolated.
 */
export function getOrt(): Promise<Ort> {
  ortPromise ??= importPublicModule<Ort>('vendor/ort/ort.min.mjs').then((ort) => {
    ort.env.wasm.wasmPaths = {
      mjs: publicUrl('vendor/ort/ort-wasm-simd-threaded.jsep.mjs'),
      wasm: publicUrl('vendor/ort/ort-wasm-simd-threaded.jsep.wasm'),
    };
    ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    return ort;
  });
  return ortPromise;
}

export async function ortThreads(): Promise<number> {
  return (await getOrt()).env.wasm.numThreads ?? 1;
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
export async function createSession(modelFile: string, backend: ExecutionBackend): Promise<InferenceSession> {
  const ort = await getOrt();
  return ort.InferenceSession.create(publicUrl(`models/${modelFile}`), {
    executionProviders: [backend],
    graphOptimizationLevel: 'all',
  });
}

/** WebGPU when the browser has it, otherwise the WASM backend. */
export async function preferredBackend(): Promise<ExecutionBackend> {
  return (await webGpuAvailable()) ? 'webgpu' : 'wasm';
}
