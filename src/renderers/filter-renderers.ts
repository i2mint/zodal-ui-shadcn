/**
 * Filter widget renderers.
 */

import React from 'react';
import { PRIORITY } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import type { FilterFieldProps } from '../types.js';

function TextFilter({ field, config }: FilterFieldProps) {
  return React.createElement('input', {
    type: 'text',
    value: String(field.value ?? ''),
    onChange: (e: any) => field.onChange(e.target.value),
    placeholder: `Filter ${config.label}...`,
  });
}

function SelectFilter({ field, config }: FilterFieldProps) {
  return React.createElement('select', {
    value: String(field.value ?? ''),
    onChange: (e: any) => field.onChange(e.target.value || undefined),
  },
    React.createElement('option', { value: '' }, `All ${config.label}`),
    ...(config.options ?? []).map(opt =>
      React.createElement('option', { key: opt.value, value: opt.value }, opt.label)
    ),
  );
}

function RangeFilter({ field, config }: FilterFieldProps) {
  const [min, max] = Array.isArray(field.value) ? field.value : [undefined, undefined];
  return React.createElement('div', { style: { display: 'flex', gap: '4px' } },
    React.createElement('input', {
      type: 'number',
      value: min ?? '',
      placeholder: 'Min',
      min: config.bounds?.min,
      max: config.bounds?.max,
      onChange: (e: any) => field.onChange([e.target.value ? Number(e.target.value) : undefined, max]),
    }),
    React.createElement('input', {
      type: 'number',
      value: max ?? '',
      placeholder: 'Max',
      min: config.bounds?.min,
      max: config.bounds?.max,
      onChange: (e: any) => field.onChange([min, e.target.value ? Number(e.target.value) : undefined]),
    }),
  );
}

function BooleanFilter({ field, config }: FilterFieldProps) {
  return React.createElement('select', {
    value: field.value === true ? 'true' : field.value === false ? 'false' : '',
    onChange: (e: any) => {
      const v = e.target.value;
      field.onChange(v === 'true' ? true : v === 'false' ? false : undefined);
    },
  },
    React.createElement('option', { value: '' }, `All`),
    React.createElement('option', { value: 'true' }, 'Yes'),
    React.createElement('option', { value: 'false' }, 'No'),
  );
}

export const filterRenderers: RendererEntry<React.ComponentType<FilterFieldProps>>[] = [
  // Fallback: text filter
  {
    tester: (_, ctx) => ctx.mode === 'filter' ? PRIORITY.FALLBACK : -1,
    renderer: TextFilter,
    name: 'TextFilter (fallback)',
  },
  // Search filter
  {
    tester: (field, ctx) => ctx.mode === 'filter' && (field as any).filterable === 'search' ? PRIORITY.DEFAULT : -1,
    renderer: TextFilter,
    name: 'TextFilter',
  },
  // Select filter
  {
    tester: (field, ctx) => ctx.mode === 'filter' && (field as any).filterable === 'select' ? PRIORITY.DEFAULT : -1,
    renderer: SelectFilter,
    name: 'SelectFilter',
  },
  // MultiSelect filter
  {
    tester: (field, ctx) => ctx.mode === 'filter' && (field as any).filterable === 'multiSelect' ? PRIORITY.DEFAULT : -1,
    renderer: SelectFilter,
    name: 'MultiSelectFilter',
  },
  // Range filter
  {
    tester: (field, ctx) => ctx.mode === 'filter' && (field as any).filterable === 'range' ? PRIORITY.DEFAULT : -1,
    renderer: RangeFilter,
    name: 'RangeFilter',
  },
  // Boolean filter
  {
    tester: (field, ctx) => ctx.mode === 'filter' && field.zodType === 'boolean' ? PRIORITY.DEFAULT : -1,
    renderer: BooleanFilter,
    name: 'BooleanFilter',
  },
];
