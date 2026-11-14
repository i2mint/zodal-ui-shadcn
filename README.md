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
| `TextCell` | `string`, and any type without its own cell (fallback) | Plain text, optional truncation |
| `NumberCell` | `number`, `int`, `float` | Formatted numbers |
| `BooleanCell` | `boolean` | Checkmark / cross |
| `DateCell` | `date` | Localized date string |
| `BadgeCell` | `enum` | Inline badge with variant |
| `ArrayCell` | `array` | Chips, the first 3 shown, then a "+N" chip naming the rest |
| `CurrencyCell` | number + `displayFormat: 'currency'` | USD currency format |

### Form Renderers (data entry)

| Renderer | Zod Type | Description |
|----------|----------|-------------|
| `TextInput` | `string` | Text input with label + help text; a history button when the field has history |
| `TextareaInput` | `string` + `editWidget: 'textarea'` | Multi-line text (`description`, `notes`... or declared); a history button when the field has history |
| `ReadOnlyInput` | any type without its own form renderer (fallback) | Read-only text showing the value (JSON for structured values), so a field of another type is never overwritten with a string |
| `NumberInput` | `number`, `int`, `float` | Numeric input |
| `CheckboxInput` | `boolean` | Checkbox with label |
| `SelectInput` | `enum` | Dropdown select |
| `DateInput` | `date` | Date picker |
| `FieldsetInput` | `editWidget: 'fieldset'` (options forms) | A nested object's fields inside a `<fieldset>` |
| `PasswordInput` | `editWidget: 'password'` (options forms) | Masked; never prefilled from a stored value |
| `CodeNote` | `editWidget: 'code'` (options forms) | "Supplied in code" note, never an input |
| `TagInput` | `array` (`type: 'tags'`), or `editWidget: 'tags'` | Chip input: add with Enter or comma, remove with Backspace or a chip's button; options or `context.suggest` |

### Filter Renderers (data filtering)

| Renderer | Filter Type | Description |
|----------|-------------|-------------|
| `TextFilter` | `search`; fallback for other filter types on scalar, enum, date and collection (array, set, tuple) fields | Text search input |
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

A number field declared with `editWidget: 'slider'` renders as `GhostSlider`: a range input that, while the person drags, leaves a ghost thumb at the saved value (the value at pointer-down, or `savedValue`) so they can see how far they moved; it disappears on release. The pointer is handled by the slider itself, not by the browser, so on a phone the thumb stays under the finger and lands where the finger is lifted: a press on the thumb grabs it without a jump, a tap on the track moves the thumb there, a touch only drags once it has moved a few pixels sideways (a vertical swipe still scrolls the page), and the touch area is 44px tall. The ghost is a light ring with a dark outline, visible on the filled and the empty part of the track (`--zodal-slider-ghost-ring`, `--zodal-slider-ghost-outline`, `--zodal-slider-ghost-fill` restyle it). A readout shows the live value; the form value is written on commit (release, or each key press), not on every move.

```typescript
const settings = defineCollection(z.object({ volume: z.number().min(0).max(11) }), {
  fields: { volume: { editWidget: 'slider' } },
});
```

Bounds and step come from the form config when it carries them (`bounds: { min, max }`, `step`; `toFormConfig` does not project them yet: i2mint/zodal#43), else 0..100 by 1. `GhostSlider` is also exported on its own (`value`, `onValueChange`, `onValueCommit`, `onDragEnd`, `min`, `max`, `step`, `savedValue`, `thumbSize`); `onDragEnd(committed)` ends every pointer gesture, so a host holding a preview clears it there (a drag that came back to its start, or one the browser cancelled, commits nothing); `thumbSize` must match the thumb's rendered width (16px by default), because a range input insets its thumb by half that width at each end and the ghost is inset the same way. Single value, horizontal, either writing direction, controlled only.

`pnpm test:browser` checks the ghost's placement in headless Chromium (needs a Chromium for playwright-core, `npx playwright-core install chromium`); it is not part of `pnpm test`.

## Range slider: two thumbs, ghosts, percentile ticks

A range filter declared with `filterWidget: 'range-slider'` (or `editWidget: 'range-slider'`, when the field has no other edit widget) renders as `GhostRangeSliderField`: a two-thumb ("double cursor") slider with a pair of number fields bound to it both ways. The thumb being dragged leaves a ghost where it started; the filter value (`[min, max]`, `undefined` for an open side) is written on commit (release, a tap on the track, a key press, or blur/Enter in a field), not on every move. A thumb pushed to its end means "no bound".

```ts
fields: { year: { filterable: 'range', filterWidget: 'range-slider' } },
// give that field's filter config entry the data's percentiles; the track is then laid out by them:
const filters = toFilterConfig(schema).map((f) => (f.name === 'year' ? { ...f, quantiles: quantilesOf(rows.map((r) => r.year)) } : f));
```

The scale comes from the config: `quantiles` give a **quantile scale** (equal distances are equal shares of the data, so a skewed distribution gets room where the data is; ticks sit at the 0/10/25/50/75/90/100th percentiles, labelled with the values found there); otherwise `bounds: { min, max }` give a linear one. `FilterFieldConfig` does not type `quantiles` yet, so it is read structurally, as `sliderRange` reads form bounds. An `int` field rounds to whole numbers, a config `step` to its multiples.

Behaviour worth knowing: moving one thumb changes only its side; one pointer at a time; a press on a thumb grabs it without a jump, a press on the track moves the nearer thumb there; a touch drags only after a few pixels sideways and the track lets the page scroll vertically (a cancelled touch reverts); when the thumbs coincide, the first move's direction picks one; a key moves its thumb at least far enough to change the rounded value (arrows one percentile of the track, Page keys ten); the track is laid out left to right under any page direction. In the fields, a keystroke is never refused, a draft that is not a valid value on its side (including one past the other side) is marked `aria-invalid` and changes nothing, and blur/Enter commits only a changed value.

Use the pieces directly too: `GhostRangeSlider` (the slider), `GhostRangeSliderField` (slider + fields; `toInput`/`fromInput` convert units, e.g. dollars shown as millions), and the framework-free scales `linearScale`, `quantileScale`, `quantilesOf`. Colours come from CSS custom properties (`--zodal-range-fill`, `--zodal-range-track`, `--zodal-range-thumb`, `--zodal-range-thumb-border`, `--zodal-range-tick`); the interactive area is 44px tall; the control is a labelled `role="group"` of two `role="slider"` thumbs. `pnpm test:browser` checks, in headless Chromium, ghost placement, single commits, non-crossing, the quantile layout, grabs, coinciding thumbs, touch slop, a second finger, cancel, and right-to-left pages.

## Feedback on every press (on by default)

Every pressable these components draw (operation buttons, collection and selection operations, a `ListItem` or `GridCard` with `onOpen`) acknowledges a press on itself at once and shows that work is going on:

- `data-pressed` on `pointerdown` (CSS `:active` alone does not fire on iOS Safari);
- `data-pending`, `aria-busy` and `aria-disabled` while the callback's promise runs, with repeat presses ignored;
- a `PressIndicator` spinner once the wait passes 400 ms, kept at least 500 ms;
- `data-status` when it settles.

The look is `PRESS_CLASS` (Tailwind `data-[pressed]:` / `data-[pending]:` variants, `touch-manipulation`, `motion-reduce:` fallbacks). **Return the work's promise** from `onOperation`, `onCollectionOperation` and `onOpen` to get the pending state.

For your own components:

```tsx
import { usePress, PressIndicator, PRESS_CLASS } from '@zodal/ui-shadcn';

function LaunchTile({ app }: { app: { id: string; name: string } }) {
  const { props, state } = usePress(() => openApp(app.id), { enterKey: true });
  return (
    <article {...props} tabIndex={0} className={`${PRESS_CLASS} rounded-lg border p-4`}>
      {app.name}<PressIndicator show={state.indicator} />
    </article>
  );
}
```

`createActionFeedback`, `FEEDBACK_MS` and `feedbackFor` are exported too. Why it is the default: i2mint/zodal `docs/adr/0001-feedback-principle.md`.

## Collection forms

Resolve each `toFormConfig` field through `formFieldAffordance`, so a closed choice (an enum, a literal, a union of literals) reaches the select renderer, which writes the option's `raw` value back (numbers stay numbers):

```ts
const Field = registry.resolve(formFieldAffordance(collection.fieldAffordances[config.name], config), { mode: 'form' });
```

## Field input history

A text or textarea field whose config has `history` (from the `history` affordance: `fields: { lyrics: { history: true } }`) shows a history button when the render context carries a store, `{ mode: 'form', history }`. The store is `createFieldHistory()` from `@zodal/store`, or anything of the `FieldHistoryStore` shape:

```tsx
import { createFieldHistory } from '@zodal/store';
import { createLocalStorageProvider } from '@zodal/store-localstorage';

const history = createFieldHistory({
  provider: createLocalStorageProvider({ storageKey: 'my-app.field-history' }),
});
const ctx = { mode: 'form', history };
const Field = registry.resolve(formFieldAffordance(fa, config), ctx);
<Field field={{ value, onChange }} config={config} context={ctx} />
```

- The button (lucide's `rotate-ccw-clock`, inline) is hidden while the history is empty, and named "<label> history".
- It opens a native `popover` listing past values: the first line, "+N lines" and a relative time per row, pinned first, a filter above 7 entries, a full-value preview, pin and remove per row (Shift+Delete removes the active row), and "Clear history" with Undo.
- Picking an entry records the current value first (so a pick never loses typing), replaces the value, closes the list and returns focus to the field. Alt+ArrowDown on the field opens the list.
- Controls are at least 44 px under a coarse pointer (`minTarget` to change it); on a narrow screen the list is a bottom sheet.
- "Clear history" clears at once; Undo stays offered for 10 seconds, even if the list is closed and reopened. A store failure (a pick, a pin, a clear) is shown in the list, and a refused pick leaves the field as it was.

For your own field renderers: `FieldHistory` attaches the button and list to any input or textarea (`history`, `config`, `label`, `value`, `onChange`, `fieldRef`), and `useFieldHistory(history, scope)`, `HistoryButton` and `HistoryList` are the pieces it is made of. Record what was used with `recordUse(fields, values, { history })` and start over with `startNewItem(...)`, both from `@zodal/ui`. The types (`FieldHistoryStore`, `HistoryEntry`) are declared here structurally until a `@zodal/ui` that has them is on npm. Design: [field-input-history.md](https://github.com/i2mint/zodal/blob/main/docs/research/field-input-history.md).

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

The loop runs over the top-level fields (a nested object arrives as one `'fieldset'` field, keyed by its top-level name). `optionsFieldAffordance` sends a `secret` field to `PasswordInput` and a `suppliedInCode` one to `CodeNote` whatever its `type`, so neither can land in an input that shows or edits the value.

A fieldset binds each child to the last segment of its `path` and writes the whole object back. It keeps a running value, so two child edits with no re-render in between both survive, and a new value from outside replaces it. Children resolve through the `registry` prop when given (pass your own registry so your overrides apply inside fieldsets too), else through `createShadcnRegistry()`; a `renderField` prop draws them instead, and may use hooks. A disabled fieldset disables every child.

A password input holds only what the person types, never the stored value, and clears it when the value changes from outside (a save, a reset). It shows `(unchanged)` as its placeholder while a value is stored, and writes `undefined`, never `''`, when emptied again: "no new value". Inside a fieldset that puts the stored secret back under its key; at the top level, your `onChange` decides (keep the stored secret when it receives `undefined` for a `secret` field).

The `OptionsFormField` type is declared here structurally (`src/options-form-types.ts`), like `ViewConfig`, because the `@zodal/ui` on npm predates `toOptionsFormConfig`; any object of that shape works.

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
