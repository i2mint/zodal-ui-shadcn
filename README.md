# zodal-ui-shadcn

zodal UI renderer package for shadcn/ui components. Provides concrete React components that consume zodal's headless configuration objects (`ColumnConfig`, `FormFieldConfig`, `FilterFieldConfig`) and render them using shadcn/ui primitives.

## Install

```bash
npm install @zodal/ui-shadcn
# peer dependencies
npm install @zodal/core @zodal/ui react react-dom
```

## Quick Start

```typescript
import { createShadcnRegistry } from '@zodal/ui-shadcn';

// Create a registry pre-loaded with all renderers
const registry = createShadcnRegistry();

// Resolve a component for a field
const CellComponent = registry.resolve(field, { mode: 'cell' });
const FormComponent = registry.resolve(field, { mode: 'form' });
const FilterComponent = registry.resolve(field, { mode: 'filter' });

// Debug: see all renderer scores for a field
const scores = registry.explain(field, { mode: 'cell' });
console.table(scores);
```

## Supported Renderers

### Cell Renderers (table display)

| Renderer | Zod Type | Description |
|----------|----------|-------------|
| `TextCell` | `string` (fallback) | Plain text, optional truncation |
| `NumberCell` | `number`, `int`, `float` | Formatted numbers |
| `BooleanCell` | `boolean` | Checkmark / cross |
| `DateCell` | `date` | Localized date string |
| `BadgeCell` | `enum` | Inline badge with variant |
| `ArrayCell` | `array` | Chips, the first 3 shown, then a "+N" chip naming the rest |
| `CurrencyCell` | number + `displayFormat: 'currency'` | USD currency format |

### Form Renderers (data entry)

| Renderer | Zod Type | Description |
|----------|----------|-------------|
| `TextInput` | `string` (fallback) | Text input with label + help text |
| `NumberInput` | `number`, `int`, `float` | Numeric input |
| `CheckboxInput` | `boolean` | Checkbox with label |
| `SelectInput` | `enum` | Dropdown select |
| `DateInput` | `date` | Date picker |
| `TagInput` | `array` (`type: 'tags'`), or `editWidget: 'tags'` | Chip input: add with Enter or comma, remove with Backspace or a chip's button; options or `context.suggest` |

### Filter Renderers (data filtering)

| Renderer | Filter Type | Description |
|----------|-------------|-------------|
| `TextFilter` | `search` (fallback) | Text search input |
| `SelectFilter` | `select`, `multiSelect` | Dropdown filter |
| `RangeFilter` | `range` | Min/max numeric range |
| `BooleanFilter` | `boolean` | Yes/No/All dropdown |
| `ChipFilter` | `contains` on an `array` | Toggle chips ("Tags is any of"), or a type-ahead when options are many or absent; emits `arrayContainsAny` |

## Tag fields

An array field gets chips in all three modes: `TagInput` in forms (`toFormConfig` gives it `type: 'tags'`), `ChipFilter` for its `contains` filter, and `ArrayCell` (chips with "+N") in tables. Pass the render context to the component so `context.suggest` reaches it:

```tsx
import { toFormConfig } from '@zodal/ui';
import type { SuggestionSource } from '@zodal/ui';
import { createShadcnRegistry } from '@zodal/ui-shadcn';

const registry = createShadcnRegistry();

// Where suggestions come from: values already used, a zodal-groups vocabulary, an endpoint.
const suggest: SuggestionSource = async (query, field, { signal, limit } = {}) => {
  const res = await fetch(`/api/${field}?q=${encodeURIComponent(query)}&limit=${limit}`, { signal });
  return res.json(); // [{ value, label }]
};

function ItemForm({ collection, item, setItem }) {
  return toFormConfig(collection).map((config) => {
    const context = { mode: 'form' as const, suggest };
    const Field = registry.resolve(collection.fieldAffordances[config.name], context)!;
    const field = { value: item[config.name], onChange: (v: unknown) => setItem({ ...item, [config.name]: v }) };
    return <Field key={config.name} field={field} config={config} context={context} />;
  });
}
```

- **Keyboard**: Enter or comma adds the draft; Backspace on an empty input removes the last chip; arrow keys move through suggestions, Enter picks one, Escape closes the list; every chip has a remove button in the tab order. Pasting `a, b, c` adds three tags in one change.
- **Vocabulary**: with `allowCreate: false` (a closed vocabulary) only `options` can be added and the first match is highlighted; free text is refused and stays in the input. Otherwise `context.suggest` is asked (debounced, the previous request aborted through its `AbortSignal`, stale results dropped, a loading state shown, at most `limit` results, the pending request cancelled on unmount), or `options` are matched locally, or the input takes free text.
- **Values**: duplicates are refused; an option's `raw` is written back, so a numeric vocabulary stays numeric. The inputs are controlled: they show `field.value` and report through `field.onChange`.
- **Accessibility**: ARIA 1.2 combobox (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`) over a `role="listbox"`; a polite live region announces adds, removes and refusals.
- **Typed text is never lost**: a refusal, a failed suggestion request and a blur all leave the draft in place.

The filter emits a ready `FilterExpression` condition, `{ field, operator: 'arrayContainsAny', value: [...] }`, or `undefined` when nothing is selected. It always uses `arrayContainsAny` (OR within the field, said on screen as "is any of"): for one value it equals `arrayContains`, and the value keeps one shape as chips come and go. Combine several fields' conditions with `{ and: [...] }`. `fromContainsFilter(value)` reads a selection back.

Settings (debounce, limit, visible chips, the toggle/type-ahead threshold, every message for i18n) go through the factories `createTagInput`, `createChipFilter` and `createChipCell`, registered at a higher priority:

```typescript
import { PRIORITY } from '@zodal/ui';
import { createTagInput } from '@zodal/ui-shadcn';

registry.register({
  tester: (field, ctx) => ctx.mode === 'form' && field.zodType === 'array' ? PRIORITY.APP : -1,
  renderer: createTagInput({ debounceMs: 300, limit: 8, messages: { added: (l) => `${l} ajouté` } }),
  name: 'TagInput (French)',
});
```

Form and filter components take `{ field: { value, onChange }, config, context?, affordance? }`: `@zodal/ui`'s `FieldRenderProps` with `field` kept as the value binding this package has always used (its `affordance` moves to `affordance`), so existing call sites keep working.

## Customization

### Override individual renderers

```typescript
import { createShadcnRegistry } from '@zodal/ui-shadcn';
import { PRIORITY } from '@zodal/ui';
import { MyFancyDatePicker } from './components';

const registry = createShadcnRegistry();

// Register a higher-priority renderer for dates
registry.register({
  tester: (field, ctx) =>
    ctx.mode === 'form' && field.zodType === 'date' ? PRIORITY.APP : -1,
  renderer: MyFancyDatePicker,
  name: 'MyFancyDatePicker',
});
```

### Use individual renderer arrays

```typescript
import { cellRenderers, formRenderers, filterRenderers } from '@zodal/ui-shadcn';

// Mix and match with your own renderers
const myRenderers = [...cellRenderers, ...myCustomRenderers];
```

## Development

```bash
npm install
npm run build       # Build with tsup
npm test            # Run tests with vitest
npm run typecheck   # TypeScript type checking
```

## License

MIT
