import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, selectionReducer, type SelectionAction, type SelectionState } from './selection';

const order = ['a', 'b', 'c', 'd', 'e'];
const plain = { toggle: false, range: false };
const toggle = { toggle: true, range: false };
const range = { toggle: false, range: true };
const run = (actions: SelectionAction[], from: SelectionState = EMPTY_SELECTION) => actions.reduce(selectionReducer, from);
const click = (id: string, modifiers = plain, multiMode = false): SelectionAction => ({ type: 'click', id, modifiers, multiMode, order });
const view = (s: SelectionState) => ({ current: s.currentId, selected: [...s.selected].sort() });

describe('selection', () => {
  it('plain click opens and selects only that photo', () => {
    expect(view(run([click('b'), click('d')]))).toEqual({ current: 'd', selected: ['d'] });
  });

  it('Cmd/Ctrl+click toggles and opens the photo it adds', () => {
    expect(view(run([click('a'), click('c', toggle)]))).toEqual({ current: 'c', selected: ['a', 'c'] });
    expect(view(run([click('a'), click('c', toggle), click('c', toggle)]))).toEqual({ current: 'c', selected: ['a'] });
  });

  it('Shift+click selects the range from the anchor in display order', () => {
    expect(view(run([click('d'), click('b', range)]))).toEqual({ current: 'b', selected: ['b', 'c', 'd'] });
    // the anchor stays, so a second Shift+click re-ranges from it
    expect(view(run([click('b'), click('d', range), click('c', range)]))).toEqual({ current: 'c', selected: ['b', 'c'] });
  });

  it('multi-select mode ticks photos without changing the open photo', () => {
    const s = run([click('a'), click('c', plain, true), click('e', range, true)]);
    expect(view(s)).toEqual({ current: 'a', selected: ['a', 'c', 'd', 'e'] });
    expect(view(run([click('a', plain, true)], s))).toEqual({ current: 'a', selected: ['c', 'd', 'e'] });
  });

  it('arrow keys move the open photo; in normal mode the selection follows', () => {
    const s = run([click('b'), { type: 'move', delta: 1, multiMode: false, order }]);
    expect(view(s)).toEqual({ current: 'c', selected: ['c'] });
    const m = run([click('b'), click('e', toggle), { type: 'move', delta: -1, multiMode: true, order }]);
    expect(view(m)).toEqual({ current: 'd', selected: ['b', 'e'] });
    expect(view(run([{ type: 'move', delta: 1, multiMode: false, order }], s)).current).toBe('d');
    expect(run([click('e'), { type: 'move', delta: 1, multiMode: false, order }]).currentId).toBe('e');
  });

  it('select all / clear keep the open photo', () => {
    const s = run([click('b'), { type: 'selectAll', order }]);
    expect(view(s)).toEqual({ current: 'b', selected: order });
    expect(view(run([{ type: 'clear' }], s))).toEqual({ current: 'b', selected: [] });
  });

  it('after removal opens the neighbour and drops removed ids', () => {
    const s = run([click('b'), click('c', toggle), { type: 'removed', ids: new Set(['b', 'c']), order }]);
    expect(view(s)).toEqual({ current: 'd', selected: [] });
  });

  it('sync opens the first photo when nothing valid is open', () => {
    expect(view(run([{ type: 'sync', order }]))).toEqual({ current: 'a', selected: ['a'] });
    expect(run([click('c'), { type: 'sync', order }]).currentId).toBe('c');
    expect(run([click('c'), { type: 'sync', order: [] }])).toEqual(EMPTY_SELECTION);
  });
});
