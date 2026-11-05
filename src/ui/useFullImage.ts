'use client';

import { useEffect, useState } from 'react';
import type { PhotoAsset } from '../core';
import type { DecoderRouter } from '../decoding';
import { toImageData } from '../pipeline';

export type FullImageState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; canvas: HTMLCanvasElement; width: number; height: number; ms: number }
  | { status: 'error'; message: string };

/**
 * Full-resolution image of `asset`, loaded once `wanted` turns true and kept afterwards.
 * The caller mounts one instance per photo (the Viewer is keyed by photo id), so switching photos
 * unmounts it: an unfinished decode is aborted (disposing its LibRaw worker) and the canvas is
 * released — only one full image is alive at a time.
 *
 * RAW files are decoded by LibRaw at 8 bit (display only; LibRaw already applies the rotation),
 * JPG/PNG by the browser. Pixels go straight into a `bitmaprenderer` canvas without an extra copy.
 * The RGB → RGBA conversion still runs on the main thread (moves to a worker in phase 2.1).
 */
export function useFullImage(router: DecoderRouter, asset: PhotoAsset | undefined, wanted: boolean): FullImageState {
  const [requested, setRequested] = useState(false);
  const [state, setState] = useState<FullImageState>({ status: 'idle' });
  const ready = asset?.status === 'ready';

  useEffect(() => {
    if (wanted && ready) setRequested(true);
  }, [wanted, ready]);

  useEffect(() => {
    if (!requested || !asset) return;
    const controller = new AbortController();
    let canvas: HTMLCanvasElement | undefined;
    setState({ status: 'loading' });
    const t0 = performance.now();
    (async () => {
      const bitmap =
        asset.kind === 'raw'
          ? await createImageBitmap(toImageData(await router.decode(asset.file, { outputBits: 8 }, controller.signal)))
          : await createImageBitmap(asset.file);
      if (controller.signal.aborted) {
        bitmap.close();
        return;
      }
      const { width, height } = bitmap;
      canvas = document.createElement('canvas');
      canvas.getContext('bitmaprenderer')!.transferFromImageBitmap(bitmap);
      setState({ status: 'ready', canvas, width, height, ms: performance.now() - t0 });
    })().catch((e) => {
      if (!controller.signal.aborted) setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    });
    return () => {
      controller.abort();
      canvas?.getContext('bitmaprenderer')?.transferFromImageBitmap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one load per mounted photo
  }, [requested]);

  return state;
}
