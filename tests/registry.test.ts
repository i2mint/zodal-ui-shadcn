import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createShadcnRegistry, cellRenderers } from '../src/index.js';
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
    ['form', { zodType: 'bigint' }, 'ReadOnlyInput (fallback)'],
    ['filter', { zodType: 'string', filterable: 'search' }, 'TextFilter'],
    ['filter', { zodType: 'string', filterable: 'exact' }, 'TextFilter (fallback)'],
    ['filter', { zodType: 'enum', filterable: 'select' }, 'SelectFilter'],
    ['filter', { zodType: 'number', filterable: 'range' }, 'RangeFilter'],
    ['filter', { zodType: 'boolean', filterable: 'boolean' }, 'BooleanFilter'],
    ['filter', { zodType: 'array', filterable: 'contains' }, 'TextFilter (fallback)'],
    ['filter', { zodType: 'object', filterable: true }, null],
    ['filter', { zodType: 'set', filterable: true }, null],
    ['filter', { zodType: 'bigint', filterable: true }, null],
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

  it('shows sets and maps by their contents, and nothing for a missing value', () => {
    expect(render(new Set(['x', 'y']))).toContain('value="[&quot;x&quot;,&quot;y&quot;]"');
    expect(render(new Map([['k', 1]]))).toContain('value="{&quot;k&quot;:1}"');
    expect(render(undefined)).toContain('value=""');
  });
});
