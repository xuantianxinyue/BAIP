'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyFile, type PhotoAsset } from '../core';
import { DecoderRouter } from '../decoding';
import { bitmapToObjectUrl } from '../pipeline';
import { installDevHooks } from './devHooks';

const PREVIEW_MAX_PIXELS = 1600;

/**
 * UI state for the imported photo list. Metadata + previews are loaded one file at a time
 * so only a single RAW buffer is held in memory.
 */
export function useLibrary(router = new DecoderRouter()) {
  const routerRef = useRef(router);
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const queue = useRef<PhotoAsset[]>([]);
  const running = useRef(false);
  const lastImported = useRef<File | undefined>(undefined);

  useEffect(() => {
    if (new URLSearchParams(location.search).has('e2e')) installDevHooks(routerRef.current, () => lastImported.current);
  }, []);

  const update = useCallback((id: string, patch: Partial<PhotoAsset>) => {
    setAssets((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length > 0) {
      const asset = queue.current.shift()!;
      update(asset.id, { status: 'loading' });
      const t0 = performance.now();
      try {
        const exif = await routerRef.current.readMetadata(asset.file);
        const bitmap = await routerRef.current.embeddedPreview(asset.file, PREVIEW_MAX_PIXELS);
        const previewUrl = bitmap ? await bitmapToObjectUrl(bitmap) : undefined;
        bitmap?.close();
        update(asset.id, { status: 'ready', exif, previewUrl, loadMs: performance.now() - t0 });
      } catch (e) {
        update(asset.id, { status: 'error', error: e instanceof Error ? e.message : String(e), loadMs: performance.now() - t0 });
      }
    }
    running.current = false;
  }, [update]);

  const importFiles = useCallback(
    (files: Iterable<File>) => {
      const added: PhotoAsset[] = [];
      for (const file of files) {
        const kind = classifyFile(file.name);
        const base = { id: crypto.randomUUID(), file, name: file.name };
        added.push(kind ? { ...base, kind, status: 'pending' } : { ...base, kind: 'bitmap', status: 'error', error: '不支持的格式' });
      }
      lastImported.current = added.at(-1)?.file;
      setAssets((list) => [...list, ...added]);
      queue.current.push(...added.filter((a) => a.status === 'pending'));
      void pump();
    },
    [pump],
  );

  useEffect(() => () => assets.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl)), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { assets, importFiles };
}
