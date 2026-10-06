import { describe, it, expect } from 'vitest';
import type React from 'react';
import { createRendererRegistry } from '@zodal/ui';
import { createShadcnRegistry, TagInput, ChipFilter, ChipCell } from '../src/index.js';
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

describe('tag renderers in the registry', () => {
  const registry = createShadcnRegistry();
  const TAG_ENTRIES = new Set(['TagInput', 'ChipFilter']);
  // The registry as it was before the tag renderers (ArrayCell keeps its name and tester).
  const legacy = createRendererRegistry<React.ComponentType<any>>();
  for (const entry of registry.entries) if (!TAG_ENTRIES.has(entry.name!)) legacy.register(entry);

  // Every field type zodal infers, with the `filterable` its type defaults give.
  const FIELD_TYPES: Array<[string, unknown]> = [
    ['string', 'search'], ['number', 'range'], ['int', 'range'], ['float', 'range'], ['bigint', 'range'],
    ['boolean', 'boolean'], ['enum', 'select'], ['date', 'range'], ['object', false], ['record', false],
    ['set', 'contains'], ['tuple', 'contains'], ['unknown', false],
  ];
  const MODES = ['cell', 'form', 'filter'] as const;
  const winner = (f: ResolvedFieldAffordance, mode: (typeof MODES)[number]) => registry.explain(f, { mode })[0].name;

  it('changes no winner for any non-array field', () => {
    for (const [zodType, filterable] of FIELD_TYPES) {
      for (const mode of MODES) {
        const field = mockField({ zodType, filterable } as any);
        expect(registry.resolve(field, { mode }), `${zodType} / ${mode}`).toBe(legacy.resolve(field, { mode }));
      }
    }
  });

  it('resolves the expected renderers for every field type', () => {
    const table = Object.fromEntries(FIELD_TYPES.map(([zodType, filterable]) => {
      const field = mockField({ zodType, filterable } as any);
      return [zodType, MODES.map((mode) => winner(field, mode))];
    }));
    // Pinned as found, not endorsed: the cell fallback's tester (`() => FALLBACK`)
    // matches every mode and is registered first, so a field with no form/filter
    // renderer of its own resolves to 'TextCell (fallback)' in form and filter mode
    // too. Fixing it would change winners for non-array fields; out of scope here.
    expect(table).toEqual({
      string: ['TextCell', 'TextInput', 'TextFilter'],
      number: ['NumberCell', 'NumberInput', 'RangeFilter'],
      int: ['NumberCell', 'NumberInput', 'RangeFilter'],
      float: ['NumberCell', 'NumberInput', 'RangeFilter'],
      bigint: ['TextCell (fallback)', 'TextCell (fallback)', 'RangeFilter'],
      boolean: ['BooleanCell', 'CheckboxInput', 'BooleanFilter'],
      enum: ['BadgeCell', 'SelectInput', 'SelectFilter'],
      date: ['DateCell', 'DateInput', 'RangeFilter'],
      object: ['TextCell (fallback)', 'TextCell (fallback)', 'TextCell (fallback)'],
      record: ['TextCell (fallback)', 'TextCell (fallback)', 'TextCell (fallback)'],
      set: ['TextCell (fallback)', 'TextCell (fallback)', 'TextCell (fallback)'],
      tuple: ['TextCell (fallback)', 'TextCell (fallback)', 'TextCell (fallback)'],
      unknown: ['TextCell (fallback)', 'TextCell (fallback)', 'TextCell (fallback)'],
    });
  });

  it('resolves the chip renderers for an array field', () => {
    const field = mockField({ zodType: 'array', filterable: 'contains' } as any);
    expect(MODES.map((mode) => winner(field, mode))).toEqual(['ArrayCell', 'TagInput', 'ChipFilter']);
    expect(registry.resolve(field, { mode: 'form' })).toBe(TagInput);
    expect(registry.resolve(field, { mode: 'filter' })).toBe(ChipFilter);
    expect(registry.resolve(field, { mode: 'cell' })).toBe(ChipCell);
  });

  it('keys the chip filter on contains over an array, not on a string', () => {
    const substring = mockField({ zodType: 'string', filterable: 'contains' } as any);
    expect(winner(substring, 'filter')).not.toBe('ChipFilter');
    expect(registry.resolve(substring, { mode: 'filter' })).toBe(legacy.resolve(substring, { mode: 'filter' }));
    expect(winner(mockField({ zodType: 'array', filterable: 'multiSelect' } as any), 'filter')).toBe('MultiSelectFilter');
  });

  it('respects editWidget: another widget declared on an array, or tags asked for on any field', () => {
    expect(winner(mockField({ zodType: 'array', editWidget: 'json' } as any), 'form')).not.toBe('TagInput');
    expect(winner(mockField({ zodType: 'string', editWidget: 'tags' } as any), 'form')).toBe('TagInput');
  });
});
