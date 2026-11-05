'use client';

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { PhotoAsset } from '../../core';
import type { DecoderRouter } from '../../decoding';
import { useFullImage } from '../useFullImage';

const MAX_SCALE = 4;
const FIT_MARGIN = 16;

/** `scale` is CSS px per image px (1 = 100 %); `x`/`y` place the image's top-left corner in the viewport. */
interface View {
  scale: number;
  x: number;
  y: number;
}
interface Geometry {
  cw: number;
  ch: number;
  /** Full-resolution image size (upright). */
  w: number;
  h: number;
}

const fitScaleOf = (g: Geometry) => Math.max(1e-3, Math.min((g.cw - 2 * FIT_MARGIN) / g.w, (g.ch - 2 * FIT_MARGIN) / g.h));

function fitView(g: Geometry): View {
  const scale = fitScaleOf(g);
  return { scale, x: (g.cw - g.w * scale) / 2, y: (g.ch - g.h * scale) / 2 };
}

/** Centres the image on an axis where it is smaller than the viewport, otherwise keeps the viewport covered. */
function clampPan(v: View, g: Geometry): View {
  const axis = (pos: number, size: number, viewport: number) => (size <= viewport ? (viewport - size) / 2 : Math.min(0, Math.max(viewport - size, pos)));
  return { scale: v.scale, x: axis(v.x, g.w * v.scale, g.cw), y: axis(v.y, g.h * v.scale, g.ch) };
}

/** Zooms to `scale` keeping the image point under (px, py) fixed. Returns null for "fit". */
function zoomAt(v: View, g: Geometry, scale: number, px: number, py: number): View | null {
  const min = fitScaleOf(g);
  const s = Math.min(Math.max(MAX_SCALE, min), Math.max(min, scale));
  if (s <= min * 1.0001) return null;
  const k = s / v.scale;
  return clampPan({ scale: s, x: px - (px - v.x) * k, y: py - (py - v.y) * k }, g);
}

interface Props {
  asset?: PhotoAsset;
  router: DecoderRouter;
}

/**
 * Zoomable photo view. Mount one per photo (`key={asset.id}`): zoom resets to fit and the
 * full-resolution image is released when the photo changes.
 *
 * Shows the embedded preview (≤1600 px) first; once the zoom asks for more pixels than the preview
 * has, the full image is decoded and drawn over it. Its tone differs from the camera JPEG preview,
 * hence the source label.
 */
export function Viewer({ asset, router }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ cw: 0, ch: 0 });
  const [previewSize, setPreviewSize] = useState<{ w: number; h: number }>();
  /** null = fit to window. */
  const [zoom, setZoom] = useState<View | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number; id: number } | null>(null);

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ cw: el.clientWidth, ch: el.clientHeight }));
    ro.observe(el);
    setSize({ cw: el.clientWidth, ch: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const exif = asset?.exif;
  const [fullWanted, setFullWanted] = useState(false);
  const full = useFullImage(router, asset, fullWanted);
  const imageSize =
    full.status === 'ready' ? { w: full.width, h: full.height } : exif && exif.width > 0 && exif.height > 0 ? { w: exif.width, h: exif.height } : previewSize;
  const geometry: Geometry | undefined = imageSize && size.cw > 0 && size.ch > 0 ? { ...size, ...imageSize } : undefined;
  const geomRef = useRef(geometry);
  geomRef.current = geometry;
  const view = geometry ? (zoom ? clampPan(zoom, geometry) : fitView(geometry)) : undefined;
  const viewRef = useRef(view);
  viewRef.current = view;

  // Decode the full image once the preview no longer has enough pixels (or there is no preview at all).
  const noPreview = asset?.status === 'ready' && !asset.previewUrl;
  const needsMore = !!(view && geometry && previewSize && geometry.w * view.scale > previewSize.w * 1.05);
  useEffect(() => {
    if (needsMore || noPreview) setFullWanted(true);
  }, [needsMore, noPreview]);

  // Wheel zoom around the cursor; needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const g = geomRef.current;
      const v = viewRef.current;
      if (!g || !v) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setZoom(zoomAt(v, g, v.scale * factor, e.clientX - rect.left, e.clientY - rect.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const pointIn = (e: { clientX: number; clientY: number }) => {
    const rect = viewport.current!.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  };
  const pannable = !!(view && geometry && (geometry.w * view.scale > geometry.cw || geometry.h * view.scale > geometry.ch));

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !view || !pannable) return;
    drag.current = { ...pointIn(e), x: view.x, y: view.y, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !view) return;
    const p = pointIn(e);
    setZoom({ scale: view.scale, x: d.x + p.px - d.px, y: d.y + p.py - d.py });
  };
  const endDrag = () => {
    drag.current = null;
  };
  const onDoubleClick = (e: ReactMouseEvent) => {
    if (!view || !geometry) return;
    const p = pointIn(e);
    // below 100 % → 100 % at the cursor; at or above → back to fit
    setZoom(view.scale < 0.999 ? zoomAt(view, geometry, 1, p.px, p.py) : null);
  };
  const zoomTo100 = () => view && geometry && setZoom(zoomAt(view, geometry, 1, geometry.cw / 2, geometry.ch / 2));

  const fullCanvasHost = (host: HTMLDivElement | null) => {
    if (host && full.status === 'ready' && host.firstChild !== full.canvas) host.replaceChildren(full.canvas);
  };
  const sourceLabel = full.status === 'ready' ? (asset?.kind === 'raw' ? '原图（LibRaw）' : '原图') : '预览';

  return (
    <section
      ref={viewport}
      data-testid="viewer"
      data-full-ms={full.status === 'ready' ? Math.round(full.ms) : undefined}
      className={`relative min-w-0 flex-1 touch-none overflow-hidden bg-neutral-200 select-none ${pannable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
    >
      {!asset && <p className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">未选择照片</p>}
      {asset && !asset.previewUrl && full.status !== 'ready' && (
        <p className={`absolute inset-0 flex items-center justify-center text-sm ${asset.status === 'error' ? 'text-red-600' : 'text-neutral-500'}`}>
          {asset.status === 'error' ? asset.error : asset.status === 'ready' ? '没有内嵌预览' : '读取中…'}
        </p>
      )}

      {asset && view && geometry && (
        <div
          data-testid="viewer-image-box"
          className="absolute shadow"
          style={{ left: view.x, top: view.y, width: geometry.w * view.scale, height: geometry.h * view.scale, imageRendering: view.scale >= 2 ? 'pixelated' : 'auto' }}
        >
          {asset.previewUrl && (
            <img
              data-testid="preview-image"
              src={asset.previewUrl}
              alt={asset.name}
              draggable={false}
              onLoad={(e) => setPreviewSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="absolute inset-0 h-full w-full object-contain"
            />
          )}
          {full.status === 'ready' && <div ref={fullCanvasHost} data-testid="full-image" data-width={full.width} data-height={full.height} className="absolute inset-0 [&>canvas]:h-full [&>canvas]:w-full" />}
        </div>
      )}
      {/* The preview's natural size is needed before layout when EXIF has no dimensions. */}
      {asset?.previewUrl && !previewSize && (
        <img src={asset.previewUrl} alt="" className="hidden" onLoad={(e) => setPreviewSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
      )}

      {asset && (asset.previewUrl || full.status === 'ready') && (
        <div className="pointer-events-none absolute top-2 left-2 flex gap-1 text-xs">
          <span data-testid="viewer-source" className="rounded bg-black/60 px-2 py-0.5 text-white">
            {sourceLabel}
          </span>
          {full.status === 'loading' && (
            <span data-testid="full-loading" className="rounded bg-blue-600/80 px-2 py-0.5 text-white">
              加载原图中…
            </span>
          )}
          {full.status === 'error' && <span className="rounded bg-red-600/80 px-2 py-0.5 text-white">原图加载失败：{full.message}</span>}
        </div>
      )}

      {view && (
        <div className="absolute right-2 bottom-2 flex items-center gap-1 text-xs" onDoubleClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <span data-testid="zoom-level" className="rounded bg-black/60 px-2 py-0.5 text-white tabular-nums">
            {Math.round(view.scale * 100)}%
          </span>
          <button type="button" data-testid="zoom-fit" className="rounded bg-white/90 px-2 py-0.5 shadow hover:bg-white" onClick={() => setZoom(null)}>
            适应
          </button>
          <button type="button" data-testid="zoom-100" className="rounded bg-white/90 px-2 py-0.5 shadow hover:bg-white" onClick={zoomTo100}>
            100%
          </button>
        </div>
      )}
    </section>
  );
}
