import { describe, it, expect, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ResolvedFieldAffordance } from '@zodal/core';
import { GhostSlider, thumbLeft, valuePercent, snapToStep, sliderRange, createShadcnRegistry, SLIDER_TOUCH_SLOP_PX } from '../src/index.js';
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

describe('snapToStep', () => {
  it('snaps to min + k * step within the bounds, without float noise', () => {
    expect(snapToStep(0.30000000000000004, 0, 1, 0.1)).toBe(0.3);
    expect(snapToStep(7.4, 2, 10, 2)).toBe(8);
    expect(snapToStep(-3, 0, 10, 1)).toBe(0);
    expect(snapToStep(12, 0, 10, 3)).toBe(9);
    expect(snapToStep(1.2345, 0, 2, 0)).toBe(1.2345);
  });
});

describe('GhostSlider', () => {
  const ghost = (c: HTMLElement) => c.querySelector('[data-slot="slider-ghost-thumb"]') as HTMLElement | null;

  /** A track 216px wide at x = 0, so with a 16px thumb x = 8 is the minimum and x = 208 the maximum. */
  function layOut(c: HTMLElement) {
    const input = c.querySelector('input')!;
    input.getBoundingClientRect = () => ({ left: 0, right: 216, width: 216, top: 0, bottom: 16, height: 16, x: 0, y: 0, toJSON() {} }) as DOMRect;
    return { input, area: c.querySelector('[data-slot="slider"]') as HTMLElement };
  }
  function pointer(el: HTMLElement, type: string, clientX: number, pointerType = 'touch') {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0 });
    Object.defineProperties(e, { pointerId: { value: 1 }, pointerType: { value: pointerType } });
    act(() => el.dispatchEvent(e));
  }
  /** A host that keeps the value, like the real one: previews move the thumb. */
  function Host({ onCommit, onChange, ...props }: Partial<GhostSliderProps> & { onCommit?: (v: number) => void; onChange?: (v: number) => void }) {
    const [v, set] = React.useState(props.value ?? 30);
    return React.createElement(GhostSlider, {
      ...props,
      value: v,
      onValueChange: (x: number) => (set(x), onChange?.(x)),
      onValueCommit: onCommit,
    });
  }

  it('shows a ghost at the pre-drag value while dragging, and drops it on release', () => {
    const c = mount(React.createElement(Host, { value: 30 }));
    const { area } = layOut(c);
    expect(ghost(c)).toBeNull();
    pointer(area, 'pointerdown', 68); // the thumb at 30 is centred at 8 + 0.3 * 200 = 68
    expect(ghost(c)).toBeNull(); // not moved yet: the ghost would sit under the thumb
    pointer(area, 'pointermove', 128);
    expect(ghost(c)?.style.insetInlineStart).toBe(thumbLeft(30));
    pointer(area, 'pointerup', 128);
    expect(ghost(c)).toBeNull();
  });

  it('lands where the pointer is lifted: the grabbed thumb follows it 1:1, without a jump', () => {
    const changes: number[] = [];
    const commits: number[] = [];
    const c = mount(React.createElement(Host, { value: 30, onChange: (v) => changes.push(v), onCommit: (v) => commits.push(v) }));
    const { area, input } = layOut(c);
    pointer(area, 'pointerdown', 74); // 6px right of the thumb's centre
    expect(changes).toEqual([]); // grabbing does not move it
    pointer(area, 'pointermove', 74 + SLIDER_TOUCH_SLOP_PX + 34); // 40px right: 20 units
    expect(input.value).toBe('50');
    pointer(area, 'pointermove', 174);
    pointer(area, 'pointerup', 174);
    expect(input.value).toBe('80');
    expect(commits).toEqual([80]);
  });

  it('moves the thumb to a tap on the track, and does nothing for a tap on the thumb', () => {
    const commits: number[] = [];
    const c = mount(React.createElement(Host, { value: 30, onCommit: (v) => commits.push(v) }));
    const { area, input } = layOut(c);
    pointer(area, 'pointerdown', 70);
    pointer(area, 'pointerup', 70);
    expect(commits).toEqual([]);
    pointer(area, 'pointerdown', 188);
    pointer(area, 'pointerup', 188);
    expect([input.value, commits]).toEqual(['90', [90]]);
  });

  it('a touch smaller than the slop is not a drag, and a cancelled drag reverts', () => {
    const commits: number[] = [];
    const c = mount(React.createElement(Host, { value: 30, onCommit: (v) => commits.push(v) }));
    const { area, input } = layOut(c);
    pointer(area, 'pointerdown', 68);
    pointer(area, 'pointermove', 68 + SLIDER_TOUCH_SLOP_PX - 1);
    expect(input.value).toBe('30');
    pointer(area, 'pointermove', 148);
    expect(input.value).toBe('70');
    pointer(area, 'pointercancel', 148); // the browser took the gesture (a scroll, a system swipe)
    expect([input.value, commits, ghost(c)]).toEqual(['30', [], null]);
  });

  it('a mouse press on the track moves the thumb there at once', () => {
    const c = mount(React.createElement(Host, { value: 30 }));
    const { area, input } = layOut(c);
    pointer(area, 'pointerdown', 108, 'mouse');
    expect(input.value).toBe('50');
    expect(ghost(c)?.style.insetInlineStart).toBe(thumbLeft(30));
  });

  it('puts the ghost at an explicit savedValue, and never reacts on a disabled slider', () => {
    const c = mount(React.createElement(Host, { value: 30, savedValue: 10 }));
    const { area } = layOut(c);
    pointer(area, 'pointerdown', 68);
    pointer(area, 'pointermove', 108);
    expect(ghost(c)?.style.insetInlineStart).toBe(thumbLeft(10));
    pointer(area, 'pointerup', 108);
    const onValueChange = vi.fn();
    rerender(slider({ value: 30, disabled: true, onValueChange }));
    const d = layOut(c);
    pointer(d.area, 'pointerdown', 188, 'mouse');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(ghost(c)).toBeNull();
  });

  it('never hands the pointer to the native input, and leaves vertical panning to the page', () => {
    const c = mount(slider());
    expect(c.querySelector('input')!.style.pointerEvents).toBe('none');
    expect((c.querySelector('[data-slot="slider"]') as HTMLElement).style.touchAction).toBe('pan-y');
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
