/**
 * `TrashView` (i2mint/zodal-ui-shadcn#39): what is in the Trash, with Restore, Delete
 * permanently (confirms, with the count), Empty Trash (confirms) and the retention note.
 * Pairs with `withTrash` in `@zodal/store` and the `trash` affordance in `@zodal/core`.
 *
 * Restore is not confirmed (it loses nothing); the two permanent actions always are.
 */

import React from 'react';
import { ConfirmButton, useTap } from './confirm-button.js';

const h = React.createElement;
type Item = Record<string, unknown>;

export interface TrashViewProps {
  /** The trashed items (`provider.trashed.getList`). */
  items: readonly Item[];
  /** The item's id field. Default `'id'`. */
  idField?: string;
  /** The field drawn as the item's name. Default `'name'`, then `'title'`. */
  labelField?: string;
  /** The deletion-mark field (`provider.trashField`). Default `'deletedAt'`. */
  trashField?: string;
  /** Items older than this are purged for good: shown as a note and as "N days left" per item. */
  retentionDays?: number;
  /** Now in ms, injectable for tests. */
  now?: () => number;
  onRestore: (ids: string[]) => unknown;
  onPurge: (ids: string[]) => unknown;
  onEmptyTrash: () => unknown;
  noun?: { one: string; many: string };
  /** How many items the whole Trash holds, when `items` is one page of it (Empty Trash names it). Default: `items.length`. */
  totalCount?: number;
}

const DAY_MS = 86_400_000;

/** Whole days left before an item is purged, or `undefined` without a retention. */
export function daysLeft(markedAt: unknown, retentionDays: number | undefined, now: number): number | undefined {
  if (retentionDays === undefined || markedAt == null) return undefined;
  const at = typeof markedAt === 'number' ? markedAt : Date.parse(String(markedAt));
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at + retentionDays * DAY_MS - now) / DAY_MS));
}

export function TrashView(p: TrashViewProps) {
  const { items, idField = 'id', trashField = 'deletedAt', retentionDays, onRestore, onPurge, onEmptyTrash, noun = { one: 'item', many: 'items' }, totalCount } = p;
  const tap = useTap();
  const now = (p.now ?? Date.now)();
  const labelField = p.labelField ?? (items.some((i) => 'name' in i) ? 'name' : 'title');
  const [selected, setSelected] = React.useState<readonly string[]>([]);
  const ids = items.map((i) => String(i[idField]));
  const chosen = selected.filter((id) => ids.includes(id));
  // Forget ids that left the Trash, so an item trashed again later does not come back checked.
  const idsKey = ids.join('\u0000');
  React.useEffect(() => { setSelected((s) => (s.every((id) => ids.includes(id)) ? s : s.filter((id) => ids.includes(id)))); }, [idsKey]);
  const done = (run: () => unknown) => async () => { const r = await run(); setSelected([]); return r; };
  const word = (n: number) => (n === 1 ? noun.one : noun.many);

  if (items.length === 0) {
    return h('div', { 'data-zodal-trash': '', 'data-empty': '', className: 'p-4 text-sm text-muted-foreground' }, 'The Trash is empty.');
  }
  return h('div', { 'data-zodal-trash': '', className: 'flex flex-col gap-3' },
    retentionDays !== undefined
      ? h('p', { 'data-role': 'retention', className: 'text-sm text-muted-foreground' }, `Items are deleted for good ${retentionDays} days after they are moved to the Trash.`)
      : null,
    h('div', { className: 'flex flex-wrap items-center gap-2', role: 'toolbar', 'aria-label': 'Trash actions' },
      chosen.length ? h(ConfirmButton, { label: 'Restore', run: done(() => onRestore([...chosen])), role: 'restore' }) : null,
      chosen.length ? h(ConfirmButton, { label: 'Delete permanently', confirmText: `Delete ${chosen.length} ${word(chosen.length)} permanently?`, run: done(() => onPurge([...chosen])), role: 'purge', className: 'text-destructive' }) : null,
      h(ConfirmButton, { label: 'Empty Trash', confirmText: `Delete all ${totalCount ?? items.length} ${word(totalCount ?? items.length)} permanently?`, run: done(() => onEmptyTrash()), role: 'empty', className: 'text-destructive' })),
    h('ul', { className: 'flex flex-col divide-y rounded border', 'data-role': 'items' },
      items.map((item) => {
        const id = String(item[idField]);
        const left = daysLeft(item[trashField], retentionDays, now);
        return h('li', { key: id, 'data-id': id, className: 'flex items-center gap-3 px-3 py-2', style: tap ? { minHeight: tap.minHeight } : undefined },
          h('input', {
            type: 'checkbox', 'aria-label': `Select ${String(item[labelField] ?? id)}`, 'data-role': 'select-row', className: 'h-4 w-4', style: tap ? { width: 24, height: 24 } : undefined,
            checked: chosen.includes(id),
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSelected((s) => (e.target.checked ? [...s, id] : s.filter((x) => x !== id))),
          }),
          h('span', { className: 'flex-1 truncate' }, String(item[labelField] ?? id)),
          left !== undefined ? h('span', { 'data-role': 'days-left', className: 'text-xs text-muted-foreground' }, `${left} ${left === 1 ? 'day' : 'days'} left`) : null);
      })));
}
