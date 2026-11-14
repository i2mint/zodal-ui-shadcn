/**
 * The feedback contract (i2mint/zodal docs/adr/0001-feedback-principle.md): every pressable this
 * package draws acknowledges a press on itself, in the same event, and stays pending, ignoring
 * repeat presses, while the work it started is in flight.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CollectionView, GridCard, ListItem, usePress, PRESS_CLASS, FEEDBACK_MS } from '../src/index.js';
import type { ViewConfig } from '../src/index.js';
import * as shadcn from '../src/index.js';
import * as zodalUi from '@zodal/ui';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  vi.useRealTimers();
});
function mount(element: React.ReactElement): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(element));
  return container;
}

const config = {
  kind: 'grid',
  idField: 'id',
  fields: { label: { name: 'name', label: 'Name', zodType: 'string' }, badges: [], secondary: [] },
  selection: 'multi',
  operations: { item: [{ name: 'launch', label: 'Launch' }], selection: [], collection: [{ name: 'create', label: 'New' }] },
} as unknown as ViewConfig;
const item = { id: 'a', name: 'Synth' };

const pointer = (type: string) =>
  typeof PointerEvent === 'function' ? new PointerEvent(type, { bubbles: true, button: 0 }) : new MouseEvent(type, { bubbles: true, button: 0 });
const never = () => new Promise<never>(() => {});
function deferred() {
  let resolveIt!: () => void;
  const promise = new Promise<void>((r) => (resolveIt = r));
  return { promise, resolve: resolveIt };
}

describe('the feedback contract, for every pressable', () => {
  const cases: Array<[string, (onPress: () => unknown) => HTMLElement]> = [
    ['an operation button', (onPress) => mount(h(GridCard, { item, config, onOperation: onPress })).querySelector('[data-operation="launch"]')!],
    ['a grid card with onOpen', (onPress) => mount(h(GridCard, { item, config, onOpen: onPress })).querySelector('[data-role="card"]')!],
    ['a list row with onOpen', (onPress) => mount(h('ul', null, h(ListItem, { item, config: { ...config, kind: 'list' } as ViewConfig, onOpen: onPress }))).querySelector('[data-role="list-item"]')!],
    ['a collection operation', (onPress) => mount(h(CollectionView, { items: [item], config, onCollectionOperation: onPress })).querySelector('[data-operation="create"]')!],
  ];

  for (const [name, make] of cases) {
    describe(name, () => {
      it('is pressed on pointerdown, before any work, and released on pointerup / pointercancel', () => {
        const target = make(() => {});
        act(() => void target.dispatchEvent(pointer('pointerdown')));
        expect(target.hasAttribute('data-pressed')).toBe(true);
        act(() => void target.dispatchEvent(pointer('pointerup')));
        expect(target.hasAttribute('data-pressed')).toBe(false);
        act(() => void target.dispatchEvent(pointer('pointerdown')));
        act(() => void target.dispatchEvent(pointer('pointercancel')));
        expect(target.hasAttribute('data-pressed')).toBe(false);
      });

      it('is pending in the same event as the click, and ignores repeat presses while in flight', async () => {
        const work = deferred();
        const onPress = vi.fn(() => work.promise);
        const target = make(onPress);
        act(() => target.click());
        expect(target.hasAttribute('data-pending')).toBe(true);
        expect(target.getAttribute('aria-busy')).toBe('true');
        expect(target.getAttribute('aria-disabled')).toBe('true');
        act(() => target.click());
        act(() => target.click());
        expect(onPress).toHaveBeenCalledTimes(1);
        await act(async () => work.resolve());
        expect(target.hasAttribute('data-pending')).toBe(false);
        expect(target.getAttribute('data-status')).toBe('success');
        act(() => target.click());
        expect(onPress).toHaveBeenCalledTimes(2);
      });

      it('carries the press classes', () => {
        const target = make(() => {});
        expect(target.className).toContain('touch-manipulation');
        expect(target.className).toContain('data-[pending]:');
      });
    });
  }

  it('shows the indicator only once the wait passes the delay (no spinner flash)', () => {
    vi.useFakeTimers();
    const view = mount(h(GridCard, { item, config, onOperation: never }));
    const button = view.querySelector('[data-operation="launch"]') as HTMLElement;
    act(() => button.click());
    act(() => void vi.advanceTimersByTime(FEEDBACK_MS.indicator - 1));
    expect(button.querySelector('[data-role="press-indicator"]')).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(button.hasAttribute('data-indicator')).toBe(true);
    expect(button.querySelector('[data-role="press-indicator"]')).not.toBeNull();
  });

  it('a press on an operation inside an item does not press or open the item', () => {
    const onOpen = vi.fn();
    const onOperation = vi.fn();
    const view = mount(h(GridCard, { item, config, onOpen, onOperation, onSelect: () => {} }));
    const card = view.querySelector('[data-role="card"]') as HTMLElement;
    const button = view.querySelector('[data-operation="launch"]') as HTMLElement;
    act(() => void button.dispatchEvent(pointer('pointerdown')));
    expect(card.hasAttribute('data-pressed')).toBe(false);
    act(() => button.click());
    expect(onOperation).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    act(() => (view.querySelector('input[type="checkbox"]') as HTMLElement).click());
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('a back/forward-cache restore clears a pending state left by a press that navigated away', () => {
    const view = mount(h(GridCard, { item, config, onOpen: never }));
    const card = view.querySelector('[data-role="card"]') as HTMLElement;
    act(() => card.click());
    expect(card.hasAttribute('data-pending')).toBe(true);
    const restore = new Event('pageshow');
    Object.defineProperty(restore, 'persisted', { value: true });
    act(() => void window.dispatchEvent(restore));
    expect(card.hasAttribute('data-pending')).toBe(false);
  });

  it('a collapsible group header is a pressable too', () => {
    const grouped = { ...config, group: { field: 'kind', label: 'Kind', collapsible: true, defaultState: 'expanded', multiValued: false, multiValue: 'duplicate', order: [] } } as unknown as ViewConfig;
    const view = mount(h(CollectionView, { items: [{ ...item, kind: 'x' }], config: grouped }));
    const header = view.querySelector('[data-role="group-header"]') as HTMLElement;
    expect(header.hasAttribute('data-zodal-press')).toBe(true);
    act(() => void header.dispatchEvent(pointer('pointerdown')));
    expect(header.hasAttribute('data-pressed')).toBe(true);
    act(() => header.click());
    expect(header.getAttribute('aria-expanded')).toBe('false');
  });

  it('callbacks may return any value (existing expression-bodied handlers still type-check)', () => {
    const onOperation = (op: { name: string }) => op.name.length;
    const onOpen = (it: Record<string, unknown>) => Boolean(it.id);
    mount(h(GridCard, { item, config, onOperation, onOpen }));
  });

  it('the last outcome is cleared when a new press starts', () => {
    const view = mount(h(GridCard, { item, config, onOperation: () => undefined }));
    const button = view.querySelector('[data-operation="launch"]') as HTMLElement;
    act(() => button.click());
    expect(button.getAttribute('data-status')).toBe('success');
    act(() => void button.dispatchEvent(pointer('pointerdown')));
    expect(button.hasAttribute('data-status')).toBe(false);
  });

  it('usePress runs the latest action and reports a failed command result', async () => {
    const onSettled = vi.fn();
    function Tile({ label }: { label: string }) {
      const { props } = usePress(async () => ({ ok: false, error: { code: 'x', message: label } }), { onSettled, enterKey: true });
      return h('div', { ...props, className: PRESS_CLASS, 'data-testid': 'tile' }, label);
    }
    const view = mount(h(Tile, { label: 'first' }));
    act(() => root!.render(h(Tile, { label: 'second' })));
    const tile = view.querySelector('[data-testid="tile"]') as HTMLElement;
    await act(async () => void tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(tile.getAttribute('data-status')).toBe('error');
    expect(onSettled).toHaveBeenCalledWith(expect.objectContaining({ status: 'error', error: { code: 'x', message: 'second' } }));
  });
});

describe('the feedback primitives are @zodal/ui\'s own', () => {
  it('re-exports FEEDBACK_MS, feedbackFor, createActionFeedback and isCommandFailure from @zodal/ui', () => {
    expect(shadcn.FEEDBACK_MS).toBe(zodalUi.FEEDBACK_MS);
    expect(shadcn.feedbackFor).toBe(zodalUi.feedbackFor);
    expect(shadcn.createActionFeedback).toBe(zodalUi.createActionFeedback);
    expect(shadcn.isCommandFailure).toBe(zodalUi.isCommandFailure);
  });
});
