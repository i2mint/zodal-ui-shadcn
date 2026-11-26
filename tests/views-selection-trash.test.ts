import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  ViewSwitcher, pickPresentation, SelectAllCheckbox, RowCheckbox, SelectionBanner, ActionBar, useLongPress,
  shiftRangeIds, headerCheckState, selectionBannerText, refusalText, TrashView, daysLeft,
} from '../src/index.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => { act(() => root?.unmount()); container?.remove(); root = undefined; });
function mount(el: React.ReactElement): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(el));
  return container;
}
const click = (el: Element | null, init: MouseEventInit = {}) => act(() => { el!.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init })); });
const q = (c: HTMLElement, sel: string) => c.querySelector(sel);
const views = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `v${i}`, name: `View ${i}` }));

describe('ViewSwitcher', () => {
  it('picks the presentation by count and nesting', () => {
    expect(pickPresentation(views(1))).toBe('chips');
    expect(pickPresentation(views(5))).toBe('chips');
    expect(pickPresentation(views(6))).toBe('menu');
    expect(pickPresentation(views(15))).toBe('menu');
    expect(pickPresentation(views(16))).toBe('list');
    expect(pickPresentation([...views(2), { id: 'c', name: 'Child', parentId: 'v0' }])).toBe('list');
  });

  it('chips: selects a view; Modified shows Save as and Revert, and Save only on a saved view', async () => {
    const onSelect = vi.fn(); const onSave = vi.fn(); const onRevert = vi.fn(); const onSaveAs = vi.fn();
    const vs = [{ id: 'all', name: 'All', scope: 'system' }, { id: 'jazz', name: 'Jazz', scope: 'saved' }];
    const c = mount(h(ViewSwitcher, { views: vs, activeId: 'all', modified: true, onSelect, onSave, onSaveAs, onRevert }));
    expect(q(c, '[data-role=modified]')).toBeTruthy();
    expect(q(c, '[data-role=save]')).toBeNull(); // system view: Save as only
    expect(q(c, '[data-role=save-as]')).toBeTruthy();
    click(q(c, '[data-view-id=jazz]'));
    expect(onSelect).toHaveBeenCalledWith('jazz');
    click(q(c, '[data-role=revert]'));
    expect(onRevert).toHaveBeenCalled();
    act(() => root!.render(h(ViewSwitcher, { views: vs, activeId: 'jazz', modified: true, onSelect, onSave })));
    expect(q(c, '[data-role=save]')).toBeTruthy();
    act(() => root!.render(h(ViewSwitcher, { views: vs, activeId: 'jazz', onSelect, onSave })));
    expect(q(c, '[data-role=modified]')).toBeNull();
  });

  it('menu: a select with the pinned views grouped first', () => {
    const vs = views(7).map((v, i) => ({ ...v, pinned: i === 3 }));
    const c = mount(h(ViewSwitcher, { views: vs, activeId: 'v0', onSelect: () => undefined }));
    expect(c.querySelector('select')).toBeTruthy();
    expect(c.querySelector('optgroup[label=Pinned] option')?.textContent).toBe('View 3');
  });
});

describe('selection', () => {
  it('shiftRangeIds and headerCheckState', () => {
    const shown = ['a', 'b', 'c', 'd'];
    expect(shiftRangeIds(shown, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(shiftRangeIds(shown, 'd', 'b')).toEqual(['b', 'c', 'd']);
    expect(shiftRangeIds(shown, undefined, 'c')).toEqual(['c']);
    expect(shiftRangeIds(shown, 'x', 'c')).toEqual(['c']);
    expect(shiftRangeIds(shown, 'a', 'zz')).toEqual([]);
    expect(headerCheckState(0, 4)).toBe('none');
    expect(headerCheckState(2, 4)).toBe('some');
    expect(headerCheckState(4, 4)).toBe('all');
    expect(headerCheckState(0, 0)).toBe('none');
  });

  it('header checkbox is indeterminate for some and toggles all/none', () => {
    const onChange = vi.fn();
    const c = mount(h(SelectAllCheckbox, { selectedShown: 2, shown: 4, onChange }));
    const box = q(c, 'input') as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    click(box);
    expect(onChange).toHaveBeenCalledWith(true);
    act(() => root!.render(h(SelectAllCheckbox, { selectedShown: 4, shown: 4, onChange })));
    expect(box.indeterminate).toBe(false);
    expect(box.checked).toBe(true);
    click(box);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('a row checkbox reports a shift-click as a range', () => {
    const onChange = vi.fn();
    const c = mount(h(RowCheckbox, { id: 'r1', checked: false, onChange }));
    click(q(c, 'input'));
    expect(onChange).toHaveBeenLastCalledWith('r1', true, { range: false });
    click(q(c, 'input'), { shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith('r1', true, { range: true });
  });

  it('banner: offers "all N matching" only when every shown row is selected and more match', () => {
    const base = { shown: 20, totalMatching: 340, onSelectAllMatching: vi.fn(), onClear: vi.fn() };
    const c = mount(h(SelectionBanner, { ...base, selectedShown: 5 }));
    expect(q(c, '[data-role=text]')!.textContent).toBe('5 items selected.');
    expect(q(c, '[data-role=select-all-matching]')).toBeNull();
    act(() => root!.render(h(SelectionBanner, { ...base, selectedShown: 20 })));
    click(q(c, '[data-role=select-all-matching]'));
    expect(base.onSelectAllMatching).toHaveBeenCalled();
    act(() => root!.render(h(SelectionBanner, { ...base, selectedShown: 20, allMatching: true, countChanged: true })));
    expect(q(c, '[data-role=text]')!.textContent).toBe('All 340 items matching selected.');
    expect(q(c, '[data-role=count-changed]')).toBeTruthy();
    expect(q(c, '[data-role=select-all-matching]')).toBeNull();
    click(q(c, '[data-role=clear]'));
    expect(base.onClear).toHaveBeenCalled();
    act(() => root!.render(h(SelectionBanner, { ...base, selectedShown: 0 })));
    expect(c.textContent).toBe('');
    expect(selectionBannerText({ selectedShown: 1, shown: 1, totalMatching: 1 })).toBe('1 item selected.');
  });

  it('long press on touch fires after the delay; a move or a mouse does not', () => {
    vi.useFakeTimers();
    try {
      const fired = vi.fn();
      function Row() { return h('div', { id: 'row', ...useLongPress(fired, 400) }); }
      const c = mount(h(Row));
      const row = q(c, '#row')!;
      const ev = (type: string, pointerType: string) => act(() => { const e = new Event(type, { bubbles: true }); (e as any).pointerType = pointerType; row.dispatchEvent(e); });
      ev('pointerdown', 'mouse'); act(() => { vi.advanceTimersByTime(500); });
      expect(fired).not.toHaveBeenCalled();
      ev('pointerdown', 'touch'); ev('pointermove', 'touch'); act(() => { vi.advanceTimersByTime(500); });
      expect(fired).not.toHaveBeenCalled();
      ev('pointerdown', 'touch'); act(() => { vi.advanceTimersByTime(500); });
      expect(fired).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});

describe('ActionBar', () => {
  const noun = { one: 'song', many: 'songs' };
  it('shows the count, nothing at zero, and the refusal before the click', () => {
    const onAction = vi.fn();
    const add = { name: 'add', label: 'Add', past: 'added', eligible: 9, refusedReason: 'no file' };
    expect(refusalText(add, 12)).toBe("3 of 12 can't be added: no file");
    expect(refusalText({ name: 'x', label: 'X' }, 12)).toBeNull();
    const c = mount(h(ActionBar, { count: 12, actions: [add], onAction, noun }));
    expect(q(c, '[data-role=count]')!.textContent).toBe('12 selected');
    expect(q(c, '[data-role=refusal]')!.textContent).toBe("3 of 12 can't be added: no file");
    act(() => root!.render(h(ActionBar, { count: 0, actions: [], onAction })));
    expect(c.textContent).toBe('');
  });

  it('runs an action; a confirm action asks with the count first; none eligible does nothing', async () => {
    const onAction = vi.fn();
    const c = mount(h(ActionBar, { count: 12, noun, onAction, actions: [
      { name: 'tag', label: 'Tag' },
      { name: 'del', label: 'Delete', variant: 'destructive', confirm: true },
      { name: 'none', label: 'Share', eligible: 0, refusedReason: 'private' },
    ] }));
    click(q(c, '[data-action=tag] button'));
    expect(onAction).toHaveBeenCalledTimes(1);
    const del = q(c, '[data-action=del] [data-role=action]')!;
    click(del);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(del.textContent).toBe('Delete 12 songs?');
    click(q(c, '[data-action=del] [data-role=cancel]'));
    expect(q(c, '[data-action=del] [data-role=action]')!.textContent).toBe('Delete');
    click(q(c, '[data-action=del] [data-role=action]'));
    click(q(c, '[data-action=del] [data-role=action]'));
    expect(onAction).toHaveBeenCalledTimes(2);
    click(q(c, '[data-action=none] button'));
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(q(c, '[data-action=none] button')!.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('TrashView', () => {
  const day = 86_400_000;
  const now = Date.UTC(2026, 0, 31);
  const items = [
    { id: 's1', name: 'Alpha', deletedAt: new Date(now - 2 * day).toISOString() },
    { id: 's2', name: 'Beta', deletedAt: new Date(now - 40 * day).toISOString() },
  ];
  it('days left: whole days, floored at 0, absent without retention', () => {
    expect(daysLeft(items[0]!.deletedAt, 30, now)).toBe(28);
    expect(daysLeft(items[1]!.deletedAt, 30, now)).toBe(0);
    expect(daysLeft(items[0]!.deletedAt, undefined, now)).toBeUndefined();
    expect(daysLeft(null, 30, now)).toBeUndefined();
    expect(daysLeft('nonsense', 30, now)).toBeUndefined();
  });

  it('empty state, retention note, restore without confirm, purge and empty with confirm and count', () => {
    const fns = { onRestore: vi.fn(), onPurge: vi.fn(), onEmptyTrash: vi.fn() };
    const c = mount(h(TrashView, { items: [], ...fns }));
    expect(c.textContent).toBe('The Trash is empty.');
    act(() => root!.render(h(TrashView, { items, retentionDays: 30, now: () => now, ...fns })));
    expect(q(c, '[data-role=retention]')!.textContent).toContain('30 days');
    expect([...c.querySelectorAll('[data-role=days-left]')].map((e) => e.textContent)).toEqual(['28 days left', '0 days left']);
    expect(q(c, '[data-role=restore]')).toBeNull(); // nothing chosen yet
    click(c.querySelectorAll('[data-role=select-row]')[0]!);
    click(c.querySelectorAll('[data-role=select-row]')[1]!);
    click(q(c, '[data-role=restore]'));
    expect(fns.onRestore).toHaveBeenCalledWith(['s1', 's2']);
    const purge = q(c, '[data-role=purge]')!;
    click(purge);
    expect(fns.onPurge).not.toHaveBeenCalled();
    expect(purge.textContent).toBe('Delete 2 items permanently?');
    click(purge);
    expect(fns.onPurge).toHaveBeenCalledWith(['s1', 's2']);
    const empty = q(c, '[data-role=empty]')!;
    click(empty);
    expect(fns.onEmptyTrash).not.toHaveBeenCalled();
    expect(empty.textContent).toBe('Delete all 2 items permanently?');
    click(empty);
    expect(fns.onEmptyTrash).toHaveBeenCalledTimes(1);
  });
});
