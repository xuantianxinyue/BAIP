import { describe, expect, it } from 'vitest';
import { buildExifPayload, exifFields, insertExif, readExifBlock, type ExifBlock, type ExifEntry } from './exifBlock';

const ascii = (tag: number, text: string): ExifEntry => {
  const value = new TextEncoder().encode(`${text}\0`);
  return { tag, type: 2, count: value.length, value };
};
const short = (tag: number, v: number, le: boolean): ExifEntry => {
  const value = new Uint8Array(2);
  new DataView(value.buffer).setUint16(0, v, le);
  return { tag, type: 3, count: 1, value };
};
const rational = (tag: number, n: number, d: number, le: boolean): ExifEntry => {
  const value = new Uint8Array(8);
  const view = new DataView(value.buffer);
  view.setUint32(0, n, le);
  view.setUint32(4, d, le);
  return { tag, type: 5, count: 1, value };
};

const sample = (littleEndian: boolean): ExifBlock => ({
  littleEndian,
  ifd0: [ascii(0x10f, 'Canon'), ascii(0x110, 'EOS R5'), short(0x112, 6, littleEndian), short(0x103, 7, littleEndian)],
  exif: [
    rational(0x829a, 1, 250, littleEndian),
    rational(0x829d, 28, 10, littleEndian),
    short(0x8827, 3200, littleEndian),
    ascii(0x9003, '2024:03:01 12:30:45'),
    rational(0x920a, 85, 1, littleEndian),
    ascii(0xa434, 'RF85mm F1.2'),
    { tag: 0x927c, type: 7, count: 300, value: new Uint8Array(300) },
  ],
  gps: [ascii(0x1, 'N')],
});

/** A bare JPEG: SOI, JFIF APP0, EOI. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xd9]);

const roundTrip = (littleEndian: boolean) => readExifBlock(insertExif(JPEG, buildExifPayload(sample(littleEndian), 640, 480)))!;

describe.each([true, false])('EXIF round trip (littleEndian=%s)', (littleEndian) => {
  it('keeps the shooting data', () => {
    const f = exifFields(roundTrip(littleEndian));
    expect(f).toMatchObject({ cameraMake: 'Canon', cameraModel: 'EOS R5', lensModel: 'RF85mm F1.2', iso: 3200, aperture: 2.8, focalLength: 85 });
    expect(f.exposureTime).toBeCloseTo(1 / 250);
    expect(f.captureDate).toEqual(new Date(2024, 2, 1, 12, 30, 45));
  });

  it('resets orientation and size, and drops source-only tags', () => {
    const block = roundTrip(littleEndian);
    const view = (e: ExifEntry) => new DataView(e.value.buffer, e.value.byteOffset);
    expect(view(block.ifd0.find((e) => e.tag === 0x112)!).getUint16(0, littleEndian)).toBe(1);
    expect(view(block.exif.find((e) => e.tag === 0xa002)!).getUint32(0, littleEndian)).toBe(640);
    expect(block.ifd0.some((e) => e.tag === 0x103)).toBe(false);
    expect(block.exif.some((e) => e.tag === 0x927c)).toBe(false);
    expect(block.gps.map((e) => e.tag)).toEqual([0x1]);
  });
});

describe('insertExif', () => {
  it('goes after JFIF APP0 and leaves the rest intact', () => {
    const out = insertExif(JPEG, new Uint8Array([9, 9]));
    expect([...out.subarray(0, 8)]).toEqual([...JPEG.subarray(0, 8)]);
    expect([...out.subarray(8, 14)]).toEqual([0xff, 0xe1, 0, 4, 9, 9]);
    expect([...out.subarray(14)]).toEqual([0xff, 0xd9]);
  });
});

describe('buildExifPayload', () => {
  it('stays within one APP1 segment by dropping the largest tags', () => {
    const block = sample(true);
    block.exif.push({ tag: 0x9286, type: 7, count: 70000, value: new Uint8Array(70000) });
    const payload = buildExifPayload(block, 10, 10);
    expect(payload.length).toBeLessThanOrEqual(65533);
    expect(exifFields(readExifBlock(insertExif(JPEG, payload))!).iso).toBe(3200);
  });
});

describe('readExifBlock', () => {
  it('returns null for data without EXIF', () => {
    expect(readExifBlock(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(readExifBlock(JPEG)).toBeNull();
  });

  it('survives truncated files', () => {
    const whole = insertExif(JPEG, buildExifPayload(sample(true), 10, 10));
    for (const end of [3, 12, 20, 40, 90]) expect(() => readExifBlock(whole.subarray(0, end))).not.toThrow();
  });
});
