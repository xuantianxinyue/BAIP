'use client';

import type { Arrangement, SortKey } from '../../core';

interface Props {
  arrangement: Arrangement;
  onArrangementChange: (a: Arrangement) => void;
  multiMode: boolean;
  onMultiModeChange: (on: boolean) => void;
  total: number;
  selectedCount: number;
  onRemove: () => void;
  onClear: () => void;
}

/** The row above the filmstrip: sorting, grouping, multi-select and removal. */
export function ActionBar({ arrangement, onArrangementChange, multiMode, onMultiModeChange, total, selectedCount, onRemove, onClear }: Props) {
  const set = (patch: Partial<Arrangement>) => onArrangementChange({ ...arrangement, ...patch });
  const btn = 'rounded border border-neutral-300 bg-white px-2 py-0.5 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-neutral-200 bg-white px-3 py-1.5 text-xs" data-testid="action-bar">
      <label className="flex items-center gap-1">
        排序
        <select data-testid="sort-key" value={arrangement.sortKey} onChange={(e) => set({ sortKey: e.target.value as SortKey })} className="rounded border border-neutral-300 px-1 py-0.5">
          <option value="captureDate">拍摄时间</option>
          <option value="name">文件名</option>
        </select>
      </label>
      <button type="button" data-testid="sort-direction" className={btn} onClick={() => set({ direction: arrangement.direction === 'asc' ? 'desc' : 'asc' })}>
        {arrangement.direction === 'asc' ? '↑ 升序' : '↓ 降序'}
      </button>
      <label className="flex items-center gap-1">
        <input type="checkbox" data-testid="group-toggle" checked={arrangement.groupByFormat} onChange={(e) => set({ groupByFormat: e.target.checked })} />
        按格式分组
      </label>
      <span className="h-4 w-px bg-neutral-200" />
      <button
        type="button"
        data-testid="multiselect-toggle"
        aria-pressed={multiMode}
        className={multiMode ? 'rounded border border-blue-600 bg-blue-600 px-2 py-0.5 text-white' : btn}
        onClick={() => onMultiModeChange(!multiMode)}
      >
        多选
      </button>
      <span data-testid="selection-count" className="text-neutral-600 tabular-nums">
        已选 {selectedCount} 张
      </span>
      <button type="button" data-testid="remove-button" className={btn} disabled={selectedCount === 0} onClick={onRemove}>
        移除
      </button>
      <span className="flex-1" />
      <span className="text-neutral-500 tabular-nums" data-testid="total-count">
        共 {total} 张
      </span>
      <button type="button" data-testid="clear-button" className={btn} disabled={total === 0} onClick={onClear}>
        清空列表
      </button>
    </div>
  );
}
