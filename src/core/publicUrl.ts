/** Base path the app is served under (mirrors `basePath` in next.config.ts; empty at the domain root). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** URL of a file under `public/`, e.g. `publicUrl('models/x.onnx')`. */
export function publicUrl(path: string): string {
  return `${BASE_PATH}/${path.replace(/^\/+/, '')}`;
}

/**
 * Imports an ES module served from `public/` at runtime, bypassing the bundler.
 * Used for the WASM runtimes in public/vendor (see scripts/copy-vendor.mjs), whose
 * `import.meta.url`-relative worker/wasm lookups must stay intact.
 */
export function importPublicModule<T>(path: string): Promise<T> {
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ publicUrl(path));
}
