'use client';

import { useEffect, useRef } from 'react';

interface Props {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal confirmation: Enter confirms, Esc cancels. */
export function ConfirmDialog({ message, confirmLabel, onConfirm, onCancel }: Props) {
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ok.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm, onCancel]);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div role="dialog" aria-modal="true" data-testid="confirm-dialog" className="w-96 rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="text-sm">{message}</p>
        <div className="mt-4 flex justify-end gap-2 text-xs">
          <button type="button" data-testid="confirm-cancel" className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-50" onClick={onCancel}>
            取消
          </button>
          <button ref={ok} type="button" data-testid="confirm-ok" className="rounded bg-red-600 px-3 py-1 text-white hover:bg-red-700" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
