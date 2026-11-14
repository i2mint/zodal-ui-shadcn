/**
 * The text a table cell shows for a value, shared by the scalar cells and the array chips.
 */

import type { CellProps } from './types.js';

/**
 * The text a cell shows for a value: its option label from `ColumnConfig.meta.options`
 * (i2mint/zodal#100; the same options its form and filter get), else the value itself. Matches
 * `labelOf` in `@zodal/ui` (values compared as strings); read structurally since the `@zodal/ui`
 * this builds against predates `meta.options`.
 */
export function cellLabel(config: CellProps['config'], value: unknown): string {
  const options = (config?.meta as { options?: unknown } | undefined)?.options;
  if (Array.isArray(options)) {
    const key = String(value);
    const hit = options.find((o) => o && typeof o === 'object' && String((o as { value?: unknown }).value) === key);
    const label = hit && (hit as { label?: unknown }).label;
    if (typeof label === 'string' && label !== '') return label;
  }
  return String(value ?? '');
}
