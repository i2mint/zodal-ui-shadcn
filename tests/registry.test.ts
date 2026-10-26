import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createShadcnRegistry, cellRenderers, formFieldAffordance } from '../src/index.js';
import type { ResolvedFieldAffordance } from '@zodal/core';

function mockField(overrides: Partial<ResolvedFieldAffordance> = {}): ResolvedFieldAffordance {
  return {
    zodType: 'string',
    sortable: true,
    filterable: false,
    searchable: false,
    editable: true,
    visible: true,
    title: 'Test',
    ...overrides,
  } as ResolvedFieldAffordance;
}

describe('createShadcnRegistry', () => {
  const registry = createShadcnRegistry();

  it('picks SelectInput from the form config widget, whatever the zodType (#21)', () => {
    const top = (zodType: string, type: string, filterable: unknown) =>
      registry.explain(formFieldAffordance(mockField({ zodType, filterable } as any), { type }), { mode: 'form' })[0]?.name;
    // A literal whose filterable was overridden is still a select; an open union (json) never is.
    expect(top('literal', 'select', 'exact')).toBe('SelectInput');
    expect(top('union', 'select', 'select')).toBe('SelectInput');
    expect(top('union', 'json', 'select')).not.toBe('SelectInput');
  });

  it('SelectInput writes the option raw value back and clears optional fields to undefined (#21)', () => {
    const Select = registry.resolve(formFieldAffordance(mockField({ zodType: 'literal' }), { type: 'select' }), { mode: 'form' })!;
    const written: unknown[] = [];
    const config = { name: 'n', label: 'N', required: false, options: [{ label: '2', value: '2', raw: 2 }, { label: '4', value: '4', raw: 4 }] } as any;
    const el: any = (Select as any)({ field: { value: 2, onChange: (v: unknown) => written.push(v) }, config });
    const select = el.props.children[1];
    select.props.onChange({ target: { value: '4' } });
    select.props.onChange({ target: { value: '' } });
    expect(written).toEqual([4, undefined]);
  });

  it('SelectInput keeps falsy raw values (0, false) (#21)', () => {
    const Select = registry.resolve(formFieldAffordance(mockField({ zodType: 'literal' }), { type: 'select' }), { mode: 'form' })!;
    const written: unknown[] = [];
    const config = { name: 'n', label: 'N', required: true, options: [{ label: '0', value: '0', raw: 0 }, { label: 'No', value: 'false', raw: false }] } as any;
    const el: any = (Select as any)({ field: { value: 0, onChange: (v: unknown) => written.push(v) }, config });
    const select = el.props.children[1];
    select.props.onChange({ target: { value: '0' } });
    select.props.onChange({ target: { value: 'false' } });
    expect(written).toEqual([0, false]);
  });

  it('resolves a renderer for string fields in cell mode', () => {
    const component = registry.resolve(mockField({ zodType: 'string' }), { mode: 'cell' });
    expect(component).toBeDefined();
  });

  it('resolves a renderer for number fields in cell mode', () => {
    const component = registry.resolve(mockField({ zodType: 'number' }), { mode: 'cell' });
    expect(component).toBeDefined();
  });

  it('resolves a renderer for boolean fields in cell mode', () => {
    const component = registry.resolve(mockField({ zodType: 'boolean' }), { mode: 'cell' });
    expect(component).toBeDefined();
  });

  it('resolves a renderer for enum fields in cell mode', () => {
    const component = registry.resolve(mockField({ zodType: 'enum' }), { mode: 'cell' });
    expect(component).toBeDefined();
  });

  it('resolves a renderer for date fields in cell mode', () => {
    const component = registry.resolve(mockField({ zodType: 'date' }), { mode: 'cell' });
    expect(component).toBeDefined();
  });

  it('resolves a form renderer for string fields', () => {
    const component = registry.resolve(mockField({ zodType: 'string' }), { mode: 'form' });
    expect(component).toBeDefined();
  });

  it('resolves a filter renderer', () => {
    const component = registry.resolve(
      mockField({ zodType: 'string', filterable: 'search' } as any),
      { mode: 'filter' },
    );
    expect(component).toBeDefined();
  });

  it('has a fallback for unknown types', () => {
    const component = registry.resolve(mockField({ zodType: 'unknown_type' }), { mode: 'cell' });
    expect(component).toBeDefined();
  });

  it('explains renderer resolution', () => {
    const scores = registry.explain(mockField({ zodType: 'string' }), { mode: 'cell' });
    expect(scores.length).toBeGreaterThan(0);
    expect(scores[0]).toHaveProperty('score');
    expect(scores[0]).toHaveProperty('name');
  });

  it('prefers currency renderer over number for currency fields', () => {
    const field = mockField({ zodType: 'number', displayFormat: 'currency' } as any);
    const scores = registry.explain(field, { mode: 'cell' });
    const topScorer = scores[0];
    expect(topScorer.name).toContain('Currency');
  });
});

describe('which renderer wins, per mode (pinned)', () => {
  const registry = createShadcnRegistry();
  const MODES = ['cell', 'form', 'filter'] as const;
  type Mode = (typeof MODES)[number];

  function winner(overrides: Partial<ResolvedFieldAffordance> & Record<string, unknown>, mode: Mode): string | null {
    const field = mockField(overrides as Partial<ResolvedFieldAffordance>);
    const resolved = registry.resolve(field, { mode });
    if (resolved === null) return null;
    const top = registry.explain(field, { mode })[0];
    expect(top.renderer).toBe(resolved);
    return top.name ?? null;
  }

  it.each([
    ['cell', { zodType: 'string' }, 'TextCell'],
    ['cell', { zodType: 'number' }, 'NumberCell'],
    ['cell', { zodType: 'boolean' }, 'BooleanCell'],
    ['cell', { zodType: 'date' }, 'DateCell'],
    ['cell', { zodType: 'enum' }, 'BadgeCell'],
    ['cell', { zodType: 'array' }, 'ArrayCell'],
    ['cell', { zodType: 'object' }, 'TextCell (fallback)'],
    ['cell', { zodType: 'set' }, 'TextCell (fallback)'],
    ['cell', { zodType: 'bigint' }, 'TextCell (fallback)'],
    ['form', { zodType: 'string' }, 'TextInput'],
    ['form', { zodType: 'number' }, 'NumberInput'],
    ['form', { zodType: 'boolean' }, 'CheckboxInput'],
    ['form', { zodType: 'enum' }, 'SelectInput'],
    ['form', { zodType: 'date' }, 'DateInput'],
    ['form', { zodType: 'array' }, 'ReadOnlyInput (fallback)'],
    ['form', { zodType: 'object' }, 'ReadOnlyInput (fallback)'],
    ['form', { zodType: 'set' }, 'ReadOnlyInput (fallback)'],
    ['form', { zodType: 'bigint' }, 'BigIntInput'],
    ['filter', { zodType: 'string', filterable: 'search' }, 'TextFilter'],
    ['filter', { zodType: 'string', filterable: 'exact' }, 'TextFilter (fallback)'],
    ['filter', { zodType: 'enum', filterable: 'select' }, 'SelectFilter'],
    ['filter', { zodType: 'number', filterable: 'range' }, 'RangeFilter'],
    ['filter', { zodType: 'boolean', filterable: 'boolean' }, 'BooleanFilter'],
    // filterable values as inference produces them (zodal core inference.ts)
    ['filter', { zodType: 'array', filterable: 'contains' }, 'TextFilter (fallback)'],
    ['filter', { zodType: 'set', filterable: 'contains' }, 'TextFilter (fallback)'],
    ['filter', { zodType: 'tuple', filterable: 'contains' }, 'TextFilter (fallback)'],
    ['filter', { zodType: 'bigint', filterable: 'range' }, 'RangeFilter'],
    ['filter', { zodType: 'bigint', filterable: 'exact' }, null],
    ['filter', { zodType: 'object', filterable: 'exact' }, null],
    ['filter', { zodType: 'record', filterable: 'exact' }, null],
  ] as const)('%s %o -> %s', (mode, overrides, expected) => {
    expect(winner(overrides as any, mode)).toBe(expected);
  });

  it('never resolves a table cell in a form or a filter', () => {
    const cellNames = new Set(cellRenderers.map(entry => entry.name));
    const types = ['string', 'number', 'int', 'float', 'boolean', 'date', 'enum', 'array', 'object', 'set', 'map',
      'record', 'tuple', 'union', 'bigint', 'literal', 'unknown_type'];
    for (const zodType of types) {
      for (const mode of ['form', 'filter'] as const) {
        const name = winner({ zodType, filterable: true }, mode);
        expect(cellNames.has(name ?? '')).toBe(false);
      }
    }
  });
});

describe('ReadOnlyInput (form fallback)', () => {
  const registry = createShadcnRegistry();
  const config = { name: 'meta', label: 'Meta' } as any;

  function render(value: unknown): string {
    const Component = registry.resolve(mockField({ zodType: 'object' }), { mode: 'form' })!;
    return renderToStaticMarkup(React.createElement(Component, { field: { value, onChange: () => {} }, config }));
  }

  it('shows structured values as JSON, read-only', () => {
    const html = render({ a: 1, n: 2n });
    expect(html).toContain('readOnly');
    expect(html).toContain('value="{&quot;a&quot;:1,&quot;n&quot;:&quot;2&quot;}"');
  });

  it('shows sets and maps nested in an object by their contents', () => {
    expect(render({ s: new Set([1]), m: new Map([['k', 2]]) })).toContain('value="{&quot;s&quot;:[1],&quot;m&quot;:{&quot;k&quot;:2}}"');
  });

  it('shows sets and maps by their contents, and nothing for a missing value', () => {
    expect(render(new Set(['x', 'y']))).toContain('value="[&quot;x&quot;,&quot;y&quot;]"');
    expect(render(new Map([['k', 1]]))).toContain('value="{&quot;k&quot;:1}"');
    expect(render(undefined)).toContain('value=""');
  });
});

describe('displayValue edge cases (#9)', () => {
  const registry = createShadcnRegistry();
  const config = { name: 'meta', label: 'Meta' } as any;
  const render = (value: unknown) => {
    const Component = registry.resolve(mockField({ zodType: 'object' }), { mode: 'form' })!;
    return renderToStaticMarkup(React.createElement(Component, { field: { value, onChange: () => {} }, config }));
  };

  it('shows an Invalid Date instead of throwing, at the top and nested', () => {
    expect(render(new Date('nope'))).toContain('value="Invalid Date"');
    expect(render({ d: new Date('nope') })).toContain('value="{&quot;d&quot;:&quot;Invalid Date&quot;}"');
  });

  it('shows a Map with object keys as its pairs, not [object Object]', () => {
    const html = render(new Map([[{ a: 1 }, 'x']]));
    expect(html).not.toContain('[object Object]');
    expect(html).toContain('value="[[{&quot;a&quot;:1},&quot;x&quot;]]"');
  });

  it('names functions and keeps nested symbols', () => {
    function hook() {}
    expect(render(hook)).toContain('value="[function hook]"');
    expect(render({ f: hook, s: Symbol('k') })).toContain('value="{&quot;f&quot;:&quot;[function hook]&quot;,&quot;s&quot;:&quot;Symbol(k)&quot;}"');
  });
});

describe('DateInput with an Invalid Date (#9)', () => {
  it('renders an empty picker instead of throwing', () => {
    const Component = createShadcnRegistry().resolve(mockField({ zodType: 'date' }), { mode: 'form' })!;
    const html = renderToStaticMarkup(React.createElement(Component, { field: { value: new Date('nope'), onChange: () => {} }, config: { name: 'd', label: 'D' } as any }));
    expect(html).toContain('value=""');
  });
});
