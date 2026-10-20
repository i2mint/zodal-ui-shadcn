/**
 * The shape of `@zodal/ui`'s `OptionsFormField` (from `toOptionsFormConfig`, i2mint/zodal#26),
 * declared here structurally because the `@zodal/ui` on npm this package builds against
 * predates it; any object of this shape works. Once a `@zodal/ui` with `toOptionsFormConfig`
 * is published, this becomes a re-export of its type (same name).
 */

import type { ResolvedFieldAffordance } from '@zodal/core';
import type { FormFieldConfig } from '@zodal/ui';

/** One field of an options form (a provider's or a component's settings, not a record). */
export interface OptionsFormField extends FormFieldConfig {
  /** Where the value sits in the options object (`name` is `path.join('.')`). */
  path: string[];
  /** A `'fieldset'`'s own fields. */
  fields?: OptionsFormField[];
  /** A secret: a `'password'` input that never shows a stored value. */
  secret?: boolean;
  /** Not editable as data (a function, a client, a structured secret): a `'code'` note. */
  suppliedInCode?: boolean;
}

/**
 * The field affordance to resolve an options-form field's renderer with:
 * `registry.resolve(optionsFieldAffordance(f), { mode: 'form' })`. Its `editWidget` is the
 * field's widget type, so `'fieldset'`, `'password'` and `'code'` reach their renderers; a
 * `secret` field is always a `'password'` and a `suppliedInCode` one always a `'code'`, whatever
 * its `type`, so neither can resolve to an input that shows or edits the value.
 */
export function optionsFieldAffordance(field: OptionsFormField): ResolvedFieldAffordance {
  return {
    zodType: field.zodType,
    editWidget: field.suppliedInCode ? 'code' : field.secret ? 'password' : field.type,
    title: field.label,
    editable: !field.disabled,
    hidden: field.hidden,
    visible: !field.hidden,
  } as unknown as ResolvedFieldAffordance;
}
