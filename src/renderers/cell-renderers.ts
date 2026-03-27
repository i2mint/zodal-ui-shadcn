/**
 * Cell renderers for table display.
 *
 * These use plain HTML elements as a starting point.
 * In a real app, replace with shadcn/ui components.
 */

import React from 'react';
import { PRIORITY } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import type { CellProps } from '../types.js';

// --- Text Cell (fallback and string default) ---
function TextCell({ value, config }: CellProps) {
  const str = String(value ?? '');
  const truncate = config.meta.truncate;
  if (truncate && str.length > truncate) {
    return React.createElement('span', { title: str }, str.slice(0, truncate) + '...');
  }
  return React.createElement('span', null, str);
}

// --- Number Cell ---
function NumberCell({ value, config }: CellProps) {
  if (value == null) return React.createElement('span', { className: 'text-muted-foreground' }, '\u2014');
  const formatted = config.meta.displayFormat === 'currency'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value as number)
    : String(value);
  return React.createElement('span', null, formatted);
}

// --- Boolean Cell ---
function BooleanCell({ value }: CellProps) {
  return React.createElement('span', null, value ? '\u2713' : '\u2717');
}

// --- Date Cell ---
function DateCell({ value }: CellProps) {
  if (value == null) return React.createElement('span', { className: 'text-muted-foreground' }, '\u2014');
  const date = value instanceof Date ? value : new Date(value as string);
  return React.createElement('span', null, date.toLocaleDateString());
}

// --- Badge Cell (for enums) ---
function BadgeCell({ value, config }: CellProps) {
  const str = String(value ?? '');
  const variant = config.meta.badge?.[str] ?? 'default';
  return React.createElement('span', {
    className: `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium`,
    'data-variant': variant,
  }, str);
}

// --- Array Cell ---
function ArrayCell({ value }: CellProps) {
  if (!Array.isArray(value)) return React.createElement('span', null, '\u2014');
  return React.createElement('span', null, value.join(', '));
}

export const cellRenderers: RendererEntry<React.ComponentType<CellProps>>[] = [
  // Fallback: anything renders as text
  {
    tester: () => PRIORITY.FALLBACK,
    renderer: TextCell,
    name: 'TextCell (fallback)',
  },
  // String
  {
    tester: (field, ctx) => ctx.mode === 'cell' && field.zodType === 'string' ? PRIORITY.DEFAULT : -1,
    renderer: TextCell,
    name: 'TextCell',
  },
  // Number
  {
    tester: (field, ctx) => ctx.mode === 'cell' && ['number', 'int', 'float'].includes(field.zodType) ? PRIORITY.DEFAULT : -1,
    renderer: NumberCell,
    name: 'NumberCell',
  },
  // Boolean
  {
    tester: (field, ctx) => ctx.mode === 'cell' && field.zodType === 'boolean' ? PRIORITY.DEFAULT : -1,
    renderer: BooleanCell,
    name: 'BooleanCell',
  },
  // Date
  {
    tester: (field, ctx) => ctx.mode === 'cell' && field.zodType === 'date' ? PRIORITY.DEFAULT : -1,
    renderer: DateCell,
    name: 'DateCell',
  },
  // Enum → Badge
  {
    tester: (field, ctx) => ctx.mode === 'cell' && field.zodType === 'enum' ? PRIORITY.DEFAULT : -1,
    renderer: BadgeCell,
    name: 'BadgeCell',
  },
  // Array
  {
    tester: (field, ctx) => ctx.mode === 'cell' && field.zodType === 'array' ? PRIORITY.DEFAULT : -1,
    renderer: ArrayCell,
    name: 'ArrayCell',
  },
  // Currency (specialized number)
  {
    tester: (field, ctx) => ctx.mode === 'cell' && (field as any).displayFormat === 'currency' ? PRIORITY.LIBRARY : -1,
    renderer: NumberCell,
    name: 'CurrencyCell',
  },
];
