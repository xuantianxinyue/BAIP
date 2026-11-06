import { createSession, getOrt, ortThreads, webGpuAvailable, type ExecutionBackend } from './ortRuntime';
import { CONV, MATMUL4, matmul4Expected, matmul4Input } from './selfTestSpec';

export interface SelfTestItem {
  name: string;
  passed: boolean;
  ms: number;
  detail: string;
}

export interface SelfTestReport {
  crossOriginIsolated: boolean;
  threads: number;
  webGpu: boolean;
  items: SelfTestItem[];
  passed: boolean;
}

/**
 * Environment self-test for the AI engine:
 * 1. 256×256 residual conv model (y = x + 0.5·conv_identity(x)) on WASM, and on WebGPU when available;
 * 2. 4-bit quantized MatMulNBits model on WASM, checked against a JS reference.
 */
export async function runAiSelfTest(): Promise<SelfTestReport> {
  const webGpu = await webGpuAvailable();
  const items: SelfTestItem[] = [];
  items.push(await timed('conv 推理 256×256 (wasm)', () => convCheck('wasm')));
  if (webGpu) items.push(await timed('conv 推理 256×256 (webgpu)', () => convCheck('webgpu')));
  items.push(await timed('4bit 量化矩阵乘 MatMulNBits (wasm)', () => matmul4Check()));
  return {
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    threads: await ortThreads(),
    webGpu,
    items,
    passed: items.every((i) => i.passed),
  };
}

async function timed(name: string, body: () => Promise<{ passed: boolean; detail: string }>): Promise<SelfTestItem> {
  const t0 = performance.now();
  try {
    const r = await body();
    return { name, ...r, ms: performance.now() - t0 };
  } catch (e) {
    return { name, passed: false, detail: e instanceof Error ? e.message : String(e), ms: performance.now() - t0 };
  }
}

async function convCheck(backend: ExecutionBackend) {
  const ort = await getOrt();
  const session = await createSession('selftest_conv.onnx', backend);
  try {
    const n = CONV.size;
    const x = new Float32Array(3 * n * n);
    for (let i = 0; i < x.length; i++) x[i] = ((i * 2654435761) % 1000) / 1000;
    const out = await session.run({ input: new ort.Tensor('float32', x, [1, 3, n, n]) });
    const y = out.output.data as Float32Array;
    let maxErr = 0;
    for (let i = 0; i < x.length; i++) maxErr = Math.max(maxErr, Math.abs(y[i] - CONV.gain * x[i]));
    return { passed: maxErr < 1e-4, detail: `shape [${out.output.dims.join(', ')}], max |err| ${maxErr.toExponential(2)}` };
  } finally {
    await session.release();
  }
}

async function matmul4Check() {
  const ort = await getOrt();
  const session = await createSession('selftest_matmul4.onnx', 'wasm');
  try {
    const { M, K } = MATMUL4;
    const out = await session.run({ A: new ort.Tensor('float32', matmul4Input(), [M, K]) });
    const y = out.Y.data as Float32Array;
    const expected = matmul4Expected();
    let maxErr = 0;
    for (let i = 0; i < expected.length; i++) maxErr = Math.max(maxErr, Math.abs(y[i] - expected[i]));
    return { passed: maxErr < 1e-3, detail: `shape [${out.Y.dims.join(', ')}], max |err| vs 反量化参考 ${maxErr.toExponential(2)}` };
  } finally {
    await session.release();
  }
}
