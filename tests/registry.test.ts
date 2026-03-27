import { describe, it, expect } from 'vitest';
import { createShadcnRegistry } from '../src/index.js';
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
