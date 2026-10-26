/**
 * The field affordance to resolve a collection form field's renderer with:
 * `registry.resolve(formFieldAffordance(fa, config), { mode: 'form' })`.
 *
 * Renderer testers see the affordance, not the form config, and the affordance cannot say
 * whether a field is a closed choice (a literal, a union of literals, an enum). `toFormConfig`
 * (`@zodal/ui`) decides that and puts the widget in `config.type`; this carries it across as
 * `editWidget`, the way `optionsFieldAffordance` does for options forms.
 */

import type { ResolvedFieldAffordance } from '@zodal/core';
import type { FormFieldConfig } from '@zodal/ui';

export function formFieldAffordance(
  affordance: ResolvedFieldAffordance,
  config: Pick<FormFieldConfig, 'type'>,
): ResolvedFieldAffordance {
  return { ...affordance, editWidget: config.type };
}
