/**
 * Collection view components: the whole collection as a list of rows or a grid of cards,
 * grouped and collapsible, from a `ViewConfig` (`toViewConfig(collection, mode)` in `@zodal/ui`).
 *
 * - `ListItem` / `GridCard`: one item, its fields drawn by role (image, label, badges,
 *   secondary text) plus its item operations and a selection checkbox;
 * - `CollectionView`: every item, bucketed into groups whose header collapses and expands the
 *   group (when the config says the group is collapsible), and a toolbar with the collection
 *   operations (and the selection operations while something is selected).
 *
 * Collapse state: `collapsedGroups` / `expandedGroups` (from `ViewState`) set where groups
 * start; a header click toggles the group at once and reports it through `onToggleGroup`, so a
 * consumer can persist it (`ViewStateStore.toggleGroup`) and pass the new lists back.
 *
 * Plain HTML with Tailwind classes, like the other renderers here; swap in shadcn/ui
 * primitives (Card, Badge, Button, Checkbox, Collapsible) by wrapping or re-registering.
 */

import React from 'react';
import { groupItems } from '../group-items.js';
import type { ViewConfig, ViewFieldConfig, ViewOperationConfig } from '../view-types.js';

type Item = Record<string, unknown>;
const h = React.createElement;
const DASH = '—';

/** Draw one field value; return `null` or `undefined` to fall back to the default text. */
export type ValueRenderer = (value: unknown, field: ViewFieldConfig, item: Item) => React.ReactNode;

/** What every item component takes. */
export interface ItemViewProps {
  /** The item. */
  item: Item;
  /** The view config (`toViewConfig(collection, 'list' | 'grid')`). */
  config: ViewConfig;
  /** Is the item selected? */
  selected?: boolean;
  /** Called when the selection checkbox changes. Without it, no checkbox is drawn. */
  onSelect?: (id: string, selected: boolean, item: Item) => void;
  /** Called when an operation button is clicked. Without it, no operation is drawn. */
  onOperation?: (operation: ViewOperationConfig, item: Item) => void;
  /** Override how a value is drawn (e.g. with a cell renderer from the registry). */
  renderValue?: ValueRenderer;
  /** Called when the item itself (outside its buttons) is clicked or activated with Enter. */
  onOpen?: (item: Item) => void;
}

/** What the collection view takes. */
export interface CollectionViewProps extends Omit<ItemViewProps, 'item' | 'selected'> {
  /** The items to draw (already sorted and filtered). */
  items: readonly Item[];
  /** Ids of the collapsed groups (`ViewState.collapsedGroups`). */
  collapsedGroups?: readonly string[];
  /** Ids of the expanded groups (`ViewState.expandedGroups`); any other group follows `defaultState`. */
  expandedGroups?: readonly string[];
  /** Called when a group header is clicked; the group toggles either way. */
  onToggleGroup?: (groupId: string) => void;
  /** Ids of the selected items. */
  selectedIds?: readonly string[];
  /** Called for a collection or selection operation (`items`: the selected items, or none). */
  onCollectionOperation?: (operation: ViewOperationConfig, items: Item[]) => void;
  /** Header of the group of items with no value. Default: `'None'`. */
  emptyLabel?: string;
  /** Shown when there are no items. Default: `'No items'`. */
  emptyText?: string;
}

/** The item's id, as a string. */
export function itemId(item: Item, config: ViewConfig): string {
  return String(item[config.idField] ?? '');
}

// ============================================================================
// Values
// ============================================================================

function isContentRef(value: unknown): value is { _tag: 'ContentRef'; url?: string } {
  return typeof value === 'object' && value !== null && (value as { _tag?: unknown })._tag === 'ContentRef';
}

function textOf(value: unknown, field: ViewFieldConfig): string {
  if (value === null || value === undefined || value === '') return DASH;
  if (value instanceof Date) return value.toLocaleDateString();
  if (field.zodType === 'date' && typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
  }
  if (field.zodType === 'boolean' || typeof value === 'boolean') return value ? '✓' : '✗';
  if (Array.isArray(value) || value instanceof Set) return [...value].map(String).join(', ');
  if (isContentRef(value)) return value.url ?? DASH;
  return String(value);
}

function Value({ item, field, renderValue }: { item: Item; field: ViewFieldConfig; renderValue?: ValueRenderer }) {
  const custom = renderValue?.(item[field.name], field, item);
  if (custom !== null && custom !== undefined) return h(React.Fragment, null, custom);
  const text = textOf(item[field.name], field);
  const max = field.truncate;
  if (max && text.length > max) return h('span', { title: text }, `${text.slice(0, max)}...`);
  return h('span', null, text);
}

function imageUrl(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (isContentRef(value) && value.url) return value.url;
  return null;
}

const BADGE_CLASS = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium';

/** Badges: one per value (a tag list gives several); a boolean shows its label when true. */
function badges(item: Item, field: ViewFieldConfig): React.ReactElement[] {
  const value = item[field.name];
  if (value === null || value === undefined || value === '') return [];
  if (field.zodType === 'boolean' || typeof value === 'boolean') {
    return value
      ? [h('span', { key: field.name, className: BADGE_CLASS, 'data-field': field.name, 'data-variant': field.badge?.true ?? 'default' }, field.label)]
      : [];
  }
  const values = Array.isArray(value) || value instanceof Set ? [...value].map(String) : [String(value)];
  const labelOf = (v: string) => field.options?.find((o) => o.value === v)?.label ?? v;
  return values.map((v) =>
    h('span', { key: `${field.name}:${v}`, className: BADGE_CLASS, 'data-field': field.name, 'data-value': v, 'data-variant': field.badge?.[v] ?? 'default' }, labelOf(v)),
  );
}

// ============================================================================
// Pieces shared by a row and a card
// ============================================================================

function Operations({ ops, run, className = 'flex gap-1' }: { ops: ViewOperationConfig[]; run: (op: ViewOperationConfig) => void; className?: string }) {
  if (ops.length === 0) return null;
  return h('div', { className, 'data-role': 'actions' },
    ...ops.map((op) =>
      h('button', {
        key: op.name,
        type: 'button',
        className: op.variant === 'destructive'
          ? 'rounded-md px-2 py-1 text-sm text-destructive hover:bg-destructive/10'
          : 'rounded-md px-2 py-1 text-sm hover:bg-accent',
        'data-operation': op.name,
        'data-variant': op.variant ?? 'default',
        'data-confirm': op.confirm ? 'true' : undefined,
        title: op.keyboardShortcut ? `${op.label} (${op.keyboardShortcut})` : undefined,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          run(op);
        },
      }, op.label),
    ),
  );
}

function labelText(item: Item, config: ViewConfig): string {
  const f = config.fields.label;
  const v = f ? item[f.name] : undefined;
  return v === null || v === undefined || v === '' ? itemId(item, config) : String(v);
}

function SelectBox({ item, config, selected = false, onSelect }: ItemViewProps) {
  if (!config.selection || !onSelect) return null;
  return h('input', {
    type: 'checkbox',
    className: 'h-4 w-4',
    checked: selected,
    'aria-label': `Select ${labelText(item, config)}`,
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onSelect(itemId(item, config), e.target.checked, item),
  });
}

function Image({ item, config, className }: { item: Item; config: ViewConfig; className: string }) {
  const f = config.fields.image;
  if (!f) return null;
  const url = imageUrl(item[f.name]);
  if (!url) return h('div', { className: `${className} bg-muted`, 'data-placeholder': 'true', 'aria-hidden': true });
  return h('img', { className: `${className} object-cover`, src: url, alt: labelText(item, config), loading: 'lazy' });
}

function Body(props: ItemViewProps) {
  const { item, config, renderValue } = props;
  const badgeNodes = config.fields.badges.flatMap((f) => badges(item, f));
  return h(React.Fragment, null,
    h('div', { className: 'font-medium leading-none', 'data-role': 'label' }, labelText(item, config)),
    badgeNodes.length ? h('div', { className: 'flex flex-wrap gap-1', 'data-role': 'badges' }, ...badgeNodes) : null,
    ...config.fields.secondary.map((f) =>
      h('div', { key: f.name, className: 'text-sm text-muted-foreground', 'data-field': f.name },
        h('span', null, `${f.label}: `),
        h(Value, { item, field: f, renderValue }),
      ),
    ),
  );
}

/** Attributes for the item's root: id, selection, and open on click / Enter. */
function rootProps({ item, config, selected, onOpen }: ItemViewProps) {
  return {
    'data-id': itemId(item, config),
    'aria-selected': selected ? true : undefined,
    tabIndex: onOpen ? 0 : undefined,
    onClick: onOpen ? () => onOpen(item) : undefined,
    onKeyDown: onOpen
      ? (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(item);
        }
      : undefined,
  };
}

// ============================================================================
// Item components
// ============================================================================

/** One item as a list row: checkbox, thumbnail, label, badges, secondary text, operations. */
export function ListItem(props: ItemViewProps) {
  const { item, config, onOperation } = props;
  return h('li', { className: 'flex items-center gap-3 border-b px-3 py-2', 'data-role': 'list-item', ...rootProps(props) },
    h(SelectBox, props),
    h(Image, { item, config, className: 'h-10 w-10 shrink-0 rounded' }),
    h('div', { className: 'flex min-w-0 flex-1 flex-col gap-1' }, h(Body, props)),
    onOperation ? h(Operations, { ops: config.operations.item, run: (op) => onOperation(op, item) }) : null,
  );
}

/** One item as a grid card: cover image, then label, badges, secondary text, operations. */
export function GridCard(props: ItemViewProps) {
  const { item, config, onOperation } = props;
  return h('article', { className: 'flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm', 'data-role': 'card', ...rootProps(props) },
    h(Image, { item, config, className: 'aspect-video w-full' }),
    h('div', { className: 'flex flex-col gap-2 p-3' }, h(SelectBox, props), h(Body, props)),
    onOperation ? h(Operations, { ops: config.operations.item, run: (op) => onOperation(op, item), className: 'flex gap-1 border-t p-2' }) : null,
  );
}

// ============================================================================
// The collection view
// ============================================================================

/**
 * The whole collection as a list or a grid (`config.kind`), grouped by `config.group`.
 *
 * @example
 * ```tsx
 * const view = toViewConfig(instruments, 'grid');
 * <CollectionView items={items} config={view}
 *   collapsedGroups={vs.collapsedGroups} expandedGroups={vs.expandedGroups}
 *   onToggleGroup={(id) => viewState.toggleGroup(id)}
 *   onOperation={(op, item) => run(op.name, item)} />
 * ```
 */
export function CollectionView(props: CollectionViewProps) {
  const { items, config, collapsedGroups, expandedGroups, onToggleGroup, selectedIds = [], onCollectionOperation, emptyLabel, emptyText = 'No items' } = props;
  // Toggles since the collapse props last changed: applied at once, dropped when new props arrive.
  const [toggled, setToggled] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => setToggled({}), [collapsedGroups, expandedGroups]);
  const groupContentId = React.useId();

  const ItemComponent = config.kind === 'grid' ? GridCard : ListItem;
  const drawItems = (list: readonly Item[], groupKey: string) => {
    const children = list.map((item) =>
      h(ItemComponent, {
        key: `${groupKey}/${itemId(item, config)}`,
        item,
        config,
        selected: selectedIds.includes(itemId(item, config)),
        onSelect: props.onSelect,
        onOperation: props.onOperation,
        renderValue: props.renderValue,
        onOpen: props.onOpen,
      }),
    );
    return config.kind === 'grid'
      ? h('div', { className: 'grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4', 'data-role': 'grid', role: 'list' }, ...children)
      : h('ul', { className: 'flex flex-col', 'data-role': 'list' }, ...children);
  };

  const selected = items.filter((i) => selectedIds.includes(itemId(i, config)));
  const toolbarOps = onCollectionOperation ? [...config.operations.collection, ...(selected.length ? config.operations.selection : [])] : [];
  const toolbar = onCollectionOperation && toolbarOps.length
    ? h(Operations, {
        ops: toolbarOps,
        className: 'flex gap-2 pb-2',
        run: (op) => onCollectionOperation(op, config.operations.selection.includes(op) ? selected : []),
      })
    : null;

  let content: React.ReactNode;
  if (items.length === 0) {
    content = h('p', { className: 'py-6 text-center text-sm text-muted-foreground', 'data-role': 'empty' }, emptyText);
  } else {
    const groups = groupItems(items, config.group, { collapsedGroups, expandedGroups, emptyLabel });
    content = groups.map((g, index) => {
      if (g.kind === 'all' || !config.group) return h(React.Fragment, { key: 'all' }, drawItems(g.items, 'all'));
      const collapsible = config.group.collapsible;
      const collapsed = collapsible && (toggled[g.id] ?? g.collapsed);
      const contentId = `${groupContentId}-${index}`;
      const title = [
        h('span', { key: 'label', 'data-role': 'group-label' }, g.label),
        h('span', { key: 'count', className: 'ml-2 text-xs text-muted-foreground', 'data-role': 'group-count' }, String(g.items.length)),
      ];
      const header = collapsible
        ? h('button', {
            type: 'button',
            className: 'flex w-full items-center py-2 text-left text-sm font-semibold',
            'data-role': 'group-header',
            'aria-expanded': !collapsed,
            'aria-controls': contentId,
            onClick: () => {
              setToggled((t) => ({ ...t, [g.id]: !collapsed }));
              onToggleGroup?.(g.id);
            },
          }, ...title)
        : h('div', { className: 'flex items-center py-2 text-sm font-semibold', 'data-role': 'group-header' }, ...title);
      return h('section', { key: g.id, 'data-group-id': g.id, 'data-group-kind': g.kind, 'data-collapsed': String(collapsed) },
        header,
        h('div', { id: contentId, hidden: collapsed }, drawItems(g.items, g.id)),
      );
    });
  }
  return h('div', { className: 'flex flex-col gap-2', 'data-role': 'collection-view', 'data-kind': config.kind }, toolbar, content);
}
