# zodal-ui-shadcn -- Agent Guide

## What This Is

A zodal UI renderer package for shadcn/ui components. Provides concrete React components that consume zodal's headless configuration objects (ColumnConfig, FormFieldConfig, FilterFieldConfig) and render them using shadcn/ui primitives.

## Package Structure

```
src/
  index.ts             — Public exports
  types.ts             — Shared prop types (CellProps, FormFieldProps, FilterFieldProps)
  registry.ts          — createShadcnRegistry() factory
  view-types.ts        — Structural ViewConfig (mirror of @zodal/ui's toViewConfig output; npm lacks it yet)
  group-items.ts       — Local copy of @zodal/ui groupItems/groupId (same reason)
  components/
    ghost-slider.ts    — GhostSlider: native range input + ghost thumb at the saved value (editWidget 'slider')
  renderers/
    cell-renderers.ts  — Table cell renderers (text, number, boolean, date, badge, array, currency)
    form-renderers.ts  — Form field renderers (text, number, checkbox, select, date)
    filter-renderers.ts — Filter widget renderers (text, select, range, boolean)
    view-renderers.ts  — Collection view: CollectionView, ListItem, GridCard
tests/
  registry.test.ts     — Registry resolution tests
  browser/             — `pnpm test:browser`: layout checks in headless Chromium (playwright-core), not in CI
```

## Key Patterns

- **Headless first**: Renderers consume zodal config objects, not raw Zod schemas
- **Priority-based resolution**: Each renderer has a tester function that returns a PRIORITY score
- **Plain HTML baseline**: Current renderers use plain HTML elements; replace with actual shadcn/ui components as needed
- **Escape hatches**: Users can override any renderer by registering a higher-priority entry

## Skills

Before working on this package, read the zodal UI renderer skill:
- https://github.com/i2mint/zodal/tree/main/.claude/skills/zodal-ui-renderer

## Dependencies

- `@zodal/core` and `@zodal/ui` as peer dependencies
- `react` and `react-dom` as peer dependencies
- Build: tsup (dual CJS/ESM + .d.ts)
- Test: vitest with jsdom environment

## Commands

- `npm run build` — Build with tsup
- `npm test` — Run vitest
- `npm run typecheck` — TypeScript type check
