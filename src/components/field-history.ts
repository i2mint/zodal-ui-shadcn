/**
 * Field input history: a button beside a text field that lists the field's past values and puts
 * one back.
 *
 * - {@link useFieldHistory}`(history, scope)`: a history scope's entries, kept current, and its
 *   operations (record, remove, pin, clear, restore).
 * - {@link HistoryButton}: a ghost icon button (lucide's `rotate-ccw-clock`), hidden while the
 *   history is empty, with press feedback from `usePress`.
 * - {@link HistoryList}: a native `popover="auto"` (light dismiss and Escape for free) holding a
 *   grid of entries (first line, "+N lines", a relative time, pin and remove buttons), a filter
 *   above {@link HISTORY_FILTER_THRESHOLD} entries, a full-value preview, and "Clear history"
 *   with Undo.
 * - {@link FieldHistory}: the three wired to a field: picking an entry records the current value
 *   (reason `'pick'`), replaces the value, closes the list and returns focus to the field;
 *   Alt+ArrowDown on the field opens the list. The package's text and textarea renderers attach
 *   it when `context.history` and `config.history` are both set; an app attaches it to its own.
 *
 * Plain HTML through React, no new dependency. Design: i2mint/zodal
 * `docs/research/field-input-history.md` §4 and §6.4.
 */

import React from 'react';
import { usePress, PRESS_CLASS } from '../press.js';
import type { FieldHistoryStore, HistoryEntry, HistoryReason } from '../history-types.js';

const h = React.createElement;

/** Above this many entries the list shows a filter (APG recommends type-ahead above 7). */
export const HISTORY_FILTER_THRESHOLD = 7;
/** How long "History cleared. Undo" stays offered, in ms. */
export const HISTORY_UNDO_MS = 10_000;
/** The smallest touch target under a coarse pointer, in CSS px (WCAG 2.5.5 enhanced). */
export const HISTORY_TOUCH_TARGET_PX = 44;
/** The query that marks a coarse (touch) pointer. */
const COARSE_POINTER = '(pointer: coarse)';

// ============================================================================
// Display helpers
// ============================================================================

/**
 * How a value reads in one row: its first non-empty line, and how many more lines it has
 * (`extraLines`, 0 for a one-line value).
 */
export function historyLine(value: string): { first: string; extraLines: number } {
  const lines = value.split(/\r\n|\r|\n/);
  const first = lines.find((l) => l.trim() !== '') ?? '';
  return { first: first.trim(), extraLines: lines.length - 1 };
}

/** A compact relative time: "just now", "5 min ago", "2 h ago", "3 d ago", else the date. */
export function relativeTime(at: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(at).toLocaleDateString();
}

/** Is the pointer coarse (a finger)? Tracks changes; false where `matchMedia` is unavailable. */
function useCoarsePointer(): boolean {
  const query = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(COARSE_POINTER) : null);
  const [coarse, setCoarse] = React.useState(() => query()?.matches ?? false);
  React.useEffect(() => {
    const mq = query();
    if (!mq) return;
    const onChange = () => setCoarse(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return coarse;
}

/** The inline size that makes a control a 44 px target under a coarse pointer (nothing otherwise). */
function touchTarget(coarse: boolean): React.CSSProperties | undefined {
  return coarse ? { minWidth: HISTORY_TOUCH_TARGET_PX, minHeight: HISTORY_TOUCH_TARGET_PX } : undefined;
}

// ============================================================================
// useFieldHistory
// ============================================================================

/** What {@link useFieldHistory} returns: one scope's entries, kept current, and its operations. */
export interface FieldHistoryState {
  /** Pinned first, then most recent first. Empty while there is no store or scope. */
  entries: HistoryEntry[];
  /** True until the first list has arrived. */
  loading: boolean;
  /** The last list or write failure, cleared by the next success. */
  error: unknown;
  /** Read the scope again (writes made through this hook, or announced by the store's `subscribe`, refresh on their own). */
  refresh(): Promise<void>;
  /** Remember a value in this scope (with the field's cap). */
  record(value: string, reason?: HistoryReason): Promise<void>;
  remove(entry: HistoryEntry): Promise<void>;
  pin(entry: HistoryEntry, pinned?: boolean): Promise<void>;
  /** Forget this scope; resolves with what was removed, for {@link FieldHistoryState.restore}. */
  clear(): Promise<HistoryEntry[]>;
  restore(entries: readonly HistoryEntry[]): Promise<void>;
}

/**
 * One history scope for a field: its entries, kept current, and its operations.
 *
 * `history` is the app's store (`createFieldHistory()` from `@zodal/store`, usually from the
 * render context), `scope` the field's `config.history.scope`. Either may be undefined (no store,
 * no history on this field): the entries are then empty and the operations do nothing. The list
 * is read on mount, after every write made through the hook, and whenever the store's optional
 * `subscribe` announces a change to this scope (a `recordUse` on submit, a `startNewItem`).
 *
 * @example
 * ```tsx
 * const lyrics = useFieldHistory(context.history, config.history?.scope, { max: config.history?.max });
 * lyrics.entries.length; // 0: the history button stays hidden
 * ```
 */
export function useFieldHistory(
  history: FieldHistoryStore | undefined,
  scope: string | undefined,
  options: { max?: number } = {},
): FieldHistoryState {
  const { max } = options;
  const [entries, setEntries] = React.useState<HistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(Boolean(history && scope));
  const [error, setError] = React.useState<unknown>(undefined);
  // Only the latest list may land: an older, slower one must not overwrite it.
  const request = React.useRef(0);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => void (mounted.current = false);
  }, []);

  const refresh = React.useCallback(async () => {
    const id = ++request.current;
    if (!history || !scope) {
      setEntries([]);
      setLoading(false);
      return;
    }
    try {
      const list = await history.list(scope);
      if (mounted.current && id === request.current) {
        setEntries(list);
        setError(undefined);
      }
    } catch (err) {
      if (mounted.current && id === request.current) setError(err);
    } finally {
      if (mounted.current && id === request.current) setLoading(false);
    }
  }, [history, scope]);

  React.useEffect(() => {
    void refresh();
    const unsubscribe = history?.subscribe?.((changed) => {
      if (changed === undefined || changed === scope) void refresh();
    });
    return () => unsubscribe?.();
  }, [history, scope, refresh]);

  /** Run a write, then read the scope again; a failure is kept in `error` and rethrown. */
  const write = React.useCallback(
    async <R>(job: (store: FieldHistoryStore, scope: string) => Promise<R>, fallback: R): Promise<R> => {
      if (!history || !scope) return fallback;
      try {
        const result = await job(history, scope);
        await refresh();
        return result;
      } catch (err) {
        if (mounted.current) setError(err);
        throw err;
      }
    },
    [history, scope, refresh],
  );

  return {
    entries,
    loading,
    error,
    refresh,
    record: (value, reason = 'pick') => write((s, sc) => s.record(sc, value, { reason, ...(max !== undefined ? { max } : {}) }), undefined),
    remove: (entry) => write((s) => s.remove(entry.id), undefined),
    pin: (entry, pinned = true) => write((s) => s.pin(entry.id, pinned), undefined),
    clear: () => write((s, sc) => s.clear(sc), [] as HistoryEntry[]),
    restore: (removed) => write((s) => s.restore(removed), undefined),
  };
}

// ============================================================================
// The icon (lucide rotate-ccw-clock)
// ============================================================================

/**
 * lucide's `rotate-ccw-clock` (the history glyph; lucide's `history` is its deprecated alias),
 * drawn inline. Its path data is from lucide (https://lucide.dev), under the ISC License:
 *
 * ISC License. Copyright (c) 2026 Lucide Icons and Contributors.
 *
 * Permission to use, copy, modify, and/or distribute this software for any purpose with or without
 * fee is hereby granted, provided that the above copyright notice and this permission notice
 * appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS
 * SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE
 * AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,
 * NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */
export function HistoryIcon({ size = 16 }: { size?: number }) {
  return h('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: 'false',
    'data-icon': 'rotate-ccw-clock',
  },
    h('path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }),
    h('path', { d: 'M3 3v5h5' }),
    h('path', { d: 'M12 7v5l4 2' }),
  );
}

// ============================================================================
// HistoryButton
// ============================================================================

export interface HistoryButtonProps {
  /** The field's label: the button is named "<label> history". */
  label: string;
  /** How many entries the history has: the button is hidden (not disabled) at 0. */
  count: number;
  /** Is the list open (`aria-expanded`)? */
  expanded: boolean;
  /** The list's id (`aria-controls`). */
  controls?: string;
  /** Open or close the list. */
  onToggle: () => void;
  className?: string;
  /** For anchoring the list to the button. */
  buttonRef?: React.Ref<HTMLButtonElement>;
}

/**
 * The history button: a ghost icon button, hidden while the history is empty so a first-run form
 * is not cluttered with buttons that do nothing. 44 px under a coarse pointer.
 */
export function HistoryButton({ label, count, expanded, controls, onToggle, className, buttonRef }: HistoryButtonProps) {
  const { props } = usePress(onToggle);
  const coarse = useCoarsePointer();
  if (count <= 0) return null;
  return h('button', {
    ...props,
    ref: buttonRef,
    type: 'button',
    'aria-label': `${label} history`,
    title: `${label} history (Alt+ArrowDown)`,
    'aria-haspopup': 'grid',
    'aria-expanded': expanded,
    'aria-controls': controls,
    'data-role': 'history-button',
    className: `${PRESS_CLASS} inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ''}`.trim(),
    style: touchTarget(coarse),
  }, h(HistoryIcon));
}

// ============================================================================
// HistoryList
// ============================================================================

export interface HistoryListProps {
  /** The popover's id (the button's `aria-controls`). */
  id: string;
  /** The field's label: the list is named "<label> history". */
  label: string;
  /** Pinned first, then most recent (as `useFieldHistory` gives them). */
  entries: readonly HistoryEntry[];
  /** Put this entry's value in the field. */
  onPick: (entry: HistoryEntry) => void;
  onRemove: (entry: HistoryEntry) => void;
  onPin: (entry: HistoryEntry, pinned: boolean) => void;
  /** Forget the whole history; resolves with what was removed, so Undo can put it back. */
  onClear: () => Promise<readonly HistoryEntry[]>;
  onRestore: (entries: readonly HistoryEntry[]) => void;
  /** The list closes itself: on Escape (`'escape'`: focus goes back to the field) or a click elsewhere (`'dismiss'`: focus stays where it went). */
  onClose: (reason: 'escape' | 'dismiss') => void;
  /** Placed under this element on wide screens; a bottom sheet on narrow ones. */
  anchor?: HTMLElement | null;
  /** The clock for relative times. Default: `Date.now`. */
  now?: () => number;
}

/** Below this width the list is a bottom sheet instead of a popover under the button. */
const NARROW_QUERY = '(max-width: 640px)';

/** Position a popover under `anchor`, right-aligned to it, kept on screen; a bottom sheet when narrow. */
function place(popover: HTMLElement, anchor: HTMLElement | null | undefined): void {
  const narrow = typeof window.matchMedia === 'function' && window.matchMedia(NARROW_QUERY).matches;
  const s = popover.style;
  s.margin = '0';
  s.position = 'fixed';
  if (narrow || !anchor) {
    Object.assign(s, { left: '0', right: '0', bottom: '0', top: 'auto', width: '100%', maxHeight: '70vh' });
    popover.dataset.sheet = '';
    return;
  }
  delete popover.dataset.sheet;
  const r = anchor.getBoundingClientRect();
  const width = Math.min(window.innerWidth - 16, Math.max(280, popover.offsetWidth || 320));
  const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
  Object.assign(s, { top: `${r.bottom + 4}px`, left: `${left}px`, right: 'auto', bottom: 'auto', width: `${width}px`, maxHeight: '60vh' });
}

/**
 * The list of a field's past values, in a native `popover="auto"`: light dismiss and Escape come
 * from the browser (where `popover` is missing, it is shown in place and Escape is handled here).
 * A grid (APG's "combobox with grid popup"): one row per entry, its value cell picks, its action
 * cell pins and removes. Keyboard: ArrowUp/ArrowDown move, Home/End jump, Enter picks,
 * Shift+Delete removes, Escape closes; with a filter, typing filters.
 */
export function HistoryList(props: HistoryListProps) {
  const { id, label, entries, onPick, onRemove, onPin, onClear, onRestore, onClose, anchor, now = Date.now } = props;
  const ref = React.useRef<HTMLDivElement>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const filterRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const [cleared, setCleared] = React.useState<readonly HistoryEntry[] | null>(null);
  const coarse = useCoarsePointer();
  const latest = React.useRef({ onClose, anchor });
  latest.current = { onClose, anchor };

  const showFilter = entries.length > HISTORY_FILTER_THRESHOLD;
  const needle = query.trim().toLowerCase();
  const shown = needle ? entries.filter((e) => e.value.toLowerCase().includes(needle)) : entries;
  const activeIndex = Math.min(active, Math.max(0, shown.length - 1));
  const activeEntry = shown[activeIndex];
  const rowId = (entry: HistoryEntry) => `${id}-row-${entry.id}`;

  // Open as a popover, placed (once: the anchor may leave, as the button does when a clear
  // empties the history), and focused (the filter, else the grid); a light dismiss closes it.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof el.showPopover === 'function') {
      try { el.showPopover(); } catch { /* already open */ }
    }
    place(el, latest.current.anchor);
    (filterRef.current ?? gridRef.current)?.focus();
    const onToggle = (e: Event) => {
      if ((e as Event & { newState?: string }).newState === 'closed') latest.current.onClose('dismiss');
    };
    el.addEventListener('toggle', onToggle);
    return () => {
      el.removeEventListener('toggle', onToggle);
      if (typeof el.hidePopover === 'function') {
        try { el.hidePopover(); } catch { /* already closed */ }
      }
    };
  }, []);

  // Undo is offered for HISTORY_UNDO_MS after a clear.
  React.useEffect(() => {
    if (!cleared) return;
    const t = setTimeout(() => setCleared(null), HISTORY_UNDO_MS);
    return () => clearTimeout(t);
  }, [cleared]);

  // Keep the active row in view.
  React.useEffect(() => {
    if (activeEntry) document.getElementById(rowId(activeEntry))?.scrollIntoView?.({ block: 'nearest' });
  }, [activeEntry?.id]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = shown.length - 1;
    switch (e.key) {
      case 'ArrowDown': setActive(Math.min(last, activeIndex + 1)); break;
      case 'ArrowUp': setActive(Math.max(0, activeIndex - 1)); break;
      case 'Home': if (e.target !== filterRef.current) setActive(0); else return; break;
      case 'End': if (e.target !== filterRef.current) setActive(Math.max(0, last)); else return; break;
      case 'Enter': if (activeEntry) onPick(activeEntry); break;
      case 'Delete': if (e.shiftKey && activeEntry) onRemove(activeEntry); else return; break;
      case 'Escape': onClose('escape'); break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const clearAll = async () => {
    const removed = await onClear();
    if (removed.length) setCleared(removed);
  };

  const row = (entry: HistoryEntry, index: number) => {
    const { first, extraLines } = historyLine(entry.value);
    const isActive = index === activeIndex;
    return h('div', {
      key: entry.id,
      id: rowId(entry),
      role: 'row',
      'aria-selected': isActive,
      'data-role': 'history-row',
      'data-active': isActive ? '' : undefined,
      'data-pinned': entry.pinned ? '' : undefined,
      className: `flex items-center gap-1 rounded px-1 ${isActive ? 'bg-accent text-accent-foreground' : ''}`,
      onMouseEnter: () => setActive(index),
    },
      h('div', { role: 'gridcell', className: 'min-w-0 flex-1' },
        h(RowButton, {
          onPress: () => onPick(entry),
          className: 'flex w-full min-w-0 items-baseline gap-2 py-1.5 text-left',
          'data-role': 'history-pick',
          tabIndex: -1,
          style: touchTarget(coarse),
        },
          h('span', { className: 'truncate' }, first),
          extraLines > 0 && h('span', { className: 'shrink-0 text-xs text-muted-foreground' }, `+${extraLines} ${extraLines === 1 ? 'line' : 'lines'}`),
          h('span', { className: 'ml-auto shrink-0 text-xs text-muted-foreground' }, relativeTime(entry.at, now())),
        ),
      ),
      h('div', { role: 'gridcell', className: 'flex shrink-0 gap-0.5' },
        h(RowButton, {
          onPress: () => onPin(entry, !entry.pinned),
          'aria-label': entry.pinned ? `Unpin "${first}"` : `Pin "${first}"`,
          'aria-pressed': Boolean(entry.pinned),
          'data-role': 'history-pin',
          tabIndex: -1,
          className: 'rounded p-1 text-xs text-muted-foreground hover:text-foreground',
          style: touchTarget(coarse),
        }, entry.pinned ? 'Unpin' : 'Pin'),
        h(RowButton, {
          onPress: () => onRemove(entry),
          'aria-label': `Remove "${first}" from history`,
          'data-role': 'history-remove',
          tabIndex: -1,
          className: 'rounded p-1 text-xs text-muted-foreground hover:text-destructive',
          style: touchTarget(coarse),
        }, '×'),
      ),
    );
  };

  const pinned = shown.filter((e) => e.pinned);
  const recent = shown.filter((e) => !e.pinned);
  const group = (name: string, list: HistoryEntry[], offset: number) =>
    list.length > 0 && h('div', { role: 'rowgroup', 'aria-label': name, key: name },
      pinned.length > 0 && h('div', { role: 'row', key: `${name}-heading` },
        h('span', { role: 'columnheader', className: 'px-1 pt-1 text-xs font-medium text-muted-foreground' }, name)),
      ...list.map((e, i) => row(e, offset + i)),
    );

  const previewing = activeEntry && (historyLine(activeEntry.value).extraLines > 0 || activeEntry.value.length > 60);

  return h('div', {
    ref,
    id,
    popover: 'auto',
    'aria-label': `${label} history`,
    'data-role': 'history-list',
    className: 'z-50 flex flex-col gap-1 overflow-hidden rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md',
    onKeyDown,
  },
    showFilter && h('input', {
      ref: filterRef,
      type: 'search',
      role: 'combobox',
      'aria-autocomplete': 'list',
      'aria-expanded': true,
      'aria-controls': `${id}-grid`,
      'aria-activedescendant': activeEntry ? rowId(activeEntry) : undefined,
      'aria-label': `Filter ${label} history`,
      placeholder: 'Filter',
      value: query,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setQuery(e.target.value); setActive(0); },
      'data-role': 'history-filter',
      className: 'w-full rounded border px-2 py-1',
      style: coarse ? { minHeight: HISTORY_TOUCH_TARGET_PX, fontSize: 16 } : undefined,
    }),
    h('div', {
      ref: gridRef,
      id: `${id}-grid`,
      role: 'grid',
      'aria-label': `${label} history`,
      'aria-activedescendant': !showFilter && activeEntry ? rowId(activeEntry) : undefined,
      tabIndex: showFilter ? -1 : 0,
      className: 'max-h-72 overflow-y-auto outline-none',
    },
      group('Pinned', pinned, 0),
      group('Recent', recent, pinned.length),
    ),
    shown.length === 0 && !cleared && h('p', { className: 'px-2 py-1.5 text-muted-foreground', 'data-role': 'history-empty' }, needle ? 'No match' : 'No history'),
    previewing && h('pre', {
      'data-role': 'history-preview',
      'aria-label': 'Full value',
      className: 'max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-sans text-xs',
    }, activeEntry!.value),
    h('div', { className: 'flex items-center justify-between gap-2 border-t pt-1' },
      cleared
        ? h(React.Fragment, null,
          h('span', { role: 'status', className: 'px-1 text-xs text-muted-foreground' }, 'History cleared.'),
          h(RowButton, {
            onPress: () => { onRestore(cleared); setCleared(null); },
            'data-role': 'history-undo',
            className: 'rounded px-2 py-1 text-xs font-medium',
            style: touchTarget(coarse),
          }, 'Undo'))
        : entries.length > 0 && h(RowButton, {
          onPress: clearAll,
          'data-role': 'history-clear',
          className: 'ml-auto rounded px-2 py-1 text-xs text-muted-foreground hover:text-destructive',
          style: touchTarget(coarse),
        }, 'Clear history'),
    ),
  );
}

/** A button inside the list, with press feedback (`usePress`); it never takes the list's focus from the keyboard. */
function RowButton({ onPress, children, className, ...rest }: {
  onPress: () => unknown;
  children?: React.ReactNode;
  className?: string;
  [attr: string]: unknown;
}) {
  const { props } = usePress(onPress);
  return h('button', { type: 'button', ...rest, ...props, className: `${PRESS_CLASS} ${className ?? ''}`.trim() }, children);
}

// ============================================================================
// FieldHistory: the button and the list, wired to a field
// ============================================================================

export interface FieldHistoryProps {
  /** The app's history store (`context.history`). Absent: nothing is drawn. */
  history: FieldHistoryStore | undefined;
  /** The field's resolved history settings (`config.history`). Absent: nothing is drawn. */
  config: { scope: string; max?: number } | undefined;
  /** The field's label ("<label> history"). */
  label: string;
  /** The field's current value (recorded before a pick replaces it). */
  value: unknown;
  /** Write a picked value into the field. */
  onChange: (value: string) => void;
  /** The field element: Alt+ArrowDown on it opens the list, and focus returns to it after a pick. */
  fieldRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  className?: string;
}

let nextListId = 0;

/** A click on the button this soon after a light dismiss is the same gesture: it does not reopen. */
const REOPEN_GUARD_MS = 400;

/**
 * The history button and list for one field. Picking an entry records the field's current value
 * (reason `'pick'`, so a pick never loses anything), replaces the value, closes the list and
 * returns focus to the field with the caret at the end. Alt+ArrowDown on the field opens it.
 *
 * @example
 * ```tsx
 * const ref = React.useRef<HTMLTextAreaElement>(null);
 * <textarea ref={ref} value={value} onChange={(e) => setValue(e.target.value)} />
 * <FieldHistory history={context.history} config={config.history} label="Lyrics"
 *   value={value} onChange={setValue} fieldRef={ref} />
 * ```
 */
export function FieldHistory({ history, config, label, value, onChange, fieldRef, className }: FieldHistoryProps) {
  const state = useFieldHistory(history, config?.scope, { max: config?.max });
  const [open, setOpen] = React.useState(false);
  const [listId] = React.useState(() => `zodal-history-${++nextListId}`);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  // A light dismiss closes the list on the pointerdown that precedes the button's click: that
  // click must not open it again.
  const dismissedAt = React.useRef(-Infinity);
  const latest = React.useRef({ count: state.entries.length });
  latest.current = { count: state.entries.length };

  // Alt+ArrowDown on the field opens the list (the APG combobox convention).
  React.useEffect(() => {
    const field: HTMLElement | null = fieldRef.current;
    if (!field) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowDown' && latest.current.count > 0) {
        e.preventDefault();
        setOpen(true);
      }
    };
    field.addEventListener('keydown', onKey);
    return () => field.removeEventListener('keydown', onKey);
  }, [fieldRef]);

  if (!history || !config) return null;

  const close = () => setOpen(false);
  const focusField = () => {
    const field = fieldRef.current;
    if (!field) return;
    field.focus();
    const end = field.value.length;
    try { field.setSelectionRange(end, end); } catch { /* not a text control */ }
  };
  const pick = async (entry: HistoryEntry) => {
    const current = typeof value === 'string' ? value.trim() : '';
    if (current && current !== entry.value) await state.record(current, 'pick');
    await state.record(entry.value, 'pick'); // the picked value moves to the top
    onChange(entry.value);
    setOpen(false);
    // After the field has the new value, so the caret lands at its end.
    setTimeout(focusField, 0);
  };

  return h('span', { className: `inline-flex ${className ?? ''}`.trim(), 'data-role': 'field-history' },
    h(HistoryButton, {
      label,
      count: state.entries.length,
      expanded: open,
      controls: listId,
      onToggle: () => {
        if (!open && performance.now() - dismissedAt.current < REOPEN_GUARD_MS) return;
        setOpen(!open);
      },
      buttonRef,
    }),
    open && h(HistoryList, {
      id: listId,
      label,
      entries: state.entries,
      anchor: buttonRef.current,
      onPick: (entry) => void pick(entry),
      onRemove: (entry) => void state.remove(entry),
      onPin: (entry, pinned) => void state.pin(entry, pinned),
      onClear: () => state.clear(),
      onRestore: (entries) => void state.restore(entries),
      onClose: (reason) => {
        close();
        if (reason === 'escape') focusField();
        else dismissedAt.current = performance.now();
      },
    }),
  );
}
