/** Camera RAW extensions decoded by LibRaw (WASM). */
export const RAW_EXTENSIONS = [
  'cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'raf', 'orf', 'rw2', 'pef', 'dng', 'srw', '3fr', 'iiq',
] as const;

/** Regular image extensions decoded by the browser. */
export const BITMAP_EXTENSIONS = ['jpg', 'jpeg', 'png'] as const;

export type ImageKind = 'raw' | 'bitmap';

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase();
}

/** Returns the decoder family for a file name, or null when the format is unsupported. */
export function classifyFile(fileName: string): ImageKind | null {
  const ext = extensionOf(fileName);
  if ((RAW_EXTENSIONS as readonly string[]).includes(ext)) return 'raw';
  if ((BITMAP_EXTENSIONS as readonly string[]).includes(ext)) return 'bitmap';
  return null;
}

/** `accept` attribute value for file inputs. */
export const ACCEPT_ATTRIBUTE = [...RAW_EXTENSIONS, ...BITMAP_EXTENSIONS].map((e) => `.${e}`).join(',');
