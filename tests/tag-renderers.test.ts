import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { FormFieldConfig, FilterFieldConfig, ColumnConfig, RendererContext } from '@zodal/ui';
import { createTagInput, createChipFilter, createChipCell, TagInput, ChipFilter, ChipCell } from '../src/index.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

// ---------------------------------------------------------------------------
// helpers: a real React root, and a parent that holds the value (controlled)
// ---------------------------------------------------------------------------

let roots: Root[] = [];

function render(element: React.ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  const root = createRoot(container);
  act(() => root.render(element));
  roots.push(root);
  return container;
}

afterEach(() => {
  for (const r of roots) act(() => r.unmount());
  roots = [];
  vi.useRealTimers();
});

function Holder({ Component, initial, config, context, onChange }: any) {
  const [value, setValue] = useState(initial);
  return h(Component, {
    field: { value, onChange: (v: unknown) => { onChange(v); setValue(v); } },
    config,
    context,
  });
}

function tagsConfig(overrides: Partial<FormFieldConfig> = {}): FormFieldConfig {
  return {
    name: 'tags', label: 'Tags', type: 'tags', required: false, disabled: false, hidden: false,
    order: 0, zodType: 'array', allowCreate: true, ...overrides,
  } as FormFieldConfig;
}

function renderTags(config: Partial<FormFieldConfig> = {}, value: unknown = [], context?: RendererContext, Component: any = TagInput) {
  const onChange = vi.fn();
  const root = render(h(Holder, { Component, initial: value, config: tagsConfig(config), context, onChange }));
  const input = root.querySelector('input')!;
  return { root, input, onChange, last: () => onChange.mock.calls.at(-1)?.[0] };
}

const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

function type(input: HTMLInputElement, text: string) {
  act(() => {
    input.focus();
    setValue.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function key(target: HTMLElement, k: string): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(e);
  });
  return e;
}

const click = (node: Element) => act(() => (node as HTMLElement).click());
const chipLabels = (root: HTMLElement) => [...root.querySelectorAll('[data-chip-label]')].map((n) => n.textContent);
const live = (root: HTMLElement) => root.querySelector('[role="status"]')!.textContent;
const optionTexts = (root: HTMLElement) => [...root.querySelectorAll('[role="option"]')].map((o) => o.textContent);
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

// ---------------------------------------------------------------------------
// form: tag input
// ---------------------------------------------------------------------------

describe('TagInput (form)', () => {
  it('has the combobox / listbox ARIA wiring and a polite live region', () => {
    const { root, input } = renderTags({ options: [{ label: 'A', value: 'a' }], allowCreate: false });
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    const listbox = document.getElementById(input.getAttribute('aria-controls')!)!;
    expect(listbox.getAttribute('role')).toBe('listbox');
    expect(root.querySelector('[role="status"]')!.getAttribute('aria-live')).toBe('polite');
    expect(root.querySelector('label')!.getAttribute('for')).toBe(input.id);
  });

  it('shows the current values as chips with keyboard-reachable remove buttons', () => {
    const { root } = renderTags({}, ['x', 'y']);
    expect(chipLabels(root)).toEqual(['x', 'y']);
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('button[aria-label^="Remove"]')];
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(b.type).toBe('button');
      expect(b.tabIndex).toBe(0);
    }
    expect(buttons[0].getAttribute('aria-label')).toBe('Remove x');
  });

  it('adds with Enter and with a comma, and announces the add', () => {
    const { root, input, last } = renderTags();
    type(input, 'alpha');
    expect(key(input, 'Enter').defaultPrevented).toBe(true);
    expect(last()).toEqual(['alpha']);
    expect(input.value).toBe('');
    type(input, 'beta');
    key(input, ',');
    expect(last()).toEqual(['alpha', 'beta']);
    expect(chipLabels(root)).toEqual(['alpha', 'beta']);
    expect(live(root)).toBe('beta added');
  });

  it('lets Enter on an empty input through (the form may submit)', () => {
    const { input, onChange } = renderTags();
    expect(key(input, 'Enter').defaultPrevented).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes the last chip with Backspace on an empty input', () => {
    const { root, input, last } = renderTags({}, ['a', 'b']);
    type(input, '');
    key(input, 'Backspace');
    expect(last()).toEqual(['a']);
    expect(chipLabels(root)).toEqual(['a']);
    expect(live(root)).toBe('b removed');
    type(input, 'q');
    key(input, 'Backspace');
    expect(last()).toEqual(['a']);
  });

  it('removes a chip with its button and returns focus to the input', () => {
    const { root, input, last } = renderTags({}, ['a', 'b']);
    click(root.querySelector('[aria-label="Remove a"]')!);
    expect(last()).toEqual(['b']);
    expect(document.activeElement).toBe(input);
    expect(live(root)).toBe('a removed');
  });

  it('refuses a duplicate and keeps the typed text', () => {
    const { root, input, onChange } = renderTags({}, ['a']);
    type(input, 'a');
    key(input, 'Enter');
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('a');
    expect(live(root)).toBe('a is already added');
    expect(root.querySelector('[data-feedback]')!.textContent).toBe('a is already added');
  });

  it('with allowCreate false, refuses free text and keeps it, but takes a matching option', () => {
    const { root, input, onChange, last } = renderTags({
      allowCreate: false,
      options: [{ label: 'Design', value: 'design' }, { label: 'Dev', value: 'dev' }],
    });
    type(input, 'nonsense');
    key(input, 'Enter');
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('nonsense');
    expect(live(root)).toBe('nonsense is not one of the allowed values');

    type(input, 'des');
    expect(input.getAttribute('aria-expanded')).toBe('true');
    const options = [...root.querySelectorAll('[role="option"]')];
    expect(options.map((o) => o.textContent)).toEqual(['Design']);
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id);
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    key(input, 'Enter');
    expect(last()).toEqual(['design']);
    expect(chipLabels(root)).toEqual(['Design']);
  });

  it('moves through options with the arrow keys and closes with Escape, keeping the draft', () => {
    const { root, input, last } = renderTags({
      allowCreate: false,
      options: [{ label: 'One', value: 'one' }, { label: 'Two', value: 'two' }],
    });
    act(() => input.focus());
    key(input, 'ArrowDown');
    const ids = [...root.querySelectorAll('[role="option"]')].map((o) => o.id);
    expect(ids).toHaveLength(2);
    key(input, 'ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe(ids[1]);
    key(input, 'ArrowUp');
    expect(input.getAttribute('aria-activedescendant')).toBe(ids[0]);
    key(input, 'ArrowDown');
    key(input, 'Enter');
    expect(last()).toEqual(['two']);
    type(input, 'o');
    expect(key(input, 'Escape').defaultPrevented).toBe(true);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.value).toBe('o');
  });

  it('writes back numeric raw values and labels chips from options', () => {
    const options = [{ label: 'Low', value: '1', raw: 1 }, { label: 'High', value: '3', raw: 3 }];
    const { root, input, last } = renderTags({ allowCreate: false, options }, [1]);
    expect(chipLabels(root)).toEqual(['Low']);
    type(input, 'hi');
    key(input, 'Enter');
    expect(last()).toEqual([1, 3]);
    expect(typeof last()[1]).toBe('number');
    type(input, '');
    key(input, 'ArrowDown');
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  it('picks an option with the mouse without losing focus', () => {
    const { root, input, last } = renderTags({ allowCreate: false, options: [{ label: 'A', value: 'a' }] });
    type(input, 'a');
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => {
      root.querySelector('[role="option"]')!.dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(true);
    expect(last()).toEqual(['a']);
    expect(document.activeElement).toBe(input);
  });

  it('adds every part of pasted comma-separated text in one change', () => {
    const { input, onChange, last } = renderTags();
    act(() => input.focus());
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'a, b,c' } });
    act(() => {
      input.dispatchEvent(paste);
    });
    expect(paste.defaultPrevented).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(last()).toEqual(['a', 'b', 'c']);
    expect(input.value).toBe('');
  });

  it('keeps the draft on blur', () => {
    const { input, onChange } = renderTags();
    type(input, 'half-typed');
    act(() => input.blur());
    expect(input.value).toBe('half-typed');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disables the input and the remove buttons when the field is disabled', () => {
    const { root, input } = renderTags({ disabled: true }, ['a']);
    expect(input.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('[aria-label="Remove a"]')!.disabled).toBe(true);
  });
});

describe('TagInput with context.suggest', () => {
  it('debounces, passes an AbortSignal and the limit, shows loading, then the results', async () => {
    vi.useFakeTimers();
    let resolve!: (v: any) => void;
    const suggest = vi.fn(() => new Promise<any>((r) => (resolve = r)));
    const { root, input, onChange } = renderTags({}, [], { mode: 'form', suggest }, createTagInput({ debounceMs: 150, limit: 2 }));

    type(input, 'fr');
    const listbox = root.querySelector('[role="listbox"]')!;
    expect(listbox.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('[data-zodal-tags]')!.hasAttribute('data-loading')).toBe(true);
    expect(root.querySelector('[data-listbox-status]')!.textContent).toBe('Loading suggestions…');
    expect(suggest).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(suggest).toHaveBeenCalledTimes(1);
    const [query, field, opts] = suggest.mock.calls[0] as any[];
    expect(query).toBe('fr');
    expect(field).toBe('tags');
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    expect(opts.limit).toBe(2);

    await act(async () => {
      resolve([
        { value: 'frontend', label: 'Frontend' },
        { value: 'french', label: 'French' },
        { value: 'fries', label: 'Fries' },
      ]);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(listbox.getAttribute('aria-busy')).toBe('false');
    expect(optionTexts(root)).toEqual(['Frontend', 'French']);

    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    key(input, 'ArrowDown');
    key(input, 'Enter');
    expect(onChange).toHaveBeenLastCalledWith(['frontend']);
    expect(chipLabels(root)).toEqual(['Frontend']);
  });

  it('aborts the previous request when the user keeps typing and ignores its stale result', async () => {
    const pending: Array<{ q: string; signal: AbortSignal; resolve: (v: any) => void }> = [];
    const suggest = vi.fn((q: string, _f: string, o: any) =>
      new Promise<any>((resolve) => pending.push({ q, signal: o.signal, resolve })));
    const { root, input } = renderTags({}, [], { mode: 'form', suggest }, createTagInput({ debounceMs: 0 }));

    type(input, 'a');
    await flush();
    type(input, 'ab');
    await flush();
    expect(pending.map((p) => p.q)).toEqual(['a', 'ab']);
    expect(pending[0].signal.aborted).toBe(true);
    expect(pending[1].signal.aborted).toBe(false);

    pending[1].resolve([{ value: 'abc', label: 'abc' }]);
    await flush();
    pending[0].resolve([{ value: 'apple', label: 'apple' }]);
    await flush();
    expect(optionTexts(root)).toEqual(['abc']);
  });

  it('keeps the draft when suggest fails, and still adds it on Enter', async () => {
    const suggest = vi.fn(() => Promise.reject(new Error('offline')));
    const { root, input, onChange } = renderTags({}, [], { mode: 'form', suggest }, createTagInput({ debounceMs: 0 }));
    type(input, 'kept');
    await flush();
    expect(root.querySelector('[data-listbox-status]')!.textContent).toBe('Could not load suggestions');
    expect(input.value).toBe('kept');
    key(input, 'Enter');
    expect(onChange).toHaveBeenLastCalledWith(['kept']);
  });

  it('cancels a pending request on unmount', async () => {
    let signal!: AbortSignal;
    const suggest = vi.fn((_q: string, _f: string, o: any) => {
      signal = o.signal;
      return new Promise<any>(() => {});
    });
    const { input } = renderTags({}, [], { mode: 'form', suggest }, createTagInput({ debounceMs: 0 }));
    type(input, 'x');
    await flush();
    for (const r of roots) act(() => r.unmount());
    roots = [];
    expect(signal.aborted).toBe(true);
  });

  it('uses options, not suggest, for a closed vocabulary', () => {
    const suggest = vi.fn(() => []);
    const { input } = renderTags({ allowCreate: false, options: [{ label: 'A', value: 'a' }] }, [], { mode: 'form', suggest });
    type(input, 'a');
    expect(suggest).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// filter: chip filter
// ---------------------------------------------------------------------------

function filterConfig(overrides: Partial<FilterFieldConfig> = {}): FilterFieldConfig {
  return { name: 'tags', label: 'Tags', filterType: 'contains', zodType: 'array', ...overrides } as FilterFieldConfig;
}

function renderFilter(config: Partial<FilterFieldConfig>, value: unknown = undefined, context?: RendererContext, Component: any = ChipFilter) {
  const onChange = vi.fn();
  const root = render(h(Holder, { Component, initial: value, config: filterConfig(config), context, onChange }));
  return { root, onChange };
}

describe('ChipFilter', () => {
  const opts = [{ label: 'Red', value: 'red' }, { label: 'Blue', value: 'blue' }];

  it('shows options as aria-pressed toggles and emits arrayContainsAny', () => {
    const { root, onChange } = renderFilter({ options: opts });
    const group = root.querySelector('[role="group"]')!;
    expect(group.textContent).toContain('Tags is any of');
    expect(document.getElementById(group.getAttribute('aria-labelledby')!)!.textContent).toBe('Tags is any of');
    const [red, blue] = [...root.querySelectorAll<HTMLButtonElement>('button')];
    expect(red.getAttribute('aria-pressed')).toBe('false');
    click(red);
    expect(red.getAttribute('aria-pressed')).toBe('true');
    expect(onChange).toHaveBeenLastCalledWith({ field: 'tags', operator: 'arrayContainsAny', value: ['red'] });
    click(blue);
    expect(onChange).toHaveBeenLastCalledWith({ field: 'tags', operator: 'arrayContainsAny', value: ['red', 'blue'] });
    click(red);
    click(blue);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('reflects the current filter value and emits raw numbers', () => {
    const numeric = [{ label: 'One', value: '1', raw: 1 }, { label: 'Two', value: '2', raw: 2 }];
    const { root, onChange } = renderFilter({ name: 'n', options: numeric }, { field: 'n', operator: 'arrayContainsAny', value: [2] });
    const [one, two] = [...root.querySelectorAll('button')];
    expect(two.getAttribute('aria-pressed')).toBe('true');
    click(one);
    expect(onChange).toHaveBeenLastCalledWith({ field: 'n', operator: 'arrayContainsAny', value: [2, 1] });
  });

  it('switches to a type-ahead above maxToggleOptions, limited to the vocabulary', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ label: `Tag ${i}`, value: `t${i}` }));
    const { root, onChange } = renderFilter({ options: many }, undefined, undefined, createChipFilter({ maxToggleOptions: 3 }));
    const input = root.querySelector<HTMLInputElement>('[role="combobox"]')!;
    expect(input.getAttribute('aria-labelledby')).toBe(root.querySelector('[role="group"]')!.getAttribute('aria-labelledby'));
    type(input, 'free text');
    key(input, 'Enter');
    expect(onChange).not.toHaveBeenCalled();
    type(input, 'tag 3');
    key(input, 'Enter');
    expect(onChange).toHaveBeenLastCalledWith({ field: 'tags', operator: 'arrayContainsAny', value: ['t3'] });
    expect(chipLabels(root)).toEqual(['Tag 3']);
  });

  it('without options, takes typed tags and asks suggest', async () => {
    const suggest = vi.fn(() => [{ value: 'urgent', label: 'urgent' }]);
    const { root, onChange } = renderFilter({}, undefined, { mode: 'filter', suggest }, createChipFilter({ debounceMs: 0 }));
    const input = root.querySelector<HTMLInputElement>('[role="combobox"]')!;
    type(input, 'urg');
    await flush();
    expect(suggest).toHaveBeenCalledWith('urg', 'tags', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    type(input, 'anything');
    key(input, 'Enter');
    expect(onChange).toHaveBeenLastCalledWith({ field: 'tags', operator: 'arrayContainsAny', value: ['anything'] });
  });
});

// ---------------------------------------------------------------------------
// cell: chip cell
// ---------------------------------------------------------------------------

function columnConfig(): ColumnConfig {
  return {
    id: 'tags', header: 'Tags', accessorKey: 'tags', enableSorting: false, enableColumnFilter: true,
    enableGlobalFilter: false, enableGrouping: false, enableHiding: true, enableResizing: true,
    meta: { zodType: 'array', filterType: 'contains', editable: true, inlineEditable: false },
  } as ColumnConfig;
}

describe('ChipCell', () => {
  const cell = (value: unknown, Component: any = ChipCell) => render(h(Component, { value, config: columnConfig(), row: {} }));

  it('shows chips and a "+N" overflow chip naming what it hides', () => {
    const root = cell(['a', 'b', 'c', 'd', 'e']);
    expect(root.querySelector('[role="list"]')).not.toBeNull();
    expect(root.querySelectorAll('[role="listitem"]')).toHaveLength(4);
    const overflow = root.querySelector('[data-overflow]')!;
    expect(overflow.textContent).toBe('+2');
    expect(overflow.getAttribute('aria-label')).toBe('2 more: d, e');
    expect(overflow.getAttribute('title')).toBe('d, e');
    expect(root.textContent).not.toContain('a, b, c, d, e');
  });

  it('shows no overflow chip when everything fits', () => {
    const root = cell([1, 2]);
    expect(root.querySelector('[data-overflow]')).toBeNull();
    expect(root.querySelectorAll('[role="listitem"]')).toHaveLength(2);
  });

  it('takes the number of visible chips as a setting', () => {
    const root = cell(['a', 'b', 'c'], createChipCell({ maxVisibleChips: 1 }));
    expect(root.querySelector('[data-overflow]')!.textContent).toBe('+2');
  });

  it('shows an em dash for an empty array or a non-array', () => {
    expect(cell([]).textContent).toBe('—');
    expect(cell(null).textContent).toBe('—');
  });
});
