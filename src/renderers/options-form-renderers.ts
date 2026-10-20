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

/** A registry of React form components, as `createShadcnRegistry()` returns. */
type ComponentRegistry = RendererRegistry<React.ComponentType<any>>;

/** Props of an options-form renderer; a fieldset passes `registry` and `renderField` to its children. */
export interface OptionsFieldProps extends FormFieldProps {
  config: OptionsFormField;
  /** The registry a fieldset resolves its children with; default: `createShadcnRegistry()`. */
  registry?: ComponentRegistry;
  /** Draws one child field (it may use hooks); default: the component `registry` resolves. */
  renderField?: (props: OptionsFieldProps) => React.ReactNode;
}

/** A plain object's own fields, copied; anything else (an array, a scalar, nothing) is `{}`. */
const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};

/** The key a child field binds to: the last segment of its `path`. */
const childKey = (child: OptionsFormField): string =>
  child.path?.[child.path.length - 1] ?? child.name.split('.').pop()!;

/** Renders `draw(props)` as a component of its own, so a `renderField` may use hooks. */
function FieldSlot({ draw, props }: { draw: (props: OptionsFieldProps) => React.ReactNode; props: OptionsFieldProps }) {
  return React.createElement(React.Fragment, null, draw(props));
}

/** A nested object: its fields inside a `<fieldset>`, each bound to its key of the value. */
function FieldsetInput({ field, config, registry, renderField }: OptionsFieldProps) {
  // The running value, so edits to two children with no re-render in between both survive.
  // Written only by the children's onChange; a new value from outside (a reset, a load, the
  // echo of an edit) replaces it once that render commits.
  const running = React.useRef(asObject(field.value));
  // The value as it came from outside, not as echoed back from an edit here: what a secret
  // child that is emptied again falls back to.
  const stored = React.useRef(asObject(field.value));
  const emitted = React.useRef<unknown>(undefined);
  React.useLayoutEffect(() => {
    running.current = asObject(field.value);
    if (field.value !== emitted.current) stored.current = asObject(field.value);
  }, [field.value]);
  const shown = asObject(field.value);
  const draw = renderField ?? defaultRenderField;
  return React.createElement('fieldset', { className: 'space-y-3 rounded-md border p-4', disabled: config.disabled },
    React.createElement('legend', { className: 'px-1 text-sm font-medium' }, config.label),
    config.helpText && React.createElement('p', { className: 'text-sm text-muted-foreground' }, config.helpText),
    ...(config.fields ?? []).filter((child) => !child.hidden).map((child) => {
      const key = childKey(child);
      const secret = optionsFieldAffordance(child).editWidget === 'password';
      return React.createElement(FieldSlot, {
        key: child.name,
        draw,
        props: {
          // A disabled fieldset disables every child, native control or not.
          config: config.disabled && !child.disabled ? { ...child, disabled: true } : child,
          registry,
          renderField,
          field: {
            value: shown[key],
            onChange: (v: unknown) => {
              // A secret emptied again means "no new value": keep the stored one, never drop it.
              const next = secret && v === undefined ? stored.current[key] : v;
              running.current = { ...running.current, [key]: next };
              emitted.current = running.current;
              field.onChange(running.current);
            },
          },
        },
      });
    }),
  );
}

/** A secret: masked, and never prefilled, so a stored value is never put in the page. */
function PasswordInput({ field, config }: OptionsFieldProps) {
  // Only what the person types is ever in the input; it is cleared when the value changes
  // from outside (a save, a reset, a load), so the input never disagrees with the form.
  const [typed, setTyped] = React.useState('');
  const emitted = React.useRef<unknown>(field.value);
  React.useEffect(() => {
    if (field.value !== emitted.current) setTyped('');
    emitted.current = field.value;
  }, [field.value]);
  const stored = field.value != null && field.value !== '';
  return React.createElement('div', null,
    React.createElement('label', { htmlFor: config.name }, config.label),
    React.createElement('input', {
      id: config.name,
      type: 'password',
      value: typed,
      // Browsers ignore 'off' on a password field; 'new-password' keeps saved passwords out.
      autoComplete: 'new-password',
      placeholder: stored ? '(unchanged)' : config.placeholder,
      required: config.required && !stored,
      disabled: config.disabled,
      onChange: (e: any) => {
        const text: string = e.target.value;
        setTyped(text);
        // Emptied again: no new value (undefined), never '' over the stored secret.
        const v = text || undefined;
        emitted.current = v;
        field.onChange(v);
      },
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

/** Draw a child with the component its registry resolves (the given one, else this package's). */
function defaultRenderField(props: OptionsFieldProps): React.ReactNode {
  const Component = (props.registry ?? defaultRegistry()).resolve(optionsFieldAffordance(props.config), { mode: 'form' });
  return Component ? React.createElement(Component, props) : null;
}

let factory: (() => ComponentRegistry) | undefined;
let cached: ComponentRegistry | undefined;
function defaultRegistry(): ComponentRegistry {
  if (!factory) {
    throw new Error(
      'FieldsetInput has no registry to draw its fields with: pass `registry` (or `renderField`), '
      + "or import createShadcnRegistry from '@zodal/ui-shadcn'.",
    );
  }
  return (cached ??= factory());
}
/** Wired by `registry.ts` (built lazily: the registry imports this module). */
export function setDefaultRegistryFactory(make: () => ComponentRegistry): void {
  factory = make;
}
