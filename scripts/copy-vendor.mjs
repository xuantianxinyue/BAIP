// Copies the WASM runtimes into public/vendor so they are served as same-origin static files
// instead of going through the Next.js bundler. Both libraries locate their worker/wasm via
// `new URL(..., import.meta.url)`, which only resolves correctly when loaded from these paths.
// Runs automatically before `next dev` / `next build`; public/vendor is git-ignored.
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(root, 'public', 'vendor');

const groups = {
  libraw: ['libraw-wasm/dist', ['index.js', 'worker.js', 'libraw.js', 'libraw.wasm']],
  ort: ['onnxruntime-web/dist', ['ort.min.mjs', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']],
};

rmSync(vendor, { recursive: true, force: true });
for (const [name, [pkgDir, files]] of Object.entries(groups)) {
  mkdirSync(join(vendor, name), { recursive: true });
  for (const f of files) copyFileSync(join(root, 'node_modules', pkgDir, f), join(vendor, name, f));
}
console.log(`copied WASM runtimes to ${vendor}`);
