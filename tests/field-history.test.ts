/**
 * Field input history (i2mint/zodal docs/research/field-input-history.md §6.4): useFieldHistory,
 * HistoryButton, HistoryList, and the pick flow through the package's own text and textarea renderers.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ResolvedFieldAffordance } from '@zodal/core';
import {
  createShadcnRegistry,
  useFieldHistory,
  HistoryButton,
  historyLine,
  relativeTime,
  HISTORY_FILTER_THRESHOLD,
  HISTORY_TOUCH_TARGET_PX,
} from '../src/index.js';
import type { FieldHistoryState, FieldHistoryStore, HistoryEntry, HistoryReason } from '../src/index.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  vi.restoreAllMocks();
});
function mount(element: React.ReactElement): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(element));
  return container;
}
/** Let pending promises (store calls, refreshes) settle inside act. */
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });

/** A small store of the FieldHistoryStore shape (the real one is @zodal/store's createFieldHistory). */
function fakeStore(seed: Array<[string, string]> = []) {
  let t = 1000;
  let n = 0;
  let entries: HistoryEntry[] = [];
  const listeners = new Set<(scope: string | undefined) => void>();
  const calls: Array<[string, string, HistoryReason | undefined]> = [];
  const notify = (scope?: string) => listeners.forEach((l) => l(scope));
  const store: FieldHistoryStore = {
    async record(scope, value, options) {
      const v = value.trim();
      if (!v) return;
      calls.push([scope, v, options?.reason]);
      const e = entries.find((x) => x.scope === scope && x.value === v);
      if (e) Object.assign(e, { at: ++t, uses: e.uses + 1 });
      else entries.push({ id: `e${++n}`, scope, value: v, at: ++t, uses: 1 });
      notify(scope);
    },
    async list(scope) {
      return entries.filter((e) => e.scope === scope)
        .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.at - a.at)
        .map((e) => ({ ...e }));
    },
    async remove(id) { entries = entries.filter((e) => e.id !== id); notify(); },
    async pin(id, pinned = true) { const e = entries.find((x) => x.id === id); if (e) e.pinned = pinned; notify(); },
    async clear(scope) {
      const removed = entries.filter((e) => scope === undefined || e.scope === scope);
      entries = entries.filter((e) => !removed.includes(e));
      notify(scope);
      return removed;
    },
    async restore(list) { entries.push(...list.map((e) => ({ ...e }))); notify(); },
    subscribe(listener) { listeners.add(listener); return () => void listeners.delete(listener); },
  };
  for (const [scope, value] of seed) {
    entries.push({ id: `e${++n}`, scope, value, at: ++t, uses: 1 });
  }
  return { store, calls, all: () => entries };
}

function renderHook(store: FieldHistoryStore | undefined, scope: string | undefined) {
  const result: { current?: FieldHistoryState } = {};
  function Probe() {
    result.current = useFieldHistory(store, scope, { max: 10 });
    return null;
  }
  mount(h(Probe));
  return result as { current: FieldHistoryState };
}

describe('historyLine and relativeTime', () => {
  it('shows the first non-empty line and counts the others', () => {
    expect(historyLine('one line')).toEqual({ first: 'one line', extraLines: 0 });
    expect(historyLine('\n  Verse one\nline two\nline three')).toEqual({ first: 'Verse one', extraLines: 3 });
  });
  it('reads as a compact relative time', () => {
    const now = 10_000_000_000;
    expect(relativeTime(now - 10_000, now)).toBe('just now');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(relativeTime(now - 2 * 3_600_000, now)).toBe('2 h ago');
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe('3 d ago');
  });
});

describe('useFieldHistory', () => {
  it('lists a scope, pinned first then most recent', async () => {
    const { store } = fakeStore([['lyrics', 'a'], ['lyrics', 'b'], ['title', 'x']]);
    const hook = renderHook(store, 'lyrics');
    await settle();
    expect(hook.current.loading).toBe(false);
    expect(hook.current.entries.map((e) => e.value)).toEqual(['b', 'a']);
    await act(() => hook.current.pin(hook.current.entries[1]));
    expect(hook.current.entries.map((e) => e.value)).toEqual(['a', 'b']);
  });

  it('records with the field cap and refreshes', async () => {
    const { store, calls } = fakeStore();
    const record = vi.spyOn(store, 'record');
    const hook = renderHook(store, 'lyrics');
    await settle();
    await act(() => hook.current.record('new value', 'submit'));
    expect(record).toHaveBeenCalledWith('lyrics', 'new value', { reason: 'submit', max: 10 });
    expect(calls).toEqual([['lyrics', 'new value', 'submit']]);
    expect(hook.current.entries.map((e) => e.value)).toEqual(['new value']);
  });

  it('follows changes made elsewhere, through the store subscribe', async () => {
    const { store } = fakeStore();
    const hook = renderHook(store, 'lyrics');
    await settle();
    expect(hook.current.entries).toEqual([]);
    await act(() => store.record('lyrics', 'used on submit', { reason: 'submit' }));
    await settle();
    expect(hook.current.entries.map((e) => e.value)).toEqual(['used on submit']);
  });

  it('clear resolves with the removed entries, and restore puts them back', async () => {
    const { store } = fakeStore([['s', 'a'], ['s', 'b']]);
    const hook = renderHook(store, 's');
    await settle();
    let removed: HistoryEntry[] = [];
    await act(async () => { removed = await hook.current.clear(); });
    expect(removed.map((e) => e.value).sort()).toEqual(['a', 'b']);
    expect(hook.current.entries).toEqual([]);
    await act(() => hook.current.restore(removed));
    expect(hook.current.entries.map((e) => e.value)).toEqual(['b', 'a']);
  });

  it('is empty and inert without a store or a scope', async () => {
    const hook = renderHook(undefined, 'lyrics');
    await settle();
    expect(hook.current.entries).toEqual([]);
    await act(() => hook.current.record('x'));
    expect(await hook.current.clear()).toEqual([]);
  });
});

describe('HistoryButton', () => {
  it('is hidden while the history is empty', () => {
    const c = mount(h(HistoryButton, { label: 'Lyrics', count: 0, expanded: false, onToggle: () => {} }));
    expect(c.querySelector('button')).toBeNull();
  });
  it('is named "<label> history" and draws the rotate-ccw-clock icon', () => {
    const c = mount(h(HistoryButton, { label: 'Lyrics', count: 2, expanded: false, controls: 'l1', onToggle: () => {} }));
    const button = c.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Lyrics history');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('l1');
    expect(button.hasAttribute('data-zodal-press')).toBe(true);
    expect(button.querySelector('svg[data-icon="rotate-ccw-clock"]')).not.toBeNull();
  });
  it('is at least 44 px under a coarse pointer', () => {
    vi.spyOn(window, 'matchMedia' as any).mockImplementation(((q: string) => ({
      matches: q === '(pointer: coarse)', media: q, addEventListener() {}, removeEventListener() {},
    })) as any);
    const c = mount(h(HistoryButton, { label: 'Lyrics', count: 1, expanded: false, onToggle: () => {} }));
    const style = c.querySelector('button')!.style;
    expect(style.minWidth).toBe(`${HISTORY_TOUCH_TARGET_PX}px`);
    expect(style.minHeight).toBe(`${HISTORY_TOUCH_TARGET_PX}px`);
  });
});

// The renderers, as an app draws them: registry.resolve(field, ctx) with { history } in the context.
function mountField(store: FieldHistoryStore | undefined, initial: string, { textarea = false, history = true } = {}) {
  const affordance = { zodType: 'string', editable: true, visible: true, title: 'Lyrics', ...(textarea ? { editWidget: 'textarea' } : {}) } as unknown as ResolvedFieldAffordance;
  const ctx = { mode: 'form' as const, history: store };
  const Component = createShadcnRegistry().resolve(affordance, ctx)!;
  const written: unknown[] = [];
  const config = { name: 'lyrics', label: 'Lyrics', type: textarea ? 'textarea' : 'text', ...(history ? { history: { max: 50, scope: 'lyrics' } } : {}) };
  function Host() {
    const [value, setValue] = React.useState<unknown>(initial);
    return h(Component, { field: { value, onChange: (v: unknown) => { written.push(v); setValue(v); } }, config, context: ctx });
  }
  const c = mount(h(Host));
  const field = () => c.querySelector(textarea ? 'textarea' : 'input[type="text"]') as HTMLInputElement | HTMLTextAreaElement;
  const button = () => c.querySelector('[data-role="history-button"]') as HTMLButtonElement | null;
  const list = () => c.querySelector('[data-role="history-list"]') as HTMLElement | null;
  const rows = () => [...c.querySelectorAll('[data-role="history-row"]')] as HTMLElement[];
  const click = (el: Element) => act(() => { (el as HTMLElement).click(); });
  const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
    act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
  return { c, field, button, list, rows, click, key, written };
}

describe('text and textarea renderers with history', () => {
  it('a textarea field resolves to a textarea', () => {
    const { field } = mountField(undefined, '', { textarea: true });
    expect(field().tagName).toBe('TEXTAREA');
  });

  it('draw no history button without a store, without config.history, or while empty', async () => {
    expect(mountField(undefined, 'x').button()).toBeNull();
    act(() => root?.unmount()); container?.remove();
    const { store } = fakeStore([['lyrics', 'old']]);
    expect(mountField(store, 'x', { history: false }).button()).toBeNull();
    act(() => root?.unmount()); container?.remove();
    const empty = mountField(fakeStore().store, 'x');
    await settle();
    expect(empty.button()).toBeNull();
  });

  it('the button appears after the first record', async () => {
    const { store } = fakeStore();
    const f = mountField(store, 'x');
    await settle();
    expect(f.button()).toBeNull();
    await act(() => store.record('lyrics', 'first', { reason: 'submit' }));
    await settle();
    expect(f.button()).not.toBeNull();
  });

  for (const textarea of [false, true]) {
    it(`picking an entry records the current value, replaces it, closes the list and returns focus (${textarea ? 'textarea' : 'input'})`, async () => {
      // An input cannot hold a newline (the browser strips it), so its past value is one line.
      const past = textarea ? 'older verse\nwith a second line' : 'older verse';
      const { store, calls } = fakeStore([['lyrics', past]]);
      const f = mountField(store, 'what I typed', { textarea });
      await settle();
      await f.click(f.button()!);
      expect(f.list()).not.toBeNull();
      expect(f.button()!.getAttribute('aria-expanded')).toBe('true');
      const row = f.rows()[0];
      expect(row.textContent).toContain('older verse');
      if (textarea) expect(row.textContent).toContain('+1 line');
      await f.click(row.querySelector('[data-role="history-pick"]')!);
      await settle();
      expect(calls).toEqual([['lyrics', 'what I typed', 'pick'], ['lyrics', past, 'pick']]);
      expect(f.written).toEqual([past]);
      expect(f.field().value).toBe(past);
      expect(f.list()).toBeNull();
      expect(document.activeElement).toBe(f.field());
      expect(f.field().selectionStart).toBe(past.length);
      // What was typed is in the history now: nothing was lost.
      await f.click(f.button()!);
      expect(f.rows().map((r) => r.textContent)).toEqual([expect.stringContaining('older verse'), expect.stringContaining('what I typed')]);
    });
  }

  it('Alt+ArrowDown on the field opens the list; Enter picks the active row; Escape closes and refocuses', async () => {
    const { store } = fakeStore([['lyrics', 'a'], ['lyrics', 'b']]);
    const f = mountField(store, '');
    await settle();
    await f.key(f.field(), 'ArrowDown', { altKey: true });
    expect(f.list()).not.toBeNull();
    const grid = f.list()!.querySelector('[role="grid"]')!;
    expect(document.activeElement).toBe(grid);
    await f.key(grid, 'ArrowDown');
    expect(f.rows()[1].getAttribute('aria-selected')).toBe('true');
    expect(grid.getAttribute('aria-activedescendant')).toBe(f.rows()[1].querySelector('[role="gridcell"]')!.id);
    await f.key(grid, 'Escape');
    expect(f.list()).toBeNull();
    expect(document.activeElement).toBe(f.field());
    await f.key(f.field(), 'ArrowDown', { altKey: true });
    await f.key(f.list()!.querySelector('[role="grid"]')!, 'End');
    await f.key(f.list()!.querySelector('[role="grid"]')!, 'Enter');
    await settle();
    expect(f.written).toEqual(['a']); // empty field: nothing recorded first, 'a' (the older) picked
  });

  it('pin and remove from a row; Shift+Delete removes the active row', async () => {
    const { store, all } = fakeStore([['lyrics', 'a'], ['lyrics', 'b'], ['lyrics', 'c']]);
    const f = mountField(store, '');
    await settle();
    await f.click(f.button()!);
    await f.click(f.rows()[2].querySelector('[data-role="history-pin"]')!);
    await settle();
    expect(f.rows()[0].textContent).toContain('a');
    expect(f.rows()[0].hasAttribute('data-pinned')).toBe(true);
    expect(f.list()!.textContent).toContain('Pinned');
    await f.click(f.rows()[1].querySelector('[data-role="history-remove"]')!);
    await settle();
    expect(all().map((e) => e.value).sort()).toEqual(['a', 'b']);
    const grid = f.list()!.querySelector('[role="grid"]')!;
    await f.key(grid, 'Delete', { shiftKey: true });
    await settle();
    expect(all().map((e) => e.value)).toEqual(['b']);
  });

  it('shows a full-value preview of a multi-line active entry', async () => {
    const { store } = fakeStore([['lyrics', 'line 1\nline 2\nline 3']]);
    const f = mountField(store, '');
    await settle();
    await f.click(f.button()!);
    expect(f.list()!.querySelector('[data-role="history-preview"]')!.textContent).toBe('line 1\nline 2\nline 3');
  });

  it(`shows a filter only above ${HISTORY_FILTER_THRESHOLD} entries, and filters`, async () => {
    const few = fakeStore(Array.from({ length: HISTORY_FILTER_THRESHOLD }, (_, i) => ['lyrics', `v${i}`] as [string, string]));
    let f = mountField(few.store, '');
    await settle();
    await f.click(f.button()!);
    expect(f.list()!.querySelector('[data-role="history-filter"]')).toBeNull();
    act(() => root?.unmount()); container?.remove();

    const many = fakeStore([...Array.from({ length: HISTORY_FILTER_THRESHOLD }, (_, i) => ['lyrics', `v${i}`] as [string, string]), ['lyrics', 'Dark synthwave']]);
    f = mountField(many.store, '');
    await settle();
    await f.click(f.button()!);
    const filter = f.list()!.querySelector('[data-role="history-filter"]') as HTMLInputElement;
    expect(filter.getAttribute('role')).toBe('combobox');
    expect(document.activeElement).toBe(filter);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(filter, 'dark');
      filter.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(f.rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Dark synthwave')]);
  });

  it('Clear history clears at once and offers Undo', async () => {
    const { store, all } = fakeStore([['lyrics', 'a'], ['lyrics', 'b'], ['title', 'kept']]);
    const f = mountField(store, '');
    await settle();
    await f.click(f.button()!);
    await f.click(f.list()!.querySelector('[data-role="history-clear"]')!);
    await settle();
    expect(all().map((e) => e.value)).toEqual(['kept']);
    expect(f.button()).not.toBeNull(); // kept while Undo is offered
    const undo = f.list()!.querySelector('[data-role="history-undo"]')!;
    expect(f.list()!.textContent).toContain('History cleared.');
    await f.click(undo);
    await settle();
    expect(all().map((e) => e.value).sort()).toEqual(['a', 'b', 'kept']);
    expect(f.button()).not.toBeNull();
  });
});

describe('review fixes', () => {
  it('TextareaInput takes only free text: a notes list, a description enum, a summary number keep their own renderers', () => {
    const registry = createShadcnRegistry();
    const resolveName = (zodType: string, extra: object = {}) =>
      registry.explain({ zodType, editWidget: 'textarea', editable: true, visible: true, title: 'X', ...extra } as unknown as ResolvedFieldAffordance, { mode: 'form' })
        .filter((r: any) => r.score > 0).sort((a: any, b: any) => b.score - a.score)[0]?.name;
    expect(resolveName('string')).toBe('TextareaInput');
    expect(resolveName('array')).not.toBe('TextareaInput');
    expect(resolveName('number')).toBe('NumberInput');
    expect(resolveName('enum')).toBe('SelectInput');
    expect(resolveName('string', { storageRole: 'content' })).not.toBe('TextareaInput');
  });

  it('Enter on the Clear history button clears; it does not pick', async () => {
    const { store, all } = fakeStore([['lyrics', 'a']]);
    const f = mountField(store, 'typed');
    await settle();
    await f.click(f.button()!);
    const clear = f.list()!.querySelector('[data-role="history-clear"]')!;
    await f.key(clear, 'Enter');
    expect(f.written).toEqual([]);
    await f.click(clear);
    await settle();
    expect(all()).toEqual([]);
  });

  it('pin and remove are reachable with Tab', async () => {
    const { store } = fakeStore([['lyrics', 'a']]);
    const f = mountField(store, '');
    await settle();
    await f.click(f.button()!);
    expect(f.rows()[0].querySelector('[data-role="history-pin"]')!.getAttribute('tabindex')).toBeNull();
    expect(f.rows()[0].querySelector('[data-role="history-remove"]')!.getAttribute('tabindex')).toBeNull();
  });

  it('Undo survives the list closing: the button stays while it is offered', async () => {
    const { store, all } = fakeStore([['lyrics', 'a']]);
    const f = mountField(store, '');
    await settle();
    await f.click(f.button()!);
    await f.click(f.list()!.querySelector('[data-role="history-clear"]')!);
    await settle();
    await f.key(f.list()!, 'Escape');
    expect(f.list()).toBeNull();
    expect(f.button()).not.toBeNull();
    await f.click(f.button()!);
    await f.click(f.list()!.querySelector('[data-role="history-undo"]')!);
    await settle();
    expect(all().map((e) => e.value)).toEqual(['a']);
  });

  it('a pick the store refuses keeps the value and says why, with the list open', async () => {
    const { store } = fakeStore([['lyrics', 'old']]);
    store.record = async () => { throw new Error('quota exceeded'); };
    const f = mountField(store, 'typed');
    await settle();
    await f.click(f.button()!);
    await f.click(f.rows()[0].querySelector('[data-role="history-pick"]')!);
    await settle();
    expect(f.written).toEqual([]);
    expect(f.field().value).toBe('typed');
    expect(f.list()!.querySelector('[role="alert"]')!.textContent).toContain('quota exceeded');
  });

  it('minTarget sets the touch target size', () => {
    vi.spyOn(window, 'matchMedia' as any).mockImplementation(((q: string) => ({
      matches: q === '(pointer: coarse)', media: q, addEventListener() {}, removeEventListener() {},
    })) as any);
    const c = mount(h(HistoryButton, { label: 'Lyrics', count: 1, expanded: false, onToggle: () => {}, minTarget: 48 }));
    expect(c.querySelector('button')!.style.minHeight).toBe('48px');
  });
});
