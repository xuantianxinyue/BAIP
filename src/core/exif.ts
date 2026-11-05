export interface ExifInfo {
  cameraMake?: string;
  cameraModel?: string;
  lensModel?: string;
  iso?: number;
  /** Seconds. */
  exposureTime?: number;
  /** f-number. */
  aperture?: number;
  /** Millimetres. */
  focalLength?: number;
  captureDate?: Date;
  width: number;
  height: number;
  /** LibRaw flip value (0 = none, 3 = 180°, 5 = 90° CCW, 6 = 90° CW). */
  orientation: number;
}

export function megapixels(exif: Pick<ExifInfo, 'width' | 'height'>): number {
  return (exif.width * exif.height) / 1_000_000;
}

/** Formats an exposure time in seconds as photographers write it: "1/250 s", "0.5 s", "2 s". */
export function formatExposure(seconds: number | undefined): string | undefined {
  if (seconds === undefined || !(seconds > 0)) return undefined;
  if (seconds >= 0.3) return `${Number(seconds.toFixed(1))} s`;
  return `1/${Math.round(1 / seconds)} s`;
}
