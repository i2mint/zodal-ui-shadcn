/**
 * Form renderers for the widget types `@zodal/ui`'s `toOptionsFormConfig` adds:
 * `'fieldset'` (a nested object), `'password'` (a secret) and `'code'` (a value supplied in
 * code, never an input). They key on `editWidget`; resolve an options-form field with
 * `optionsFieldAffordance(field)`.
 *
 * Plain HTML elements with Tailwind classes, like the other form renderers here.
 */

import React from 'react';
import { PRIORITY } from '@zodal/ui';
import type { RendererEntry, RendererRegistry, RendererTester } from '@zodal/ui';
import type { FormFieldProps } from '../types.js';
import { optionsFieldAffordance, type OptionsFormField } from '../options-form-types.js';

/** Props of an options-form renderer: `renderField` draws a fieldset's children. */
export interface OptionsFieldProps extends FormFieldProps {
  config: OptionsFormField;
  /** Draws one child field; default: through this package's registry. */
  renderField?: (props: OptionsFieldProps) => React.ReactNode;
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : {};

/** The key a child field binds to: the last segment of its `path`. */
const childKey = (child: OptionsFormField): string =>
  child.path?.[child.path.length - 1] ?? child.name.split('.').pop()!;

/** A nested object: its fields inside a `<fieldset>`, each bound to its key of the value. */
function FieldsetInput({ field, config, renderField }: OptionsFieldProps) {
  // The running value, so edits to two children with no re-render in between both survive.
  // A new value from outside (a reset, a load, the echo of an edit) replaces it.
  const current = React.useRef(asObject(field.value));
  const external = React.useRef(field.value);
  if (field.value !== external.current) {
    external.current = field.value;
    current.current = asObject(field.value);
  }
  const draw = renderField ?? defaultRenderField;
  return React.createElement('fieldset', { className: 'space-y-3 rounded-md border p-4', disabled: config.disabled },
    React.createElement('legend', { className: 'px-1 text-sm font-medium' }, config.label),
    config.helpText && React.createElement('p', { className: 'text-sm text-muted-foreground' }, config.helpText),
    ...(config.fields ?? []).filter((child) => !child.hidden).map((child) => {
      const key = childKey(child);
      return React.createElement(React.Fragment, { key: child.name }, draw({
        config: child,
        renderField,
        field: {
          value: current.current[key],
          onChange: (v: unknown) => {
            current.current = { ...current.current, [key]: v };
            field.onChange(current.current);
          },
        },
      }));
    }),
  );
}

/** A secret: masked, and never prefilled, so a stored value is never put in the page. */
function PasswordInput({ field, config }: OptionsFieldProps) {
  const stored = field.value != null && field.value !== '';
  return React.createElement('div', null,
    React.createElement('label', { htmlFor: config.name }, config.label),
    // Uncontrolled and without a defaultValue: only what the person types is ever in the input.
    React.createElement('input', {
      id: config.name,
      type: 'password',
      // Browsers ignore 'off' on a password field; 'new-password' keeps saved passwords out.
      autoComplete: 'new-password',
      placeholder: stored ? '(unchanged)' : config.placeholder,
      required: config.required && !stored,
      disabled: config.disabled,
      // Emptied again: no new value (undefined), never '' over the stored secret.
      onChange: (e: any) => field.onChange(e.target.value || undefined),
    }),
    config.helpText && React.createElement('p', { className: 'text-sm text-muted-foreground' }, config.helpText),
  );
}

/** A value only code can supply (a function, a client, a structured secret): a note, never an input. */
function CodeNote({ config }: OptionsFieldProps) {
  return React.createElement('div', null,
    React.createElement('span', null, config.label),
    React.createElement('p', { className: 'text-sm italic text-muted-foreground', 'data-zodal': 'code-note' }, 'Supplied in code'),
    config.helpText && React.createElement('p', { className: 'text-sm text-muted-foreground' }, config.helpText),
  );
}

/** Matches a form field whose `editWidget` is `type`, above the type-based inputs. */
const widget = (type: string): RendererTester => (field, ctx) =>
  ctx.mode === 'form' && (field as { editWidget?: string }).editWidget === type ? PRIORITY.LIBRARY : -1;

export const optionsFormRenderers: RendererEntry<React.ComponentType<OptionsFieldProps>>[] = [
  { tester: widget('fieldset'), renderer: FieldsetInput, name: 'FieldsetInput' },
  { tester: widget('password'), renderer: PasswordInput, name: 'PasswordInput' },
  { tester: widget('code'), renderer: CodeNote, name: 'CodeNote' },
];

/** Draw a child through this package's registry (built lazily: the registry imports this module). */
function defaultRenderField(props: OptionsFieldProps): React.ReactNode {
  const Component = registry().resolve(optionsFieldAffordance(props.config), { mode: 'form' });
  return Component ? React.createElement(Component, props) : null;
}

let factory: (() => RendererRegistry<React.ComponentType<any>>) | undefined;
let cached: RendererRegistry<React.ComponentType<any>> | undefined;
function registry(): RendererRegistry<React.ComponentType<any>> {
  return (cached ??= factory!());
}
/** Wired by `registry.ts`, so this module needs no import cycle. */
export function setDefaultRegistryFactory(make: () => RendererRegistry<React.ComponentType<any>>): void {
  factory = make;
}
