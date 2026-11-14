/**
 * Form field renderers.
 *
 * Plain HTML elements as starting point — replace with shadcn/ui Input, Select, etc.
 */

import React from 'react';
import { PRIORITY } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import type { FormFieldProps } from '../types.js';
import { GhostSlider } from '../components/ghost-slider.js';
import { FieldHistory } from '../components/field-history.js';
import { fieldHistoryOf } from '../history-types.js';
import { TagInput } from './tag-renderers.js';

/** The history control for a text field, when the context has a store and the config asks for history. */
function historyFor(props: FormFieldProps, fieldRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>) {
  const { field, config, context } = props;
  const history = fieldHistoryOf(config);
  if (!context?.history || !history || config.disabled) return null;
  return React.createElement(FieldHistory, {
    history: context.history,
    config: history,
    label: config.label,
    value: field.value,
    onChange: (v: string) => field.onChange(v),
    fieldRef,
  });
}

/**
 * `minLength` / `maxLength` from `FormFieldConfig` (i2mint/zodal#84), read structurally since the
 * `@zodal/ui` this builds against predates them; absent (or not a number) means unconstrained.
 */
function lengthProps(config: object): { minLength?: number; maxLength?: number } {
  const c = config as { minLength?: unknown; maxLength?: unknown };
  const out: { minLength?: number; maxLength?: number } = {};
  if (typeof c.minLength === 'number' && Number.isFinite(c.minLength)) out.minLength = c.minLength;
  if (typeof c.maxLength === 'number' && Number.isFinite(c.maxLength)) out.maxLength = c.maxLength;
  return out;
}

/** A single-line text input; with history, the history button sits at its inline end, outside the box. */
function TextInput(props: FormFieldProps) {
  const { field, config } = props;
  const ref = React.useRef<HTMLInputElement>(null);
  const history = historyFor(props, ref);
  const input = React.createElement('input', {
    ref,
    id: config.name,
    type: 'text',
    value: String(field.value ?? ''),
    onChange: (e: any) => field.onChange(e.target.value),
    placeholder: config.placeholder,
    required: config.required,
    disabled: config.disabled,
    ...lengthProps(config),
    className: history ? 'min-w-0 flex-1' : undefined,
  });
  return React.createElement('div', null,
    React.createElement('label', { htmlFor: config.name }, config.label),
    history ? React.createElement('div', { className: 'flex items-center gap-1' }, input, history) : input,
    config.helpText && React.createElement('p', { className: 'text-sm text-muted-foreground' }, config.helpText),
  );
}

/** Multi-line text (`editWidget: 'textarea'`); with history, the history button sits at its top-right, outside the box. */
function TextareaInput(props: FormFieldProps) {
  const { field, config } = props;
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const history = historyFor(props, ref);
  const label = React.createElement('label', { htmlFor: config.name }, config.label);
  return React.createElement('div', null,
    history ? React.createElement('div', { className: 'flex items-end justify-between gap-1' }, label, history) : label,
    React.createElement('textarea', {
      ref,
      id: config.name,
      value: String(field.value ?? ''),
      onChange: (e: any) => field.onChange(e.target.value),
      placeholder: config.placeholder,
      required: config.required,
      disabled: config.disabled,
      ...lengthProps(config),
      className: 'w-full',
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
      onChange: (e: any) => {
        const value: string = e.target.value;
        // Write the option's `raw` back: a numeric choice must stay a number.
        // (`raw` is not in the published @zodal/ui 0.2.0 types, hence the structural cast.)
        const option = ((config.options ?? []) as { value: string; raw?: unknown }[]).find((o) => o.value === value);
        if (option) field.onChange(option.raw ?? option.value);
        // The placeholder: clearing an optional field means no value, not ''.
        else field.onChange(value === '' && !config.required ? undefined : value);
      },
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
  // An Invalid Date has no ISO form (toISOString throws): show an empty picker instead.
  const dateValue = field.value instanceof Date
    ? (isNaN((field.value as Date).getTime()) ? '' : (field.value as Date).toISOString().split('T')[0])
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

/** Text that is a whole number, so `BigInt(text)` cannot throw. */
const INTEGER_TEXT = /^-?\d+$/;

/**
 * A bigint as digits. The text being typed is kept locally, so an intermediate state
 * (`-`, an empty box) is not written back; only a whole number reaches `onChange`, as a bigint.
 */
function BigIntInput({ field, config }: FormFieldProps) {
  const external = typeof field.value === 'bigint' || typeof field.value === 'number' ? String(field.value) : '';
  const [text, setText] = React.useState(external);
  // A value set from outside (a reset, a loaded record) replaces what was typed.
  React.useEffect(() => {
    const typed = INTEGER_TEXT.test(text.trim()) ? BigInt(text.trim()).toString() : '';
    if (typed !== external) setText(external);
  }, [external]);
  const valid = text === '' || INTEGER_TEXT.test(text.trim());
  return React.createElement('div', null,
    React.createElement('label', { htmlFor: config.name }, config.label),
    React.createElement('input', {
      id: config.name,
      type: 'text',
      inputMode: 'numeric',
      value: text,
      'aria-invalid': valid ? undefined : true,
      onChange: (e: any) => {
        const next: string = e.target.value;
        setText(next);
        if (INTEGER_TEXT.test(next.trim())) field.onChange(BigInt(next.trim()));
        else if (next.trim() === '') field.onChange(undefined);
      },
      placeholder: config.placeholder,
      required: config.required,
      disabled: config.disabled,
    }),
    config.helpText && React.createElement('p', { className: 'text-sm text-muted-foreground' }, config.helpText),
  );
}

/** A Map as an object when every key can be a property name, else as its [key, value] pairs. */
function mapForJson(map: Map<unknown, unknown>): unknown {
  return [...map.keys()].every((k) => typeof k === 'string' || typeof k === 'number')
    ? Object.fromEntries(map)
    : [...map.entries()];
}

/** A value as one line of text: JSON for structured values, so `{a: 1}` never shows as `[object Object]`. */
function displayValue(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  if (value instanceof Set) return displayValue([...value]);
  if (value instanceof Map) return displayValue(mapForJson(value));
  if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`;
  if (typeof value !== 'object') return String(value);
  try {
    return JSON.stringify(value, function (key, v) {
      // JSON.stringify has already called a Date's toJSON (which throws when invalid): read the original.
      const original = key === '' ? v : (this as any)[key];
      if (original instanceof Date) return isNaN(original.getTime()) ? 'Invalid Date' : original.toISOString();
      if (typeof v === 'bigint') return String(v);
      if (typeof v === 'symbol') return String(v);
      if (typeof v === 'function') return `[function ${v.name || 'anonymous'}]`;
      if (v instanceof Set) return [...v];
      if (v instanceof Map) return mapForJson(v);
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

/** Default slider bounds when the form config carries none. */
export const SLIDER_DEFAULTS = { min: 0, max: 100, step: 1 } as const;

/**
 * The bounds and step a slider uses. `FormFieldConfig` does not carry them yet (i2mint/zodal#43
 * proposes `bounds` and `step`, the shape `FilterFieldConfig.bounds` already has), so they are
 * read structurally when present, else the defaults.
 */
export function sliderRange(config: object): { min: number; max: number; step: number } {
  const c = config as { bounds?: { min?: number; max?: number }; step?: number; min?: number; max?: number };
  const pick = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  return {
    min: pick(c.bounds?.min ?? c.min, SLIDER_DEFAULTS.min),
    max: pick(c.bounds?.max ?? c.max, SLIDER_DEFAULTS.max),
    step: pick(c.step, SLIDER_DEFAULTS.step),
  };
}

/** A bounded number as a slider with a ghost thumb; the form value is written on commit. */
function SliderInput({ field, config }: FormFieldProps) {
  const { min, max, step } = sliderRange(config);
  const saved = typeof field.value === 'number' ? field.value : Number(field.value ?? min);
  const committed = Number.isFinite(saved) ? saved : min;
  const [live, setLive] = React.useState(committed);
  // A new value from outside (reset, load) replaces the one being shown.
  React.useEffect(() => setLive(committed), [committed]);
  const labelId = `${config.name}-label`;
  return React.createElement('div', null,
    React.createElement('label', { id: labelId, htmlFor: config.name }, config.label),
    React.createElement('div', { className: 'flex items-center gap-3' },
      React.createElement(GhostSlider, {
        id: config.name,
        name: config.name,
        value: live,
        min,
        max,
        step,
        disabled: config.disabled,
        'aria-labelledby': labelId,
        onValueChange: setLive,
        onValueCommit: (v: number) => field.onChange(v),
      }),
      React.createElement('output', { htmlFor: config.name, className: 'w-12 text-right text-sm tabular-nums' }, String(live)),
    ),
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
  // editWidget: 'textarea' on a string (multi-line text: `description`, `notes`... or declared), above the plain text input
  {
    // Only free text: the name heuristic also marks a `notes` array or a `description` enum 'textarea'.
    tester: (field, ctx) =>
      ctx.mode === 'form' && field.editWidget === 'textarea' && field.zodType === 'string' && field.storageRole !== 'content' ? PRIORITY.LIBRARY : -1,
    renderer: TextareaInput,
    name: 'TextareaInput',
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
  // Closed choice (enum, literal, union of literals): the form config says `select`, see formFieldAffordance
  {
    tester: (field, ctx) => ctx.mode === 'form' && (field.editWidget === 'select' || field.zodType === 'enum') ? PRIORITY.DEFAULT : -1,
    renderer: SelectInput,
    name: 'SelectInput',
  },
  // BigInt
  {
    tester: (field, ctx) => ctx.mode === 'form' && field.zodType === 'bigint' ? PRIORITY.DEFAULT : -1,
    renderer: BigIntInput,
    name: 'BigIntInput',
  },
  // editWidget: 'slider' (a bounded number), above the type-based inputs
  {
    tester: (field, ctx) => ctx.mode === 'form' && field.editWidget === 'slider' ? PRIORITY.LIBRARY : -1,
    renderer: SliderInput,
    name: 'SliderInput',
  },
  // Date
  {
    tester: (field, ctx) => ctx.mode === 'form' && field.zodType === 'date' ? PRIORITY.DEFAULT : -1,
    renderer: DateInput,
    name: 'DateInput',
  },
  // Array fields ('tags' form fields), unless another widget is declared; an
  // explicit `editWidget: 'tags'` asks for this widget on any field.
  {
    tester: (field, ctx) => {
      if (ctx.mode !== 'form') return -1;
      const widget = (field as any).editWidget;
      if (widget === 'tags') return PRIORITY.OVERRIDE;
      return field.zodType === 'array' && !widget ? PRIORITY.DEFAULT : -1;
    },
    renderer: TagInput,
    name: 'TagInput',
  },
];
