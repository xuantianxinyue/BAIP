'use client';

import { useEffect, useRef, type MouseEvent } from 'react';
import type { AssetGroup, PhotoAsset } from '../../core';
import type { ClickModifiers } from '../selection';

interface Props {
  groups: AssetGroup[];
  currentId?: string;
  selected: ReadonlySet<string>;
  onItemClick: (id: string, modifiers: ClickModifiers) => void;
}

/** Horizontal strip of thumbnails under the viewer. Clicking opens/selects; the open photo is kept in view. */
export function Filmstrip({ groups, currentId, selected, onItemClick }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<string, HTMLButtonElement>());
  const empty = groups.every((g) => g.assets.length === 0);

  // Follow the open photo when it changes or moves (re-sort / regroup), not on every thumbnail load.
  const currentIndex = currentId ? groups.flatMap((g) => g.assets).findIndex((a) => a.id === currentId) : -1;
  const grouped = groups.some((g) => g.format !== null);
  useEffect(() => {
    if (currentId) items.current.get(currentId)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [currentId, currentIndex, grouped]);

  // A vertical mouse wheel scrolls the strip sideways.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const page = (dir: -1 | 1) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.9, behavior: 'smooth' });
  const click = (id: string) => (e: MouseEvent) => onItemClick(id, { toggle: e.metaKey || e.ctrlKey, range: e.shiftKey });

  return (
    <div className="flex h-40 shrink-0 border-t border-neutral-300 bg-neutral-800" data-testid="filmstrip">
      <PageButton label="‹" testId="filmstrip-prev" onClick={() => page(-1)} />
      <div ref={scroller} data-testid="filmstrip-scroller" className="flex min-w-0 flex-1 items-stretch gap-2 overflow-x-auto px-2 py-2">
        {empty && <p className="m-auto text-xs text-neutral-400">点击「导入文件」或「导入文件夹」添加 RAW / JPG 照片</p>}
        {groups.map((g) => (
          <div key={g.format ?? 'all'} className="flex shrink-0 items-stretch gap-2">
            {g.format && (
              <div data-testid="group-label" className="flex w-6 shrink-0 items-center justify-center text-[11px] font-semibold tracking-wide text-neutral-400 [writing-mode:vertical-rl]">
                {g.format} · {g.assets.length}
              </div>
            )}
            {g.assets.map((a) => (
              <Thumb
                key={a.id}
                asset={a}
                current={a.id === currentId}
                selected={selected.has(a.id)}
                onClick={click(a.id)}
                buttonRef={(el) => {
                  if (el) items.current.set(a.id, el);
                  else items.current.delete(a.id);
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <PageButton label="›" testId="filmstrip-next" onClick={() => page(1)} />
    </div>
  );
}

function PageButton({ label, testId, onClick }: { label: string; testId: string; onClick: () => void }) {
  return (
    <button type="button" data-testid={testId} onClick={onClick} className="w-7 shrink-0 text-xl text-neutral-400 hover:bg-neutral-700 hover:text-white">
      {label}
    </button>
  );
}

interface ThumbProps {
  asset: PhotoAsset;
  current: boolean;
  selected: boolean;
  onClick: (e: MouseEvent) => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
}

function Thumb({ asset: a, current, selected, onClick, buttonRef }: ThumbProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      data-testid="asset-item"
      data-name={a.name}
      data-status={a.status}
      data-load-ms={a.loadMs?.toFixed(0)}
      data-capture={a.exif?.captureDate?.toISOString()}
      data-selected={selected}
      data-current={current}
      title={a.status === 'error' ? `${a.path ?? a.name}\n${a.error}` : (a.path ?? a.name)}
      onClick={onClick}
      className={`relative flex w-32 shrink-0 flex-col rounded p-1 text-left outline-none ${current ? 'ring-2 ring-blue-400' : ''} ${selected ? 'bg-blue-600/40' : 'hover:bg-neutral-700'}`}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded bg-neutral-900">
        {a.thumbUrl ? (
          <img data-testid="thumb-image" src={a.thumbUrl} alt="" draggable={false} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-[11px] text-neutral-500">{a.status === 'error' ? '无法读取' : '读取中…'}</span>
        )}
      </div>
      <div className="mt-1 truncate text-[11px] text-neutral-200">{a.name}</div>
      {a.status === 'error' && <span className="absolute top-1.5 left-1.5 rounded bg-red-600 px-1 text-[10px] text-white">错误</span>}
      {(a.status === 'loading' || a.status === 'pending') && a.thumbUrl === undefined && (
        <span className="absolute top-1.5 left-1.5 rounded bg-neutral-600 px-1 text-[10px] text-white">读取中</span>
      )}
      {selected && <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] text-white">✓</span>}
    </button>
  );
}
