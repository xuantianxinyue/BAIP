/**
 * Deterministic definition of the self-test models. scripts/make_selftest_models.py
 * builds the ONNX files from the same formulas, so the browser can verify outputs exactly.
 */
export const CONV = { size: 256, gain: 1.5 } as const;

/** 4-bit MatMulNBits (com.microsoft) test: Y[M,N] = A[M,K] · dequant(B)[K,N]. */
export const MATMUL4 = { M: 4, K: 64, N: 16, blockSize: 32, scale: 0.05, zeroPoint: 8 } as const;

export const quantValue = (n: number, k: number): number => (n * 7 + k * 3) % 16;
export const inputValue = (m: number, k: number): number => (((m * 13 + k * 5) % 11) - 5) / 10;

export function matmul4Input(): Float32Array {
  const { M, K } = MATMUL4;
  const a = new Float32Array(M * K);
  for (let m = 0; m < M; m++) for (let k = 0; k < K; k++) a[m * K + k] = inputValue(m, k);
  return a;
}

/** Reference result computed with dequantized weights w = (q - zeroPoint) * scale. */
export function matmul4Expected(): Float32Array {
  const { M, K, N, scale, zeroPoint } = MATMUL4;
  const y = new Float32Array(M * N);
  for (let m = 0; m < M; m++)
    for (let n = 0; n < N; n++) {
      let acc = 0;
      for (let k = 0; k < K; k++) acc += inputValue(m, k) * (quantValue(n, k) - zeroPoint) * scale;
      y[m * N + n] = acc;
    }
  return y;
}
