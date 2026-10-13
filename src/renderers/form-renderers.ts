/**
 * Form field renderers.
 *
 * Plain HTML elements as starting point — replace with shadcn/ui Input, Select, etc.
 */

import React from 'react';
import { PRIORITY } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import type { FormFieldProps } from '../types.js';

function TextInput({ field, config }: FormFieldProps) {
  return React.createElement('div', null,
    React.createElement('label', { htmlFor: config.name }, config.label),
    React.createElement('input', {
      id: config.name,
      type: 'text',
      value: String(field.value ?? ''),
      onChange: (e: any) => field.onChange(e.target.value),
      placeholder: config.placeholder,
      required: config.required,
      disabled: config.disabled,
    }),
    config.helpText && React.createElement('p', { className: 'text-sm text-muted-foreground' }, config.helpText),
  );
}

function NumberInput({ field, config }: FormFieldProps) {
  return React.createElement('div', null,
    React.createElement('label', { htmlFor: config.name }, config.label),
    React.createElement('input', {
      id: config.name,
      type: 'number',
      value: field.value ?? '',
      onChange: (e: any) => field.onChange(Number(e.target.value)),
      required: config.required,
      disabled: config.disabled,
    }),
  );
}

function CheckboxInput({ field, config }: FormFieldProps) {
  return React.createElement('div', null,
    React.createElement('label', null,
      React.createElement('input', {
        type: 'checkbox',
        checked: Boolean(field.value),
        onChange: (e: any) => field.onChange(e.target.checked),
        disabled: config.disabled,
      }),
      ' ',
      config.label,
    ),
  );
}

function SelectInput({ field, config }: FormFieldProps) {
  return React.createElement('div', null,
    React.createElement('label', { htmlFor: config.name }, config.label),
    React.createElement('select', {
      id: config.name,
      value: String(field.value ?? ''),
      onChange: (e: any) => field.onChange(e.target.value),
      required: config.required,
      disabled: config.disabled,
    },
      React.createElement('option', { value: '' }, `Select ${config.label}...`),
      ...(config.options ?? []).map(opt =>
        React.createElement('option', { key: opt.value, value: opt.value }, opt.label)
      ),
    ),
  );
}

function DateInput({ field, config }: FormFieldProps) {
  const dateValue = field.value instanceof Date
    ? (field.value as Date).toISOString().split('T')[0]
    : String(field.value ?? '');

  return React.createElement('div', null,
    React.createElement('label', { htmlFor: config.name }, config.label),
    React.createElement('input', {
      id: config.name,
      type: 'date',
      value: dateValue,
      onChange: (e: any) => field.onChange(new Date(e.target.value)),
      required: config.required,
      disabled: config.disabled,
    }),
  );
}

/** A value as one line of text: JSON for structured values, so `{a: 1}` never shows as `[object Object]`. */
function displayValue(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Set) return displayValue([...value]);
  if (value instanceof Map) return displayValue(Object.fromEntries(value));
  if (typeof value !== 'object') return String(value);
  try {
    return JSON.stringify(value, (_, v) => {
      if (typeof v === 'bigint') return String(v);
      if (v instanceof Set) return [...v];
      if (v instanceof Map) return Object.fromEntries(v);
      return v;
    });
  } catch {
    return String(value);
  }
}

/**
 * Fallback for a field type with no form renderer of its own (object, set, bigint, ...).
 * Read-only: an editable text box would write a string into a field of another type.
 */
function ReadOnlyInput({ field, config }: FormFieldProps) {
  return React.createElement('div', null,
    React.createElement('label', { htmlFor: config.name }, config.label),
    React.createElement('input', {
      id: config.name,
      type: 'text',
      value: displayValue(field.value),
      readOnly: true,
    }),
    config.helpText && React.createElement('p', { className: 'text-sm text-muted-foreground' }, config.helpText),
  );
}

export const formRenderers: RendererEntry<React.ComponentType<FormFieldProps>>[] = [
  // Fallback: shown, never edited, for any type without its own form renderer
  {
    tester: (_, ctx) => ctx.mode === 'form' ? PRIORITY.FALLBACK : -1,
    renderer: ReadOnlyInput,
    name: 'ReadOnlyInput (fallback)',
  },
  // String
  {
    tester: (field, ctx) => ctx.mode === 'form' && field.zodType === 'string' ? PRIORITY.DEFAULT : -1,
    renderer: TextInput,
    name: 'TextInput',
  },
  // Number
  {
    tester: (field, ctx) => ctx.mode === 'form' && ['number', 'int', 'float'].includes(field.zodType) ? PRIORITY.DEFAULT : -1,
    renderer: NumberInput,
    name: 'NumberInput',
  },
  // Boolean
  {
    tester: (field, ctx) => ctx.mode === 'form' && field.zodType === 'boolean' ? PRIORITY.DEFAULT : -1,
    renderer: CheckboxInput,
    name: 'CheckboxInput',
  },
  // Enum
  {
    tester: (field, ctx) => ctx.mode === 'form' && field.zodType === 'enum' ? PRIORITY.DEFAULT : -1,
    renderer: SelectInput,
    name: 'SelectInput',
  },
  // Date
  {
    tester: (field, ctx) => ctx.mode === 'form' && field.zodType === 'date' ? PRIORITY.DEFAULT : -1,
    renderer: DateInput,
    name: 'DateInput',
  },
];
