/**
 * Selection and bulk actions (i2mint/zodal-ui-shadcn#39): the checkbox column, the "All N
 * matching" banner, shift-click ranges, long-press select mode on touch, and the ActionBar.
 *
 * Presentational and structural (no `@zodal/core` runtime import): the host owns the
 * `Selection` (`selectRange`, `selectMatching`, `resolveSelectionIds` in core/store) and passes
 * counts and handlers. Every press uses the feedback principle (`usePress`).
 */

import React from 'react';
import { ConfirmButton, PressButton, useTap } from './confirm-button.js';

const h = React.createElement;

/** The default long-press time (ms) that enters select mode on touch. */
export const LONG_PRESS_MS = 450;

/** Ids from `anchor` to `id` inclusive, in the order shown (a shift-click range). Unknown ends: just `id`. */
export function shiftRangeIds(shown: readonly string[], anchor: string | undefined, id: string): string[] {
  const a = anchor === undefined ? -1 : shown.indexOf(anchor);
  const b = shown.indexOf(id);
  if (b === -1) return [];
  if (a === -1) return [id];
  const [from, to] = a <= b ? [a, b] : [b, a];
  return shown.slice(from, to + 1);
}

/** The header checkbox's state: none, some (indeterminate) or all of the shown rows selected. */
export function headerCheckState(selectedShown: number, shown: number): 'none' | 'some' | 'all' {
  if (shown === 0 || selectedShown === 0) return 'none';
  return selectedShown >= shown ? 'all' : 'some';
}

export interface SelectAllCheckboxProps {
  selectedShown: number;
  shown: number;
  /** Called with the new checked state: all shown selected (`true`) or cleared (`false`). */
  onChange: (checked: boolean) => void;
  label?: string;
}

/** The header checkbox: indeterminate while some of the shown rows are selected. */
export function SelectAllCheckbox({ selectedShown, shown, onChange, label = 'Select all' }: SelectAllCheckboxProps) {
  const state = headerCheckState(selectedShown, shown);
  const ref = React.useRef<HTMLInputElement>(null);
  const tap = useTap();
  React.useEffect(() => { if (ref.current) ref.current.indeterminate = state === 'some'; }, [state]);
  return h('input', {
    ref, type: 'checkbox', 'aria-label': label, 'data-role': 'select-all', 'data-state': state,
    checked: state === 'all', className: 'h-4 w-4', style: tap ? { width: 24, height: 24 } : undefined,
    onChange: () => onChange(state !== 'all'),
  });
}

export interface RowCheckboxProps {
  id: string;
  checked: boolean;
  /** `range` is true for a shift-click: select from the anchor (use {@link shiftRangeIds}). */
  onChange: (id: string, checked: boolean, opts: { range: boolean }) => void;
  label?: string;
}

/** A row's checkbox; a shift-click reports `range: true`. */
export function RowCheckbox({ id, checked, onChange, label = 'Select' }: RowCheckboxProps) {
  const tap = useTap();
  return h('input', {
    type: 'checkbox', 'aria-label': label, 'data-role': 'select-row', checked, className: 'h-4 w-4', style: tap ? { width: 24, height: 24 } : undefined,
    onChange: () => undefined, // controlled: the click handler decides, since it knows shiftKey
    onClick: (e: React.MouseEvent) => onChange(id, !checked, { range: e.shiftKey }),
  });
}

/** How far (px) a finger may drift before a long press is taken for a scroll or drag. */
export const LONG_PRESS_SLOP_PX = 10;

/**
 * Long-press on touch (`pointerType` touch) enters select mode; spread the props on a row. The
 * click that follows a fired long press is swallowed (`onClickCapture`), so the row does not
 * also open. A drift past {@link LONG_PRESS_SLOP_PX} cancels (a scroll), finger jitter does not.
 */
export function useLongPress(onLongPress: () => void, ms: number = LONG_PRESS_MS) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const origin = React.useRef<{ x: number; y: number } | null>(null);
  const fired = React.useRef(false);
  const latest = React.useRef(onLongPress);
  latest.current = onLongPress;
  const clear = () => { if (timer.current !== undefined) { clearTimeout(timer.current); timer.current = undefined; } origin.current = null; };
  React.useEffect(() => clear, []);
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      clear();
      fired.current = false;
      origin.current = { x: e.clientX ?? 0, y: e.clientY ?? 0 };
      timer.current = setTimeout(() => { timer.current = undefined; fired.current = true; latest.current(); }, ms);
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerMove: (e: React.PointerEvent) => {
      const o = origin.current;
      if (o && Math.hypot((e.clientX ?? 0) - o.x, (e.clientY ?? 0) - o.y) > LONG_PRESS_SLOP_PX) clear();
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) { fired.current = false; e.stopPropagation(); e.preventDefault(); }
    },
  };
}

export interface SelectionBannerProps {
  /** Selected rows among those shown. */
  selectedShown: number;
  /** Rows shown (this page). */
  shown: number;
  /** Everything the current query matches. */
  totalMatching: number;
  /** The selection is "all matching" (a `Selection` of kind query). */
  allMatching?: boolean;
  /** Make the selection "all N matching". */
  onSelectAllMatching: () => unknown;
  onClear: () => unknown;
  /** The matching count has changed since the user chose (`countChanged`): say so. */
  countChanged?: boolean;
  noun?: { one: string; many: string };
}

/** The banner's sentence. */
export function selectionBannerText(p: Pick<SelectionBannerProps, 'selectedShown' | 'shown' | 'totalMatching' | 'allMatching' | 'noun'>): string {
  const n = p.noun ?? { one: 'item', many: 'items' };
  const word = (c: number) => (c === 1 ? n.one : n.many);
  if (p.allMatching) return `All ${p.totalMatching} ${word(p.totalMatching)} matching selected.`;
  return `${p.selectedShown} ${word(p.selectedShown)} selected.`;
}

function BannerButton({ label, run, role }: { label: string; run: () => unknown; role: string }) {
  return h(PressButton, { label, run, role, className: 'border-0 underline' });
}

/**
 * "20 selected. Select all 340 matching" / "All 340 matching selected. Clear". Shown only when
 * something is selected; the offer to widen appears when every shown row is selected and more match.
 */
export function SelectionBanner(p: SelectionBannerProps) {
  if (p.selectedShown === 0 && !p.allMatching) return null;
  const offer = !p.allMatching && p.selectedShown >= p.shown && p.totalMatching > p.shown;
  return h('div', { role: 'status', 'aria-live': 'polite', 'data-zodal-selection-banner': '', className: 'flex flex-wrap items-center gap-2 rounded bg-muted px-3 py-2 text-sm' },
    h('span', { 'data-role': 'text' }, selectionBannerText(p)),
    p.countChanged ? h('span', { 'data-role': 'count-changed', className: 'text-amber-800' }, 'The number of matches has changed.') : null,
    offer ? h(BannerButton, { label: `Select all ${p.totalMatching} matching`, run: p.onSelectAllMatching, role: 'select-all-matching' }) : null,
    h(BannerButton, { label: 'Clear', run: p.onClear, role: 'clear' }));
}

/** A bulk action offered on the selection. */
export interface BulkAction {
  name: string;
  label: string;
  variant?: 'default' | 'destructive';
  /** How many of the selected items the action applies to. Default: all of them. */
  eligible?: number;
  /** The past participle for the refusal line ("added"). Default: the label in lower case. */
  past?: string;
  /** Why the others are refused, shown before the click ("no file"). */
  refusedReason?: string;
  /** Ask first (with the count). Leave off when one Undo takes the whole operation back. */
  confirm?: boolean;
}

export interface ActionBarProps {
  /** Selected count (what "N selected" says). */
  count: number;
  actions: readonly BulkAction[];
  /** Run an action on the selection; return its promise (the button is pending until it settles). */
  onAction: (action: BulkAction) => unknown;
  /** Words for the confirmation. */
  noun?: { one: string; many: string };
}

/** The refusal line: "3 of 12 can't be added: no file", or `null` when none are refused. */
export function refusalText(a: BulkAction, count: number): string | null {
  const eligible = a.eligible ?? count;
  if (eligible >= count) return null;
  const refused = count - eligible;
  return `${refused} of ${count} can't be ${a.past ?? a.label.toLowerCase()}${a.refusedReason ? `: ${a.refusedReason}` : ''}`;
}

function BulkButton({ action, count, onAction, noun }: { action: BulkAction; count: number; onAction: ActionBarProps['onAction']; noun: { one: string; many: string } }) {
  const eligible = action.eligible ?? count;
  const refusal = refusalText(action, count);
  const refusalId = `refusal-${action.name}`;
  return h('span', { className: 'inline-flex flex-col', 'data-action': action.name },
    h(ConfirmButton, {
      label: action.label, role: 'action', run: () => onAction(action), disabled: eligible === 0,
      confirmText: action.confirm ? `${action.label} ${eligible} ${eligible === 1 ? noun.one : noun.many}?` : undefined,
      className: action.variant === 'destructive' ? 'text-destructive' : '', describedBy: refusal ? refusalId : undefined,
    }),
    refusal ? h('span', { id: refusalId, 'data-role': 'refusal', className: 'text-xs text-muted-foreground' }, refusal) : null);
}

/** The bar that appears while something is selected: the count and the bulk actions. */
export function ActionBar({ count, actions, onAction, noun = { one: 'item', many: 'items' } }: ActionBarProps) {
  if (count === 0) return null;
  return h('div', { role: 'toolbar', 'aria-label': 'Actions on the selection', 'data-zodal-action-bar': '', className: 'flex flex-wrap items-start gap-2 rounded border bg-background px-3 py-2' },
    h('span', { 'data-role': 'count', className: 'self-center text-sm font-medium' }, `${count} selected`),
    actions.map((a) => h(BulkButton, { key: a.name, action: a, count, onAction, noun })));
}
