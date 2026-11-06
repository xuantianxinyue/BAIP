import type { ExifInfo } from './exif';

/**
 * Reads the EXIF tags of a source file and writes them into an exported JPEG.
 *
 * Value bytes are copied verbatim and the block keeps the source byte order, so no tag needs to be
 * understood to be preserved. Dropped on purpose: tags describing the source's pixel storage, and
 * MakerNote (its internal offsets are relative to the original file, so copying it corrupts it).
 */
export interface ExifEntry {
  tag: number;
  type: number;
  count: number;
  /** The value's raw bytes, in the block's byte order. */
  value: Uint8Array;
}

export interface ExifBlock {
  littleEndian: boolean;
  ifd0: ExifEntry[];
  exif: ExifEntry[];
  gps: ExifEntry[];
}

const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
const ASCII = 2;
const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;

const TAG_ORIENTATION = 0x112;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_MAKER_NOTE = 0x927c;
const TAG_COLOR_SPACE = 0xa001;
const TAG_PIXEL_X = 0xa002;
const TAG_PIXEL_Y = 0xa003;
const TAG_INTEROP_IFD = 0xa005;

/** IFD0 also describes the source's image data (strips, DNG colour matrices, ...), so it is an allow-list. */
const IFD0_KEEP = new Set([0x10e, 0x10f, 0x110, 0x11a, 0x11b, 0x128, 0x131, 0x132, 0x13b, 0x8298]);
const EXIF_DROP = new Set([TAG_MAKER_NOTE, TAG_COLOR_SPACE, TAG_PIXEL_X, TAG_PIXEL_Y, TAG_INTEROP_IFD]);

const MAX_APP1_PAYLOAD = 65533;
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0, 0];

/** Reads one IFD. Returns no entries for anything malformed: bad metadata must never fail an export. */
function readIfd(tiff: DataView, offset: number, littleEndian: boolean): ExifEntry[] {
  if (offset < 8 || offset + 2 > tiff.byteLength) return [];
  const entries: ExifEntry[] = [];
  const total = tiff.getUint16(offset, littleEndian);
  for (let i = 0; i < total; i++) {
    const at = offset + 2 + i * 12;
    if (at + 12 > tiff.byteLength) break;
    const type = tiff.getUint16(at + 2, littleEndian);
    const count = tiff.getUint32(at + 4, littleEndian);
    const size = (TYPE_SIZE[type] ?? 0) * count;
    if (size === 0) continue;
    const start = size <= 4 ? at + 8 : tiff.getUint32(at + 8, littleEndian);
    if (start + size > tiff.byteLength) continue;
    const value = new Uint8Array(tiff.buffer, tiff.byteOffset + start, size).slice();
    entries.push({ tag: tiff.getUint16(at, littleEndian), type, count, value });
  }
  return entries;
}

function pointer(entries: ExifEntry[], tag: number, littleEndian: boolean): number | undefined {
  const entry = entries.find((e) => e.tag === tag);
  if (!entry || entry.value.length < 4) return undefined;
  return new DataView(entry.value.buffer, entry.value.byteOffset).getUint32(0, littleEndian);
}

function parseTiff(tiff: Uint8Array): ExifBlock | null {
  if (tiff.length < 8) return null;
  const order = (tiff[0] << 8) | tiff[1];
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const littleEndian = order === 0x4949;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const ifd0 = readIfd(view, view.getUint32(4, littleEndian), littleEndian);
  if (ifd0.length === 0) return null;
  const sub = (tag: number) => {
    const at = pointer(ifd0, tag, littleEndian);
    return at === undefined ? [] : readIfd(view, at, littleEndian);
  };
  return { littleEndian, ifd0, exif: sub(TAG_EXIF_IFD), gps: sub(TAG_GPS_IFD) };
}

/** The TIFF payload of a JPEG's EXIF APP1 segment. */
function jpegTiff(jpeg: Uint8Array): Uint8Array | null {
  let at = 2;
  while (at + 4 <= jpeg.length && jpeg[at] === 0xff) {
    const marker = jpeg[at + 1];
    if (marker === 0xda || marker === 0xd9) return null;
    const size = (jpeg[at + 2] << 8) | jpeg[at + 3];
    if (marker === 0xe1 && EXIF_HEADER.every((b, i) => jpeg[at + 4 + i] === b)) return jpeg.subarray(at + 10, Math.min(at + 2 + size, jpeg.length));
    at += 2 + size;
  }
  return null;
}

/** Fuji RAF is not TIFF; its EXIF sits in the embedded JPEG, whose offset/length are at bytes 84/88. */
function rafJpeg(raf: Uint8Array): Uint8Array | null {
  if (raf.length < 92) return null;
  const view = new DataView(raf.buffer, raf.byteOffset, raf.byteLength);
  const offset = view.getUint32(84);
  const length = view.getUint32(88);
  return offset + length <= raf.length ? raf.subarray(offset, offset + length) : null;
}

/** EXIF of a JPEG, TIFF-based RAW (CR2/NEF/ARW/DNG/...) or RAF; null for formats without one (PNG, CR3, ...). */
export function readExifBlock(file: Uint8Array): ExifBlock | null {
  if (file[0] === 0xff && file[1] === 0xd8) {
    const tiff = jpegTiff(file);
    return tiff && parseTiff(tiff);
  }
  if (String.fromCharCode(...file.subarray(0, 8)) === 'FUJIFILM') {
    const jpeg = rafJpeg(file);
    return jpeg && readExifBlock(jpeg);
  }
  return parseTiff(file);
}

function makeEntry(tag: number, type: number, value: number, littleEndian: boolean): ExifEntry {
  const size = TYPE_SIZE[type];
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  if (type === SHORT) view.setUint16(0, value, littleEndian);
  else view.setUint32(0, value, littleEndian);
  return { tag, type, count: 1, value: bytes };
}

const ifdSize = (entries: ExifEntry[]) => 6 + entries.length * 12 + entries.reduce((sum, e) => sum + (e.value.length > 4 ? e.value.length + (e.value.length & 1) : 0), 0);

function writeIfd(out: Uint8Array, offset: number, entries: ExifEntry[], littleEndian: boolean): void {
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const sorted = [...entries].sort((a, b) => a.tag - b.tag);
  view.setUint16(offset, sorted.length, littleEndian);
  let data = offset + 6 + sorted.length * 12;
  sorted.forEach((e, i) => {
    const at = offset + 2 + i * 12;
    view.setUint16(at, e.tag, littleEndian);
    view.setUint16(at + 2, e.type, littleEndian);
    view.setUint32(at + 4, e.count, littleEndian);
    if (e.value.length <= 4) {
      out.set(e.value, at + 8);
    } else {
      view.setUint32(at + 8, data, littleEndian);
      out.set(e.value, data);
      data += e.value.length + (e.value.length & 1);
    }
  });
  view.setUint32(offset + 2 + sorted.length * 12, 0, littleEndian);
}

/**
 * Builds the EXIF APP1 payload for a processed image: pixels are already upright so Orientation is 1,
 * the size is the exported one and the colour space sRGB. Tags that overflow the 64 KB segment limit
 * are dropped largest-first.
 */
export function buildExifPayload(block: ExifBlock, width: number, height: number): Uint8Array {
  const { littleEndian } = block;
  const ifd0 = block.ifd0.filter((e) => IFD0_KEEP.has(e.tag));
  ifd0.push(makeEntry(TAG_ORIENTATION, SHORT, 1, littleEndian));
  const exif = block.exif.filter((e) => !EXIF_DROP.has(e.tag));
  exif.push(makeEntry(TAG_COLOR_SPACE, SHORT, 1, littleEndian), makeEntry(TAG_PIXEL_X, LONG, width, littleEndian), makeEntry(TAG_PIXEL_Y, LONG, height, littleEndian));
  const gps = [...block.gps];

  // The two pointer entries plus header: 8 bytes TIFF header, 6 bytes "Exif\0\0".
  const pointers = 12 * (1 + (gps.length > 0 ? 1 : 0));
  const size = () => EXIF_HEADER.length + 8 + pointers + ifdSize(ifd0) + ifdSize(exif) + (gps.length > 0 ? ifdSize(gps) : 0);
  while (size() > MAX_APP1_PAYLOAD) {
    const owners = [ifd0, exif, gps];
    const largest = owners.flat().reduce((a, b) => (b.value.length > a.value.length ? b : a));
    const owner = owners.find((list) => list.includes(largest))!;
    owner.splice(owner.indexOf(largest), 1);
  }

  const exifAt = 8 + pointers + ifdSize(ifd0);
  const gpsAt = exifAt + ifdSize(exif);
  ifd0.push(makeEntry(TAG_EXIF_IFD, LONG, exifAt, littleEndian));
  if (gps.length > 0) ifd0.push(makeEntry(TAG_GPS_IFD, LONG, gpsAt, littleEndian));

  const payload = new Uint8Array(size() - pointers);
  payload.set(EXIF_HEADER);
  const tiff = payload.subarray(EXIF_HEADER.length);
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  view.setUint16(0, littleEndian ? 0x4949 : 0x4d4d);
  view.setUint16(2, 42, littleEndian);
  view.setUint32(4, 8, littleEndian);
  writeIfd(tiff, 8, ifd0, littleEndian);
  writeIfd(tiff, exifAt, exif, littleEndian);
  if (gps.length > 0) writeIfd(tiff, gpsAt, gps, littleEndian);
  return payload;
}

/** Returns the JPEG with `payload` as its EXIF segment, placed after JFIF APP0 when there is one. */
export function insertExif(jpeg: Uint8Array, payload: Uint8Array): Uint8Array {
  const hasJfif = jpeg[2] === 0xff && jpeg[3] === 0xe0;
  const at = hasJfif ? 4 + ((jpeg[4] << 8) | jpeg[5]) : 2;
  const size = payload.length + 2;
  const out = new Uint8Array(jpeg.length + size + 2);
  out.set(jpeg.subarray(0, at));
  out.set([0xff, 0xe1, size >> 8, size & 0xff], at);
  out.set(payload, at + 4);
  out.set(jpeg.subarray(at), at + 4 + payload.length);
  return out;
}

function readText(entry: ExifEntry | undefined): string | undefined {
  if (!entry || entry.type !== ASCII) return undefined;
  const end = entry.value.indexOf(0);
  const text = new TextDecoder().decode(end >= 0 ? entry.value.subarray(0, end) : entry.value).trim();
  return text || undefined;
}

function readNumber(entry: ExifEntry | undefined, littleEndian: boolean): number | undefined {
  if (!entry) return undefined;
  const view = new DataView(entry.value.buffer, entry.value.byteOffset, entry.value.byteLength);
  if (entry.type === SHORT) return view.getUint16(0, littleEndian);
  if (entry.type === LONG) return view.getUint32(0, littleEndian);
  if (entry.type === RATIONAL) {
    const denominator = view.getUint32(4, littleEndian);
    return denominator === 0 ? undefined : view.getUint32(0, littleEndian) / denominator;
  }
  return undefined;
}

/** "2024:03:01 12:30:45" → Date (EXIF times are local, and carry no zone). */
function readDate(text: string | undefined): Date | undefined {
  const m = text?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** The display fields of an EXIF block, for files LibRaw does not read (JPG). Size comes from the decoder. */
export function exifFields(block: ExifBlock): Omit<ExifInfo, 'width' | 'height' | 'orientation'> {
  const { ifd0, exif, littleEndian } = block;
  const tag = (list: ExifEntry[], id: number) => list.find((e) => e.tag === id);
  return {
    cameraMake: readText(tag(ifd0, 0x10f)),
    cameraModel: readText(tag(ifd0, 0x110)),
    lensModel: readText(tag(exif, 0xa434)),
    iso: readNumber(tag(exif, 0x8827), littleEndian),
    exposureTime: readNumber(tag(exif, 0x829a), littleEndian),
    aperture: readNumber(tag(exif, 0x829d), littleEndian),
    focalLength: readNumber(tag(exif, 0x920a), littleEndian),
    captureDate: readDate(readText(tag(exif, 0x9003)) ?? readText(tag(ifd0, 0x132))),
  };
}
