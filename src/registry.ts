import { createRendererRegistry } from '@zodal/ui';
import type { RendererEntry } from '@zodal/ui';
import { cellRenderers } from './renderers/cell-renderers.js';
import { formRenderers } from './renderers/form-renderers.js';
import { filterRenderers } from './renderers/filter-renderers.js';

/**
 * Create a RendererRegistry pre-loaded with all shadcn/ui renderers.
 *
 * @example
 * ```typescript
 * const registry = createShadcnRegistry();
 * const Component = registry.resolve(field, { mode: 'cell' });
 * ```
 */
export function createShadcnRegistry() {
  const registry = createRendererRegistry<React.ComponentType<any>>();
  const allRenderers: RendererEntry<React.ComponentType<any>>[] = [
    ...cellRenderers,
    ...formRenderers,
    ...filterRenderers,
  ];
  for (const entry of allRenderers) {
    registry.register(entry);
  }
  return registry;
}
