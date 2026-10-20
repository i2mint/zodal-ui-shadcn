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
| `TextCell` | `string`, and any type without its own cell (fallback) | Plain text, optional truncation |
| `NumberCell` | `number`, `int`, `float` | Formatted numbers |
| `BooleanCell` | `boolean` | Checkmark / cross |
| `DateCell` | `date` | Localized date string |
| `BadgeCell` | `enum` | Inline badge with variant |
| `ArrayCell` | `array` | Comma-separated values |
| `CurrencyCell` | number + `displayFormat: 'currency'` | USD currency format |

### Form Renderers (data entry)

| Renderer | Zod Type | Description |
|----------|----------|-------------|
| `TextInput` | `string` | Text input with label + help text |
| `ReadOnlyInput` | any type without its own form renderer (fallback) | Read-only text showing the value (JSON for structured values), so a field of another type is never overwritten with a string |
| `NumberInput` | `number`, `int`, `float` | Numeric input |
| `CheckboxInput` | `boolean` | Checkbox with label |
| `SelectInput` | `enum` | Dropdown select |
| `DateInput` | `date` | Date picker |
| `FieldsetInput` | `editWidget: 'fieldset'` (options forms) | A nested object's fields inside a `<fieldset>` |
| `PasswordInput` | `editWidget: 'password'` (options forms) | Masked; never prefilled from a stored value |
| `CodeNote` | `editWidget: 'code'` (options forms) | "Supplied in code" note, never an input |

### Filter Renderers (data filtering)

| Renderer | Filter Type | Description |
|----------|-------------|-------------|
| `TextFilter` | `search`; fallback for other filter types on scalar, enum, date and collection (array, set, tuple) fields | Text search input |
| `SelectFilter` | `select`, `multiSelect` | Dropdown filter |
| `RangeFilter` | `range` | Min/max numeric range |
| `BooleanFilter` | `boolean` | Yes/No/All dropdown |

Each fallback matches only its own mode, so a form or a filter never resolves to a table cell. Other types (object, record, map, union, `bigint`, ...) have no fallback filter: unless a specific filter matches (a `bigint` inferred as `range` gets `RangeFilter`), `registry.resolve(field, { mode: 'filter' })` returns `null`.

## Collection views: a list or a grid, grouped and collapsible

`CollectionView` draws the whole collection from a `ViewConfig` (`toViewConfig(collection, 'list' | 'grid')` in `@zodal/ui`): list rows or grid cards showing each item's image, label, badges and secondary text, bucketed into groups whose headers collapse and expand when the collection declares `groupBy.collapsible`.

```tsx
import { toViewConfig } from '@zodal/ui';
import { CollectionView } from '@zodal/ui-shadcn';

const view = toViewConfig(instruments, 'grid');
const { collapsedGroups, expandedGroups } = viewState;   // from createViewStateStore(...).get()

<CollectionView
  items={items} config={view}
  collapsedGroups={collapsedGroups} expandedGroups={expandedGroups}
  onToggleGroup={(id) => viewStore.toggleGroup(id)}      // persist the collapse
  onOperation={(op, item) => run(op.name, item)}         // edit, delete, declared item operations
  selectedIds={selectedIds} onSelect={(id, on) => select(id, on)}
  onCollectionOperation={(op, selected) => run(op.name, selected)}
/>
```

`ListItem` and `GridCard` draw one item; `renderValue` lets a registry cell component draw a field. A header click toggles its group at once and calls `onToggleGroup`; new `collapsedGroups` / `expandedGroups` props take over. Plain HTML with Tailwind classes, like the other renderers here.

The `ViewConfig` type is declared here structurally (`src/view-types.ts`) and `groupItems` is a local copy, because the `@zodal/ui` on npm this package builds against predates `toViewConfig`; any object of that shape works.

## Slider with a ghost thumb

A number field declared with `editWidget: 'slider'` renders as `GhostSlider`: a range input that, while the person drags, leaves a faded ghost thumb at the saved value (the value at pointer-down, or `savedValue`) so they can see how far they moved; it disappears on release. A readout shows the live value; the form value is written on commit (release, or each key press), not on every move.

```typescript
const settings = defineCollection(z.object({ volume: z.number().min(0).max(11) }), {
  fields: { volume: { editWidget: 'slider' } },
});
```

Bounds and step come from the form config when it carries them (`bounds: { min, max }`, `step`; `toFormConfig` does not project them yet: i2mint/zodal#43), else 0..100 by 1. `GhostSlider` is also exported on its own (`value`, `onValueChange`, `onValueCommit`, `min`, `max`, `step`, `savedValue`, `thumbSize`); `thumbSize` must match the thumb's rendered width (16px by default), because a range input insets its thumb by half that width at each end and the ghost is inset the same way. Single value, horizontal, left-to-right, controlled only.

`pnpm test:browser` checks the ghost's placement in headless Chromium (needs a Chromium for playwright-core, `npx playwright-core install chromium`); it is not part of `pnpm test`.

## Options forms (settings, provider options)

`@zodal/ui`'s `toOptionsFormConfig(schema)` describes a settings-like object as form fields, with three widget types beyond a record form's: `'fieldset'` (a nested object, drawn as a `<fieldset>` of its fields), `'password'` (a secret: masked, never prefilled from a stored value) and `'code'` (a function, a client or a structured secret: a "Supplied in code" note, never an input). Resolve each field through `optionsFieldAffordance`:

```tsx
import { createShadcnRegistry, optionsFieldAffordance } from '@zodal/ui-shadcn';

const registry = createShadcnRegistry();

function OptionsForm({ fields, options, setOptions }) {
  return fields.map((f) => {
    const Field = registry.resolve(optionsFieldAffordance(f), { mode: 'form' })!;
    return <Field key={f.name} config={f}
      field={{ value: options[f.name], onChange: (v) => setOptions((o) => ({ ...o, [f.name]: v })) }} />;
  });
}
```

`optionsFieldAffordance` sends a `secret` field to `PasswordInput` and a `suppliedInCode` one to `CodeNote` whatever its `type`, so neither can land in an input that shows or edits the value. A fieldset binds each child to the last segment of its `path` and writes the whole object back; it keeps a running value, so two child edits with no re-render in between both survive, and a new value from outside replaces it. Children are drawn through this package's registry, or through `renderField` when given. A password input writes `undefined` when emptied, never `''` over the stored secret, and shows `(unchanged)` as its placeholder while one is stored.

The `OptionsFormField` type is declared here structurally (`src/options-form-types.ts`), like `ViewConfig`, because the `@zodal/ui` on npm predates `toOptionsFormConfig`; any object of that shape works.

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
