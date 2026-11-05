/**
 * Interleaved RGB pixels produced by a decoder and consumed by processing stages.
 *
 * Memory: a 24 MP image at 16 bit is ~144 MB, so the batch pipeline must stream
 * (decode → process → export → release) one image at a time instead of holding many.
 */
export interface DecodedImage {
  width: number;
  height: number;
  channels: 3;
  bitsPerSample: 8 | 16;
  pixels: Uint8Array | Uint16Array;
}
