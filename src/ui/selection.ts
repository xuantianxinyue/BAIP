import { neighborAfterRemoval, rangeIds } from '../core';

/**
 * Which photo is open (`currentId`) and which are selected. Kept separate: in multi-select
 * mode clicks only tick photos while the open photo stays put.
 */
export interface SelectionState {
  currentId?: string;
  selected: ReadonlySet<string>;
  /** Start of Shift+click ranges: the last plainly / Cmd-clicked photo. */
  anchorId?: string;
}

export const EMPTY_SELECTION: SelectionState = { selected: new Set() };

export interface ClickModifiers {
  /** Cmd (macOS) or Ctrl. */
  toggle: boolean;
  range: boolean;
}

/** `order` is always the current display order (after sorting/grouping). */
export type SelectionAction =
  | { type: 'click'; id: string; modifiers: ClickModifiers; multiMode: boolean; order: readonly string[] }
  | { type: 'move'; delta: -1 | 1; multiMode: boolean; order: readonly string[] }
  | { type: 'selectAll'; order: readonly string[] }
  | { type: 'clear' }
  | { type: 'removed'; ids: ReadonlySet<string>; order: readonly string[] }
  | { type: 'sync'; order: readonly string[] };

export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case 'click': {
      const { id, modifiers, multiMode, order } = action;
      if (modifiers.range && state.anchorId !== undefined && order.includes(state.anchorId)) {
        const range = rangeIds(order, state.anchorId, id);
        const keep = multiMode || modifiers.toggle;
        const selected = new Set(keep ? [...state.selected, ...range] : range);
        return { ...state, selected, currentId: multiMode ? state.currentId : id };
      }
      if (modifiers.toggle || multiMode) {
        const selected = new Set(state.selected);
        const adding = !selected.has(id);
        if (adding) selected.add(id);
        else selected.delete(id);
        const currentId = !multiMode && adding ? id : state.currentId;
        return { currentId, selected, anchorId: id };
      }
      return { currentId: id, selected: new Set([id]), anchorId: id };
    }
    case 'move': {
      const { order, delta, multiMode } = action;
      if (order.length === 0) return state;
      const at = state.currentId === undefined ? -1 : order.indexOf(state.currentId);
      const next = order[at < 0 ? 0 : Math.min(order.length - 1, Math.max(0, at + delta))];
      if (next === state.currentId) return state;
      return multiMode ? { ...state, currentId: next } : { currentId: next, selected: new Set([next]), anchorId: next };
    }
    case 'selectAll':
      return { ...state, selected: new Set(action.order) };
    case 'clear':
      return state.selected.size === 0 ? state : { ...state, selected: new Set() };
    case 'removed': {
      const { ids, order } = action;
      const currentId = neighborAfterRemoval(order, state.currentId, ids);
      const selected = new Set([...state.selected].filter((id) => !ids.has(id)));
      const anchorId = state.anchorId !== undefined && ids.has(state.anchorId) ? undefined : state.anchorId;
      return { currentId, selected, anchorId };
    }
    case 'sync': {
      // Keep the state consistent with the library: open the first photo when none is open.
      const { order } = action;
      if (state.currentId !== undefined && order.includes(state.currentId)) return state;
      const first = order[0];
      if (first === undefined) return state.currentId === undefined && state.selected.size === 0 ? state : EMPTY_SELECTION;
      return { currentId: first, selected: new Set([first]), anchorId: first };
    }
  }
}
