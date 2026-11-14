/** minLength/maxLength on text inputs (#28), option labels in cells (#29), date range filters (#30). */
import { describe, it, expect, afterEach } from 'vitest';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { createShadcnRegistry, cellLabel } from '../src/index.js';
import type { ResolvedFieldAffordance } from '@zodal/core';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const reg = createShadcnRegistry();
const aff = (x: Record<string, unknown>) => ({ editable: true, visible: true, title: 'F', ...x }) as unknown as ResolvedFieldAffordance;

describe('#28 text lengths', () => {
  it('passes minLength and maxLength to text inputs and textareas', () => {
    const Text = reg.resolve(aff({ zodType: 'string' }), { mode: 'form' })!;
    const html = renderToStaticMarkup(React.createElement(Text as any, { field: { value: '', onChange() {} }, config: { name: 'n', label: 'N', minLength: 2, maxLength: 40 } }));
    expect(html).toContain('minLength="2"');
    expect(html).toContain('maxLength="40"');
    const Area = reg.resolve(aff({ zodType: 'string', editWidget: 'textarea' }), { mode: 'form' })!;
    const area = renderToStaticMarkup(React.createElement(Area as any, { field: { value: '', onChange() {} }, config: { name: 'n', label: 'N', maxLength: 9 } }));
    expect(area).toContain('maxLength="9"');
    expect(renderToStaticMarkup(React.createElement(Text as any, { field: { value: '', onChange() {} }, config: { name: 'n', label: 'N' } }))).not.toContain('maxLength');
  });
});

describe('#29 option labels in cells', () => {
  const options = [{ value: '60', label: 'Every hour' }, { value: 'a', label: 'Alpha' }];
  it('draws the option label for scalars, enums and each array element', () => {
    for (const [zodType, value, want] of [['number', 60, 'Every hour'], ['enum', 'a', 'Alpha'], ['string', 'zz', 'zz'], ['array', ['a', 'b'], ['Alpha', '>b<']]] as const) {
      const Cell = reg.resolve(aff({ zodType }), { mode: 'cell' })!;
      const html = renderToStaticMarkup(React.createElement(Cell as any, { value, config: { meta: { options } } }));
      for (const w of [want].flat()) expect(html).toContain(w);
    }
    expect(cellLabel({ meta: {} } as any, 3)).toBe('3');
  });
});

describe('#30 date range filters', () => {
  let root: Root | undefined;
  let container: HTMLElement | undefined;
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
  });
  it('shows date inputs and writes Dates, also where a range slider would be chosen', () => {
    for (const extra of [{}, { filterWidget: 'range-slider' }]) {
      const field = aff({ zodType: 'date', filterable: 'range', ...extra });
      const Filter = reg.resolve(field, { mode: 'filter' })!;
      const written: unknown[] = [];
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
      act(() => root!.render(React.createElement(Filter as any, {
        field: { value: [new Date('2026-01-05T00:00:00Z'), undefined], onChange: (v: unknown) => written.push(v) },
        config: { name: 'd', label: 'Day', zodType: 'date', quantiles: [0, 1e12, 2e12] },
      })));
      const inputs = container.querySelectorAll('input[type=date]');
      expect(inputs.length).toBe(2);
      expect((inputs[0] as HTMLInputElement).value).toBe('2026-01-05');
      const input = inputs[1] as HTMLInputElement;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2026-02-01');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const [lo, hi] = written.at(-1) as [Date, Date];
      expect(lo).toBeInstanceOf(Date);
      expect(hi).toBeInstanceOf(Date);
      expect(hi.toISOString()).toBe('2026-02-01T00:00:00.000Z');
      act(() => root!.unmount());
      root = undefined;
    }
  });
});
