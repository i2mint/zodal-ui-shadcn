/**
 * Bucket items into the ordered groups a collection view draws.
 *
 * A copy of `groupId` / `groupItems` from `@zodal/ui` (i2mint/zodal#14), same contract. Kept
 * here only because `@zodal/ui` 0.2.0 on npm does not export them; replace with the import
 * once a version that does is published.
 */

import type { ViewGroupConfig } from './view-types.js';

/**
 * A group's id: the group field and the value, so a collapsed `class:strings` stays apart from
 * an `owner:strings` when the group field changes. `value === null`: the items with no value.
 */
export function groupId(field: string, value: string | null): string {
  return value === null ? `${field}:` : `${field}:${value}`;
}

/** One group of items, as a renderer draws it. */
export interface ItemGroup<T> {
  /** Stable id (`groupId(field, value)`; `''` for the single group of an ungrouped view): what
   *  `ViewState.collapsedGroups` / `expandedGroups` hold. */
  id: string;
  /** `'value'`: items sharing a value; `'none'`: items with no value; `'all'`: an ungrouped
   *  view's single group (draw no header). */
  kind: 'value' | 'none' | 'all';
  /** The group's value as a string (null for `'none'` and `'all'`). */
  value: string | null;
  /** Header text. */
  label: string;
  /** The items in the group, in input order. With `multiValue: 'duplicate'` an item can be in
   *  several groups: key rendered items by group id and item id together. */
  items: T[];
  /** Is the group collapsed now? */
  collapsed: boolean;
}

export interface GroupItemsOptions {
  /** Ids of the groups a person collapsed (`ViewState.collapsedGroups`): always collapsed. */
  collapsedGroups?: readonly string[];
  /** Ids of the groups a person expanded (`ViewState.expandedGroups`): expanded unless also in
   *  `collapsedGroups`. Any other group follows the config's `defaultState`. */
  expandedGroups?: readonly string[];
  /** Header of the group of items with no value. Default: `'None'`. */
  emptyLabel?: string;
}

/**
 * Bucket items into the ordered groups a view draws. With no group config, one group
 * (`kind: 'all'`) holds every item. Groups follow the closed vocabulary's order when there is
 * one (empty groups omitted, values outside it after), else first-seen order; the group of
 * items with no value comes last.
 */
export function groupItems<T>(
  items: readonly T[],
  group: ViewGroupConfig | null,
  { collapsedGroups = [], expandedGroups = [], emptyLabel = 'None' }: GroupItemsOptions = {},
): ItemGroup<T>[] {
  if (!group) return [{ id: '', kind: 'all', value: null, label: '', items: [...items], collapsed: false }];
  const isCollapsed = (id: string): boolean =>
    group.collapsible &&
    (collapsedGroups.includes(id) || (!expandedGroups.includes(id) && group.defaultState === 'collapsed'));
  const labels = new Map((group.order ?? []).map((o) => [o.value, o.label]));
  const buckets = new Map<string | null, T[]>();
  const add = (value: string | null, item: T) => {
    const bucket = buckets.get(value);
    if (bucket) bucket.push(item);
    else buckets.set(value, [item]);
  };
  for (const item of items) {
    const raw = (item as Record<string, unknown>)?.[group.field];
    const values = groupValues(raw, group);
    if (values.length === 0) add(null, item);
    for (const v of values) add(v, item);
  }
  const values = [...buckets.keys()].filter((v): v is string => v !== null);
  if (group.order) {
    // Values outside the vocabulary (stale data) rank after it, keeping first-seen order (stable sort).
    const rank = new Map(group.order.map((o, i) => [o.value, i]));
    const outside = group.order.length;
    values.sort((a, b) => (rank.get(a) ?? outside) - (rank.get(b) ?? outside));
  }
  const out: ItemGroup<T>[] = values.map((value) => {
    const id = groupId(group.field, value);
    return { id, kind: 'value', value, label: labels.get(value) ?? value, items: buckets.get(value)!, collapsed: isCollapsed(id) };
  });
  if (buckets.has(null)) {
    const id = groupId(group.field, null);
    out.push({ id, kind: 'none', value: null, label: emptyLabel, items: buckets.get(null)!, collapsed: isCollapsed(id) });
  }
  return out;
}

/** The group values an item belongs to (empty: the no-value group). */
function groupValues(raw: unknown, group: ViewGroupConfig): string[] {
  const asValue = (v: unknown): string | null => {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
    return String(v);
  };
  if (raw instanceof Set || Array.isArray(raw)) {
    const unique = [...new Set([...raw].map(asValue).filter((v): v is string => v !== null))];
    return group.multiValue === 'primary' ? unique.slice(0, 1) : unique;
  }
  const value = asValue(raw);
  return value === null ? [] : [value];
}
