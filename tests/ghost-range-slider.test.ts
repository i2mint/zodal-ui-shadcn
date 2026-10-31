import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ResolvedFieldAffordance } from '@zodal/core';
import {
  GhostRangeSlider,
  GhostRangeSliderField,
  linearScale,
  quantileScale,
  quantilesOf,
  rangePositions,
  rangeValueAt,
  rangeSliderScale,
  createShadcnRegistry,
} from '../src/index.js';
import type { RangeValue } from '../src/index.js';

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

describe('quantileScale', () => {
  const q = [0, 1, 2, 2, 2, 10, 100]; // percentiles 0, 16.7, ..., 100; a plateau at 2

  it('maps positions to values piecewise linearly between quantiles', () => {
    const s = quantileScale(q);
    expect(s.toValue(0)).toBe(0);
    expect(s.toValue(1)).toBe(100);
    expect(s.toValue(1 / 12)).toBeCloseTo(0.5);
    expect(s.toValue(5.5 / 6)).toBeCloseTo(55);
  });

  it('inverts toValue, and puts a plateau value at the plateau middle', () => {
    const s = quantileScale(q);
    for (const p of [0, 0.05, 0.1, 0.9, 1]) expect(s.toPosition(s.toValue(p))).toBeCloseTo(p);
    expect(s.toPosition(2)).toBeCloseTo(3 / 6); // indices 2..4
    expect(s.toPosition(-5)).toBe(0);
    expect(s.toPosition(1e9)).toBe(1);
  });

  it('puts ticks at percentiles, labelled with the values there', () => {
    const s = quantileScale(quantilesOf(Array.from({ length: 1001 }, (_, i) => i * i)), { tickPercentiles: [0, 50, 100] });
    expect(s.ticks.map((t) => [t.position, t.percentile])).toEqual([[0, 0], [0.5, 50], [1, 100]]);
    expect(s.ticks[1].value).toBeCloseTo(500 * 500, -2);
  });

  it('rejects unusable quantiles', () => {
    expect(() => quantileScale([3])).toThrow();
    expect(() => quantileScale([3, 1])).toThrow();
  });
});

describe('quantilesOf', () => {
  it('ignores NaN and interpolates', () => {
    expect(quantilesOf([4, NaN, 0, 2], 2)).toEqual([0, 2, 4]);
    expect(quantilesOf([], 4)).toEqual([]);
  });
});

describe('range values and positions', () => {
  const s = linearScale(1900, 2000);

  it('open ends: a thumb at its end means no bound', () => {
    expect(rangeValueAt([0, 1], s)).toEqual([undefined, undefined]);
    expect(rangeValueAt([0, 1], s, { openEnds: false })).toEqual([1900, 2000]);
    expect(rangeValueAt([0.25, 0.5], s, { round: Math.round })).toEqual([1925, 1950]);
    expect(rangePositions([undefined, 1950], s)).toEqual([0, 0.5]);
  });
});

describe('GhostRangeSlider', () => {
  it('renders two labelled thumbs with value text, and percentile ticks', () => {
    const el = mount(
      React.createElement(GhostRangeSlider, {
        value: [1925, undefined] as RangeValue,
        scale: linearScale(1900, 2000, { tickCount: 3 }),
        lowLabel: 'Year from',
        highLabel: 'Year to',
      }),
    );
    const thumbs = el.querySelectorAll('[role=slider]');
    expect(thumbs).toHaveLength(2);
    expect(thumbs[0].getAttribute('aria-label')).toBe('Year from');
    expect(thumbs[0].getAttribute('aria-valuetext')).toBe('1925');
    expect(thumbs[1].getAttribute('aria-valuetext')).toBe('no maximum');
    expect([...el.querySelectorAll('[data-slot=range-slider-tick]')].map((t) => t.textContent)).toEqual(['1900', '1950', '2000']);
  });

  it('commits once per key press, and thumbs never cross', () => {
    const commits: RangeValue[] = [];
    let value: RangeValue = [1950, 1951];
    const render = () =>
      React.createElement(GhostRangeSlider, {
        value,
        scale: linearScale(1900, 2000),
        round: Math.round,
        onValueChange: (v: RangeValue) => (value = v),
        onValueCommit: (v: RangeValue) => commits.push(v),
      });
    const el = mount(render());
    const low = el.querySelectorAll('[role=slider]')[0] as HTMLElement;
    act(() => low.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(commits).toEqual([[1951, 1951]]);
    act(() => root!.render(render()));
    act(() => low.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true })));
    expect(commits).toHaveLength(1); // already at the high thumb: no change, no commit
    act(() => low.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
    expect(commits[1]).toEqual([undefined, 1951]);
  });
});

describe('GhostRangeSliderField', () => {
  const setText = (input: HTMLInputElement, text: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

  it('previews a valid draft, keeps an invalid one, and commits once on blur', () => {
    const changes: RangeValue[] = [];
    const commits: RangeValue[] = [];
    const render = (value: RangeValue) =>
      React.createElement(GhostRangeSliderField, {
        value,
        scale: linearScale(0, 100),
        onValueChange: (v: RangeValue) => changes.push(v),
        onValueCommit: (v: RangeValue) => commits.push(v),
      });
    const el = mount(render([undefined, undefined]));
    const [low] = el.querySelectorAll('input') as unknown as HTMLInputElement[];
    setText(low, '1');
    setText(low, '12');
    setText(low, '12x');
    expect(low.value).toBe('12x'); // never refused
    expect(low.getAttribute('aria-invalid')).toBe('true');
    expect(changes).toEqual([[1, undefined], [12, undefined]]);
    expect(commits).toEqual([]);
    act(() => low.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(commits).toEqual([[12, undefined]]);
    act(() => root!.render(render([12, undefined]))); // the host stores the commit
    expect(low.value).toBe('12');
    setText(low, '');
    act(() => low.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(commits[1]).toEqual([undefined, undefined]); // empty = no bound
  });
});

describe('registry', () => {
  const field = (extra: object) =>
    ({ name: 'year', zodType: 'number', filterable: 'range', ...extra }) as unknown as ResolvedFieldAffordance;

  it("resolves editWidget 'range-slider' range filters to the slider, others to the number pair", () => {
    const registry = createShadcnRegistry();
    expect(registry.resolve(field({ editWidget: 'range-slider' }), { mode: 'filter' })?.name).toBe('RangeSliderFilter');
    expect(registry.resolve(field({}), { mode: 'filter' })?.name).toBe('RangeFilter');
  });

  it('reads the scale from quantiles first, then bounds', () => {
    expect(rangeSliderScale({ quantiles: [0, 5, 100] })?.kind).toBe('quantile');
    expect(rangeSliderScale({ bounds: { min: 0, max: 9 } })?.kind).toBe('linear');
    expect(rangeSliderScale({ bounds: { min: 0 } })).toBeNull();
  });
});
