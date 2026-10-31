/**
 * Filter widget renderers.
 */

import React from 'react';
import { PRIORITY } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import type { FilterFieldProps } from '../types.js';
import { GhostRangeSliderField, type RangeValue } from '../components/ghost-range-slider.js';
import { linearScale, quantileScale, type SliderScale } from '../components/slider-scale.js';

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

/**
 * The scale a range-slider filter uses, read from its config: `quantiles` (the data's
 * percentiles, see `quantilesOf`) give a percentile-laid-out track; otherwise `bounds` give a
 * linear one. `FilterFieldConfig` does not carry `quantiles` yet (a typed field is proposed in
 * i2mint/zodal), so it is read the way `sliderRange` reads form bounds. Null when neither is set.
 */
export function rangeSliderScale(config: object): SliderScale | null {
  const c = config as { quantiles?: number[]; bounds?: { min?: number; max?: number } };
  if (Array.isArray(c.quantiles) && c.quantiles.length >= 2) return quantileScale(c.quantiles);
  if (c.bounds?.min !== undefined && c.bounds?.max !== undefined) return linearScale(c.bounds.min, c.bounds.max);
  return null;
}

/** A range filter as a two-thumb slider plus two number fields; the filter is written on commit. */
function RangeSliderFilter({ field, config }: FilterFieldProps) {
  const scale = React.useMemo(() => rangeSliderScale(config), [config]);
  const committed: RangeValue = Array.isArray(field.value) ? [field.value[0], field.value[1]] : [undefined, undefined];
  const [preview, setPreview] = React.useState<RangeValue | null>(null);
  if (!scale) return React.createElement(RangeFilter, { field, config });
  return React.createElement(GhostRangeSliderField, {
    value: preview ?? committed,
    scale,
    onValueChange: setPreview,
    onValueCommit: (v: RangeValue) => {
      setPreview(null);
      field.onChange([v[0], v[1]]);
    },
    lowLabel: `${config.label} minimum`,
    highLabel: `${config.label} maximum`,
  });
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

/**
 * Field types a free-text filter value can express. Other types (object, record, map, union,
 * bigint, ...) get no fallback filter: unless a specific filter renderer matches them (e.g.
 * `RangeFilter` for a bigint inferred as `range`), `resolve` returns null.
 * Collections (array, set, tuple) are included because their inferred filter, `contains`,
 * tests membership of one value.
 */
const TEXT_FILTERABLE_TYPES = new Set([
  'string', 'number', 'int', 'float', 'date', 'enum', 'literal', 'boolean', 'array', 'set', 'tuple',
]);

export const filterRenderers: RendererEntry<React.ComponentType<FilterFieldProps>>[] = [
  // Fallback: text filter, for the types a text value can express
  {
    tester: (field, ctx) => ctx.mode === 'filter' && TEXT_FILTERABLE_TYPES.has(field.zodType) ? PRIORITY.FALLBACK : -1,
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
  // Range filter as a two-thumb slider: opt in with editWidget 'range-slider', given a scale
  {
    tester: (field, ctx) =>
      ctx.mode === 'filter' && (field as any).filterable === 'range' && (field as any).editWidget === 'range-slider'
        ? PRIORITY.LIBRARY
        : -1,
    renderer: RangeSliderFilter,
    name: 'RangeSliderFilter',
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
