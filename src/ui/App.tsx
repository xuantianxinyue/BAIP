'use client';

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { arrangeAssets, DEFAULT_ARRANGEMENT } from '../core';
import { DecoderRouter } from '../decoding';
import { ActionBar } from './components/ActionBar';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ExifPanel } from './components/ExifPanel';
import { Filmstrip } from './components/Filmstrip';
import { ImportButtons } from './components/ImportButton';
import { SelfTestDialog } from './components/SelfTestDialog';
import { Toast } from './components/Toast';
import { Viewer } from './components/Viewer';
import { EMPTY_SELECTION, selectionReducer, type ClickModifiers } from './selection';
import { useLibrary } from './useLibrary';

/** Keys typed into these elements must not trigger the global shortcuts. */
function isTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== 'checkbox');
}

export function App() {
  const router = useMemo(() => new DecoderRouter(), []);
  const { assets, importFiles, removeAssets } = useLibrary(router);
  const [arrangement, setArrangement] = useState(DEFAULT_ARRANGEMENT);
  const { groups, order } = useMemo(() => arrangeAssets(assets, arrangement), [assets, arrangement]);
  const orderIds = useMemo(() => order.map((a) => a.id), [order]);
  const [selection, dispatch] = useReducer(selectionReducer, EMPTY_SELECTION);
  const [multiMode, setMultiMode] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<string[] | null>(null);
  const [toast, setToast] = useState<{ message: string; seq: number } | null>(null);
  const [selfTestOpen, setSelfTestOpen] = useState(false);
  const current = assets.find((a) => a.id === selection.currentId);

  useEffect(() => dispatch({ type: 'sync', order: orderIds }), [orderIds]);

  const onFiles = useCallback((files: File[]) => setToast({ message: importFiles(files).summary, seq: performance.now() }), [importFiles]);
  const onItemClick = useCallback((id: string, modifiers: ClickModifiers) => dispatch({ type: 'click', id, modifiers, multiMode, order: orderIds }), [multiMode, orderIds]);
  const askRemoveSelected = useCallback(() => selection.selected.size > 0 && setPendingRemoval([...selection.selected]), [selection.selected]);
  const confirmRemoval = useCallback(() => {
    if (!pendingRemoval) return;
    dispatch({ type: 'removed', ids: new Set(pendingRemoval), order: orderIds });
    removeAssets(pendingRemoval);
    setPendingRemoval(null);
  }, [pendingRemoval, orderIds, removeAssets]);
  const cancelRemoval = useCallback(() => setPendingRemoval(null), []);
  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pendingRemoval || selfTestOpen || isTextInput(e.target)) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        dispatch({ type: 'move', delta: e.key === 'ArrowLeft' ? -1 : 1, multiMode, order: orderIds });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        askRemoveSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        dispatch({ type: 'selectAll', order: orderIds });
      } else if (e.key === 'Escape') {
        dispatch({ type: 'clear' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingRemoval, selfTestOpen, multiMode, orderIds, askRemoveSelected]);

  return (
    <div className="flex h-full flex-col bg-neutral-100 text-neutral-900 select-none">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2">
        <h1 className="text-sm font-semibold">RAW AI 批处理</h1>
        <div className="flex gap-2">
          <ImportButtons onFiles={onFiles} />
          <button
            type="button"
            data-testid="selftest-button"
            className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-50"
            onClick={() => setSelfTestOpen(true)}
          >
            环境自检
          </button>
        </div>
      </header>
      <main className="flex min-h-0 flex-1">
        <Viewer key={current?.id ?? 'none'} asset={current} router={router} />
        <ExifPanel asset={current} />
      </main>
      <ActionBar
        arrangement={arrangement}
        onArrangementChange={setArrangement}
        multiMode={multiMode}
        onMultiModeChange={setMultiMode}
        total={assets.length}
        selectedCount={selection.selected.size}
        onRemove={askRemoveSelected}
        onClear={() => assets.length > 0 && setPendingRemoval(orderIds)}
      />
      <Filmstrip groups={groups} currentId={selection.currentId} selected={selection.selected} onItemClick={onItemClick} />

      {toast && <Toast key={toast.seq} message={toast.message} onDone={clearToast} />}
      {pendingRemoval && (
        <ConfirmDialog
          message={`从列表移除 ${pendingRemoval.length} 张照片？磁盘上的原文件不会被删除。`}
          confirmLabel="移除"
          onConfirm={confirmRemoval}
          onCancel={cancelRemoval}
        />
      )}
      {selfTestOpen && <SelfTestDialog onClose={() => setSelfTestOpen(false)} />}
    </div>
  );
}
