import type { ExifInfo } from './exif';
import type { ImageKind } from './imageFormat';

export type AssetStatus = 'pending' | 'loading' | 'ready' | 'error';

export interface PhotoAsset {
  id: string;
  file: File;
  name: string;
  kind: ImageKind;
  status: AssetStatus;
  exif?: ExifInfo;
  /** Object URL of a downscaled preview. Revoke when the asset is removed. */
  previewUrl?: string;
  /** Milliseconds spent reading metadata + preview. */
  loadMs?: number;
  error?: string;
}
