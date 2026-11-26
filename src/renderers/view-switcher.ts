/**
 * `ViewSwitcher` (i2mint/zodal-ui-shadcn#39): system and saved views, the Modified badge, and
 * Save / Save as / Revert.
 *
 * The presentation is picked by a rule unless set (`presentation`): **chips** for up to
 * {@link CHIPS_MAX} views switched often (they scroll sideways on a phone), a **menu** with the
 * pinned views first from there to {@link MENU_MAX}, a **list** (sidebar) beyond that or when
 * views nest. Structural props only (the shape of `View` in `@zodal/core`), so it builds against
 * any `@zodal/core`.
 */

import React from 'react';
import { usePress, PressIndicator, PRESS_CLASS } from '../press.js';
import { PressButton, useTap } from './confirm-button.js';

const h = React.createElement;

/** A view as the switcher draws it (the `View` fields it needs). */
export interface SwitcherView {
  id: string;
  name: string;
  /** `'system'` views (All, Trash) cannot be deleted. */
  scope?: 'system' | 'personal' | 'shared';
  pinned?: boolean;
  /** The parent view's id, for nested views. */
  parentId?: string;
}

export type ViewPresentation = 'chips' | 'menu' | 'list';

/** Up to this many views: chips. */
export const CHIPS_MAX = 5;
/** Up to this many views: a menu; beyond, a list. */
export const MENU_MAX = 15;

/** The presentation rule: chips (≤ 5), menu (6 to 15), list (more, or nested views). */
export function pickPresentation(views: readonly SwitcherView[]): ViewPresentation {
  if (views.some((v) => v.parentId)) return 'list';
  if (views.length <= CHIPS_MAX) return 'chips';
  return views.length <= MENU_MAX ? 'menu' : 'list';
}

export interface ViewSwitcherProps {
  views: readonly SwitcherView[];
  /** The id of the view in use. */
  activeId: string;
  /** The user has changed the view's query/ordering since it was saved (the Modified badge). */
  modified?: boolean;
  onSelect: (id: string) => unknown;
  /** Save changes into the active view. Offered only when `modified` and the view is not a system view. */
  onSave?: () => unknown;
  /** Save the current state as a new view. Offered when `modified`. */
  onSaveAs?: () => unknown;
  /** Drop the changes. Offered when `modified`. */
  onRevert?: () => unknown;
  /** Default: {@link pickPresentation}. */
  presentation?: ViewPresentation;
  /** Accessible name. Default `'Views'`. */
  label?: string;
}

const BASE = 'min-h-9 rounded-full border px-3 text-sm whitespace-nowrap ';
const ACTIVE = 'bg-primary text-primary-foreground border-primary';
const IDLE = 'bg-background hover:bg-muted';

function ViewButton({ view, active, onSelect, className, depth }: { view: SwitcherView; active: boolean; onSelect: ViewSwitcherProps['onSelect']; className?: string; depth?: number }) {
  const { props, state } = usePress(() => onSelect(view.id));
  return h('button', {
    ...props,
    type: 'button',
    'aria-current': active ? 'true' : undefined,
    'data-view-id': view.id,
    'data-depth': depth,
    style: { ...useTap(), ...(depth ? { marginLeft: `${depth}rem` } : {}) },
    className: `${PRESS_CLASS} ${className ?? BASE + (active ? ACTIVE : IDLE)}`,
  }, view.name, h(PressIndicator, { show: state.indicator }));
}

/** Pinned first, then the rest in the given order. */
const pinnedFirst = (views: readonly SwitcherView[]) => [...views.filter((v) => v.pinned), ...views.filter((v) => !v.pinned)];

export function ViewSwitcher(props: ViewSwitcherProps) {
  const { views, activeId, modified, onSelect, onSave, onSaveAs, onRevert, label = 'Views' } = props;
  const presentation = props.presentation ?? pickPresentation(views);
  const active = views.find((v) => v.id === activeId);

  let body: React.ReactNode;
  if (presentation === 'chips') {
    body = h('div', { role: 'group', 'aria-label': label, className: 'flex gap-2 overflow-x-auto [scrollbar-width:none]', 'data-role': 'chips' },
      views.map((v) => h(ViewButton, { key: v.id, view: v, active: v.id === activeId, onSelect })));
  } else if (presentation === 'menu') {
    // A native select: a sheet on a phone, a menu on a desktop, with no code of ours to get wrong.
    const pinned = views.filter((v) => v.pinned);
    const rest = views.filter((v) => !v.pinned);
    const opt = (v: SwitcherView) => h('option', { key: v.id, value: v.id }, v.name);
    body = h('select', {
      'aria-label': label, 'data-role': 'menu', value: activeId,
      className: 'min-h-9 text-base rounded border bg-background px-2 text-sm',
      onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void onSelect(e.target.value),
    }, pinned.length ? [h('optgroup', { key: 'pinned', label: 'Pinned' }, pinned.map(opt)), h('optgroup', { key: 'all', label: 'All views' }, rest.map(opt))] : views.map(opt));
  } else {
    const depth = (v: SwitcherView): number => {
      let d = 0;
      for (let p = v; p.parentId && d < 10; d++) { const next = views.find((x) => x.id === p.parentId); if (!next) break; p = next; }
      return d;
    };
    body = h('div', { role: 'group', 'aria-label': label, className: 'flex flex-col', 'data-role': 'list' },
      pinnedFirst(views).map((v) => h(ViewButton, {
        key: v.id, view: v, active: v.id === activeId, onSelect, depth: depth(v),
        className: `${PRESS_CLASS} min-h-9 rounded px-3 text-left text-sm ${v.id === activeId ? 'bg-muted font-medium' : 'hover:bg-muted'}`,
      })));
  }

  const canSave = modified && onSave && active?.scope !== 'system';
  return h('div', { 'data-zodal-view-switcher': '', 'data-presentation': presentation, className: 'flex flex-wrap items-center gap-2' },
    body,
    modified ? h('span', { 'data-role': 'modified', className: 'rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900' }, 'Modified') : null,
    canSave ? h(PressButton, { label: 'Save', run: onSave!, role: 'save' }) : null,
    modified && onSaveAs ? h(PressButton, { label: 'Save as…', run: onSaveAs, role: 'save-as' }) : null,
    modified && onRevert ? h(PressButton, { label: 'Revert', run: onRevert, role: 'revert' }) : null);
}
