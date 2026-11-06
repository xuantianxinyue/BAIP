import type { NextConfig } from 'next';

// libraw-wasm and onnxruntime-web use multithreaded WASM (SharedArrayBuffer),
// which requires a cross-origin isolated page. Production hosting must send the same headers.
const crossOriginIsolation = [
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
];

const config: NextConfig = {
  // e2e builds elsewhere so it never replaces the files of a server running from `.next`.
  distDir: process.env.NEXT_DIST_DIR || undefined,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  headers: async () => [{ source: '/:path*', headers: crossOriginIsolation }],
};

export default config;
