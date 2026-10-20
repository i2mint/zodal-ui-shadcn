import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ResolvedFieldAffordance } from '@zodal/core';
import { GhostSlider, thumbLeft, valuePercent, sliderRange, createShadcnRegistry } from '../src/index.js';
import type { GhostSliderProps } from '../src/index.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});
function mount(element: React.ReactElement): HTMLElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(element));
  return container;
}
const rerender = (element: React.ReactElement) => act(() => root!.render(element));
const slider = (props: Partial<GhostSliderProps> = {}) => React.createElement(GhostSlider, { value: 30, ...props });
/** Set a range input's value the way a drag does, then fire `input` (React's onChange). */
function move(input: HTMLInputElement, value: number) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('thumbLeft / valuePercent', () => {
  it('insets the thumb by half its width at each end, not at all in the middle', () => {
    expect(thumbLeft(0)).toBe('calc(0% + 8px)');
    expect(thumbLeft(50)).toBe('calc(50% + 0px)');
    expect(thumbLeft(100)).toBe('calc(100% + -8px)');
    expect(thumbLeft(100, 20)).toBe('calc(100% + -10px)');
  });
  it('maps a value into the range, clamps, and survives a degenerate range', () => {
    expect(valuePercent(30, 0, 100)).toBe(30);
    expect(valuePercent(15, 10, 20)).toBe(50);
    expect(valuePercent(200, 0, 100)).toBe(100);
    expect(valuePercent(5, 5, 5)).toBe(0);
  });
});

describe('GhostSlider', () => {
  const ghost = (c: HTMLElement) => c.querySelector('[data-slot="slider-ghost-thumb"]') as HTMLElement | null;

  it('shows a ghost at the pre-drag value while dragging, and drops it on release', () => {
    const c = mount(slider({ value: 30 }));
    const input = c.querySelector('input')!;
    expect(ghost(c)).toBeNull();
    act(() => input.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(ghost(c)).toBeNull(); // not moved yet: the ghost would sit under the thumb
    rerender(slider({ value: 60 }));
    expect(ghost(c)?.style.left).toBe(thumbLeft(30));
    act(() => window.dispatchEvent(new Event('pointerup')));
    expect(ghost(c)).toBeNull();
  });

  it('puts the ghost at an explicit savedValue, and never on a disabled slider', () => {
    const c = mount(slider({ value: 30, savedValue: 10 }));
    act(() => c.querySelector('input')!.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    rerender(slider({ value: 40, savedValue: 10 }));
    expect(ghost(c)?.style.left).toBe(thumbLeft(10));
    act(() => window.dispatchEvent(new Event('pointercancel')));
    rerender(slider({ value: 30, disabled: true }));
    act(() => c.querySelector('input')!.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    rerender(slider({ value: 50, disabled: true }));
    expect(ghost(c)).toBeNull();
  });

  it('reports every move through onValueChange and the end of a change through onValueCommit', () => {
    const onValueChange = vi.fn();
    const onValueCommit = vi.fn();
    const c = mount(slider({ onValueChange, onValueCommit, min: 0, max: 10, step: 1, value: 3 }));
    const input = c.querySelector('input')!;
    expect([input.min, input.max, input.step]).toEqual(['0', '10', '1']);
    move(input, 5);
    move(input, 6);
    expect(onValueChange.mock.calls).toEqual([[5], [6]]);
    expect(onValueCommit).not.toHaveBeenCalled();
    act(() => input.dispatchEvent(new Event('change')));
    expect(onValueCommit).toHaveBeenCalledTimes(1);
  });
});

describe('the slider form renderer', () => {
  const field = (extra: Partial<ResolvedFieldAffordance> = {}) =>
    ({ zodType: 'number', editable: true, visible: true, title: 'Volume', ...extra }) as unknown as ResolvedFieldAffordance;

  it('is chosen for editWidget: slider over the number input', () => {
    const registry = createShadcnRegistry();
    expect(registry.explain(field({ editWidget: 'slider' }), { mode: 'form' })[0]).toMatchObject({ name: 'SliderInput' });
    expect(registry.explain(field(), { mode: 'form' })[0]).toMatchObject({ name: 'NumberInput' });
  });

  it('reads bounds and step when the config carries them, else 0..100 by 1', () => {
    expect(sliderRange({ bounds: { min: -1, max: 1 }, step: 0.1 })).toEqual({ min: -1, max: 1, step: 0.1 });
    expect(sliderRange({ bounds: { max: 11 } })).toEqual({ min: 0, max: 11, step: 1 });
    expect(sliderRange({})).toEqual({ min: 0, max: 100, step: 1 });
  });

  it('shows the live value beside the slider and writes the form value only on commit', () => {
    const Component = createShadcnRegistry().resolve(field({ editWidget: 'slider' }), { mode: 'form' })!;
    const written: unknown[] = [];
    const c = mount(React.createElement(Component, {
      field: { value: 20, onChange: (v: unknown) => written.push(v) },
      config: { name: 'volume', label: 'Volume', bounds: { min: 0, max: 50 } } as any,
    }));
    const input = c.querySelector('input')!;
    expect(input.max).toBe('50');
    move(input, 35);
    expect(c.querySelector('output')?.textContent).toBe('35');
    expect(written).toEqual([]);
    act(() => input.dispatchEvent(new Event('change')));
    expect(written).toEqual([35]);
  });
});
