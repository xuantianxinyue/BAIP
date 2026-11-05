import { describe, expect, it } from 'vitest';
import { flipToRotation, jpegExifOrientation } from './index';

/** Minimal JPEG: SOI, optional APP0, APP1/Exif with a one-entry IFD0, then SOS. */
function jpeg(orientation: number | null, littleEndian = true, withApp0 = true): Uint8Array {
  const u16 = (v: number) => (littleEndian ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const u32 = (v: number) => (littleEndian ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
  const tag = orientation === null ? 0x0110 : 0x0112; // 0x0110 = Model, i.e. no orientation entry
  const tiff = [...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(tag), ...u16(3), ...u32(1), ...u16(orientation ?? 0), 0, 0, ...u32(0)];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const app0 = withApp0 ? [0xff, 0xe0, 0, 16, ...new Array(14).fill(0)] : [];
  return new Uint8Array([0xff, 0xd8, ...app0, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 0xff, ...app1, 0xff, 0xda, 0, 2]);
}

describe('orientation', () => {
  it('maps LibRaw flip values to clockwise rotations', () => {
    expect([0, 3, 5, 6, 1].map(flipToRotation)).toEqual([0, 180, 270, 90, 0]);
  });
  it('reads the EXIF orientation of a JPEG in both byte orders', () => {
    expect(jpegExifOrientation(jpeg(6))).toBe(6);
    expect(jpegExifOrientation(jpeg(8, false, false))).toBe(8);
  });
  it('returns undefined without an orientation tag, EXIF segment or valid JPEG', () => {
    expect(jpegExifOrientation(jpeg(null))).toBeUndefined();
    expect(jpegExifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeUndefined();
    expect(jpegExifOrientation(new Uint8Array([1, 2, 3, 4]))).toBeUndefined();
    expect(jpegExifOrientation(jpeg(6).slice(0, 30))).toBeUndefined();
  });
});
