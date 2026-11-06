import type { ExifInfo } from './exif';
import type { ImageKind } from './imageFormat';

export type AssetStatus = 'pending' | 'loading' | 'ready' | 'error';

export interface PhotoAsset {
  id: string;
  file: File;
  name: string;
  /** Path inside the imported folder (`webkitRelativePath`), when imported as a folder. */
  path?: string;
  /** De-duplication key, see `fileKey`. */
  key: string;
  kind: ImageKind;
  status: AssetStatus;
  exif?: ExifInfo;
  /** Object URL of a downscaled preview. Revoke when the asset is removed. */
  previewUrl?: string;
  /** Object URL of a small (~240 px) thumbnail for the filmstrip. Revoke when the asset is removed. */
  thumbUrl?: string;
  /** Milliseconds spent reading metadata + preview. */
  loadMs?: number;
  error?: string;
}
