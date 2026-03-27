# zodal-ui-shadcn

zodal UI renderer package for shadcn/ui components. Provides concrete React components that consume zodal's headless configuration objects (`ColumnConfig`, `FormFieldConfig`, `FilterFieldConfig`) and render them using shadcn/ui primitives.

## Install

```bash
npm install zodal-ui-shadcn
# peer dependencies
npm install @zodal/core @zodal/ui react react-dom
```

## Quick Start

```typescript
import { createShadcnRegistry } from 'zodal-ui-shadcn';

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
| `ArrayCell` | `array` | Comma-separated values |
| `CurrencyCell` | number + `displayFormat: 'currency'` | USD currency format |

### Form Renderers (data entry)

| Renderer | Zod Type | Description |
|----------|----------|-------------|
| `TextInput` | `string` (fallback) | Text input with label + help text |
| `NumberInput` | `number`, `int`, `float` | Numeric input |
| `CheckboxInput` | `boolean` | Checkbox with label |
| `SelectInput` | `enum` | Dropdown select |
| `DateInput` | `date` | Date picker |

### Filter Renderers (data filtering)

| Renderer | Filter Type | Description |
|----------|-------------|-------------|
| `TextFilter` | `search` (fallback) | Text search input |
| `SelectFilter` | `select`, `multiSelect` | Dropdown filter |
| `RangeFilter` | `range` | Min/max numeric range |
| `BooleanFilter` | `boolean` | Yes/No/All dropdown |

## Customization

### Override individual renderers

```typescript
import { createShadcnRegistry } from 'zodal-ui-shadcn';
import { PRIORITY } from '@zodal/ui';
import { MyFancyDatePicker } from './components';

const registry = createShadcnRegistry();

// Register a higher-priority renderer for dates
registry.register({
  tester: (field, ctx) =>
    ctx.mode === 'form' && field.zodType === 'date' ? PRIORITY.USER : -1,
  renderer: MyFancyDatePicker,
  name: 'MyFancyDatePicker',
});
```

### Use individual renderer arrays

```typescript
import { cellRenderers, formRenderers, filterRenderers } from 'zodal-ui-shadcn';

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
