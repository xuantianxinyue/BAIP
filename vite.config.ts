/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// libraw-wasm and onnxruntime-web use multithreaded WASM (SharedArrayBuffer),
// which requires a cross-origin isolated page.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
  // Both packages locate their worker/wasm files via `new URL(..., import.meta.url)`;
  // pre-bundling would break those relative URLs.
  optimizeDeps: { exclude: ['libraw-wasm', 'onnxruntime-web'] },
  worker: { format: 'es' },
  build: { target: 'es2022' },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
