/** Clockwise rotation in degrees for a LibRaw flip value (0 = none, 3 = 180°, 5 = 90° CCW, 6 = 90° CW). */
export function flipToRotation(flip: number): 0 | 90 | 180 | 270 {
  switch (flip) {
    case 3:
      return 180;
    case 5:
      return 270;
    case 6:
      return 90;
    default:
      return 0;
  }
}

/**
 * Reads the EXIF Orientation tag (1–8) from a JPEG's APP1 segment, or undefined when absent.
 * Browsers apply this tag automatically when decoding, so callers use it to know whether an
 * embedded RAW preview still needs to be rotated by hand.
 */
export function jpegExifOrientation(bytes: Uint8Array): number | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return undefined;
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return undefined; // start of scan / end of image
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) return undefined;
    if (marker === 0xe1 && isExifHeader(bytes, i + 4)) return tiffOrientation(bytes, i + 10, Math.min(bytes.length, i + 2 + length));
    i += 2 + length;
  }
  return undefined;
}

function isExifHeader(b: Uint8Array, at: number): boolean {
  return b[at] === 0x45 && b[at + 1] === 0x78 && b[at + 2] === 0x69 && b[at + 3] === 0x66 && b[at + 4] === 0 && b[at + 5] === 0;
}

function tiffOrientation(b: Uint8Array, tiff: number, end: number): number | undefined {
  if (tiff + 8 > end) return undefined;
  const little = b[tiff] === 0x49 && b[tiff + 1] === 0x49;
  if (!little && !(b[tiff] === 0x4d && b[tiff + 1] === 0x4d)) return undefined;
  const u16 = (o: number) => (little ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o: number) => (little ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 2 ** 24 : b[o] * 2 ** 24 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]));
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return undefined;
  const count = u16(ifd);
  for (let n = 0; n < count; n++) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > end) return undefined;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? value : undefined;
    }
  }
  return undefined;
}
