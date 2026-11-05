import { describe, expect, it } from 'vitest';
import { MATMUL4, inputValue, matmul4Expected, quantValue } from './selfTestSpec';

describe('4-bit self-test reference', () => {
  it('uses only 4-bit codes', () => {
    for (let n = 0; n < MATMUL4.N; n++) for (let k = 0; k < MATMUL4.K; k++) {
      expect(quantValue(n, k)).toBeGreaterThanOrEqual(0);
      expect(quantValue(n, k)).toBeLessThan(16);
    }
  });
  it('matches a hand-computed element', () => {
    let acc = 0;
    for (let k = 0; k < MATMUL4.K; k++) acc += inputValue(1, k) * (quantValue(2, k) - 8) * 0.05;
    expect(matmul4Expected()[1 * MATMUL4.N + 2]).toBeCloseTo(acc, 5);
  });
});
