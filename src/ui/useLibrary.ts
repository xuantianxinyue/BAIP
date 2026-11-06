'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { importSummary, planImport, type PhotoAsset } from '../core';
import { DecoderRouter } from '../decoding';
import { bitmapToObjectUrl } from '../pipeline';
import { installDevHooks } from './devHooks';

const PREVIEW_MAX_PIXELS = 1600;
const THUMB_MAX_PIXELS = 240;

export interface ImportResult {
  imported: number;
  unsupported: number;
  duplicates: number;
  summary: string;
}

/**
 * Library-local ids. Not `crypto.randomUUID()`: that only exists in secure contexts, and the app
 * must also work when opened over plain http on a LAN/public IP (it then just runs single-threaded).
 */
let nextAssetId = 0;
const newAssetId = () => `asset-${++nextAssetId}`;

function revokeUrls(asset: Pick<PhotoAsset, 'previewUrl' | 'thumbUrl'>) {
  if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl);
  if (asset.thumbUrl) URL.revokeObjectURL(asset.thumbUrl);
}

/**
 * The imported photo list. Unsupported files are dropped and duplicates skipped at import;
 * metadata, preview and thumbnail are then loaded one file at a time so only a single RAW
 * buffer is held in memory. Removing a photo only drops it from the list (never touches disk)
 * and releases its object URLs.
 */
export function useLibrary(router = new DecoderRouter()) {
  const routerRef = useRef(router);
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const assetsRef = useRef<PhotoAsset[]>([]);
  assetsRef.current = assets;
  /** Ids currently in the library; a load that finishes after its asset was removed is discarded. */
  const liveIds = useRef(new Set<string>());
  const queue = useRef<PhotoAsset[]>([]);
  const running = useRef(false);
  const lastImported = useRef<File | undefined>(undefined);

  useEffect(() => {
    if (new URLSearchParams(location.search).has('e2e')) installDevHooks(routerRef.current, () => lastImported.current, () => assetsRef.current);
  }, []);

  const update = useCallback((id: string, patch: Partial<PhotoAsset>) => {
    setAssets((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    while (queue.current.length > 0) {
      const asset = queue.current.shift()!;
      if (!liveIds.current.has(asset.id)) continue;
      update(asset.id, { status: 'loading' });
      const t0 = performance.now();
      let patch: Partial<PhotoAsset>;
      try {
        const exif = await routerRef.current.readMetadata(asset.file);
        const bitmap = await routerRef.current.embeddedPreview(asset.file, PREVIEW_MAX_PIXELS);
        let previewUrl: string | undefined;
        let thumbUrl: string | undefined;
        if (bitmap) {
          try {
            previewUrl = await bitmapToObjectUrl(bitmap);
            thumbUrl = await bitmapToObjectUrl(bitmap, { maxPixelSize: THUMB_MAX_PIXELS, quality: 0.8 });
          } finally {
            bitmap.close();
          }
        }
        patch = { status: 'ready', exif, previewUrl, thumbUrl, loadMs: performance.now() - t0 };
      } catch (e) {
        patch = { status: 'error', error: e instanceof Error ? e.message : String(e), loadMs: performance.now() - t0 };
      }
      if (liveIds.current.has(asset.id)) update(asset.id, patch);
      else revokeUrls(patch);
    }
    running.current = false;
  }, [update]);

  const importFiles = useCallback(
    (files: Iterable<File>): ImportResult => {
      const plan = planImport(files, new Set(assetsRef.current.map((a) => a.key)));
      const added: PhotoAsset[] = plan.accepted.map(({ file, kind, key }) => ({
        id: newAssetId(),
        file,
        name: file.name,
        path: file.webkitRelativePath || undefined,
        key,
        kind,
        status: 'pending',
      }));
      if (added.length > 0) {
        lastImported.current = added.at(-1)!.file;
        for (const a of added) liveIds.current.add(a.id);
        assetsRef.current = [...assetsRef.current, ...added];
        setAssets((list) => [...list, ...added]);
        queue.current.push(...added);
        void pump();
      }
      return { imported: added.length, unsupported: plan.unsupported, duplicates: plan.duplicates, summary: importSummary(plan) };
    },
    [pump],
  );

  /** Removes photos from the list (not from disk) and frees their previews. */
  const removeAssets = useCallback((ids: Iterable<string>) => {
    const removed = new Set(ids);
    if (removed.size === 0) return;
    for (const id of removed) liveIds.current.delete(id);
    queue.current = queue.current.filter((a) => !removed.has(a.id));
    for (const a of assetsRef.current) if (removed.has(a.id)) revokeUrls(a);
    assetsRef.current = assetsRef.current.filter((a) => !removed.has(a.id));
    setAssets((list) => list.filter((a) => !removed.has(a.id)));
  }, []);

  useEffect(() => () => assetsRef.current.forEach(revokeUrls), []);

  return { assets, importFiles, removeAssets };
}
