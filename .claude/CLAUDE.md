# zodal-ui-shadcn -- Agent Guide

## What This Is

A zodal UI renderer package for shadcn/ui components. Provides concrete React components that consume zodal's headless configuration objects (ColumnConfig, FormFieldConfig, FilterFieldConfig) and render them using shadcn/ui primitives.

## Package Structure

```
src/
  index.ts             — Public exports
  types.ts             — Shared prop types (CellProps, FormFieldProps, FilterFieldProps, FieldBinding, BoundFieldProps)
  registry.ts          — createShadcnRegistry() factory
  tag-logic.ts         — Framework-free tag logic: draft resolution, option matching, the contains-filter value, suggestion pacing (mirrored in ui-vanilla; keep the copies identical)
  renderers/
    cell-renderers.ts  — Table cell renderers (text, number, boolean, date, badge, array → chips, currency)
    form-renderers.ts  — Form field renderers (text, number, checkbox, select, date, tags)
    filter-renderers.ts — Filter widget renderers (text, select, range, boolean, chip filter)
    tag-renderers.ts   — Tag widgets: createTagInput / createChipFilter / createChipCell (React, hooks)
    content-renderers.ts — ContentRef cell (link / image thumbnail) and file-upload form field
tests/
  registry.test.ts     — Registry resolution tests, incl. "no winner changes for non-array fields"
  tag-logic.test.ts    — Tag logic (draft resolution, filter value, suggestion pacing)
  tag-renderers.test.ts — Tag widgets rendered with react-dom/client + act in jsdom (keyboard, ARIA, suggest, raw values, overflow)
```

## Key Patterns

- **Headless first**: Renderers consume zodal config objects, not raw Zod schemas
- **Priority-based resolution**: Each renderer has a tester function that returns a PRIORITY score
- **Plain HTML baseline**: Current renderers use plain HTML elements; replace with actual shadcn/ui components as needed
- **Escape hatches**: Users can override any renderer by registering a higher-priority entry
- **Props = `FieldRenderProps` with `field` as the binding**: form/filter components get `{ field: { value, onChange }, config, context?, affordance? }`. `@zodal/ui`'s `FieldRenderProps.field` is the affordance, which collides with this package's binding; renaming it would break callers, so the affordance travels as `affordance` and `context` (carrying `suggest`) is optional
- **Tag widgets**: controlled inputs; several commits in one event (a paste) report one `onChange`; typed text survives refusal, error and blur; the chip filter always emits an `arrayContainsAny` `FilterCondition` (OR within the field, equal to `arrayContains` for one value, a value shape that never flips)
- **Tests without @testing-library**: `react-dom/client` `createRoot` + `act` from `react`, `IS_REACT_ACT_ENVIRONMENT = true`; set input values through the native `value` setter before dispatching `input` so React's onChange fires
- **Known quirk, left as is**: the cell fallback (`() => FALLBACK`) matches every mode, so fields with no form/filter renderer of their own resolve to `TextCell (fallback)` in form/filter mode; `tests/registry.test.ts` pins it

## Skills

Before working on this package, read the zodal UI renderer skill:
- https://github.com/i2mint/zodal/tree/main/.claude/skills/zodal-ui-renderer

## Dependencies

- `@zodal/core` and `@zodal/ui` as peer dependencies, caret on the lowest version needed (`^0.2.2`; see zodal's `docs/versioning.md`)
- `react` and `react-dom` as peer dependencies
- Build: tsup (dual CJS/ESM + .d.ts)
- Test: vitest with jsdom environment

## Commands

- `npm run build` — Build with tsup
- `npm test` — Run vitest
- `npm run typecheck` — TypeScript type check
