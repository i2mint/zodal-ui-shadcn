/**
 * Shared bits of the views / selection / trash renderers: the touch-target hook and the
 * ask-then-confirm button.
 *
 * The ask is not a press that runs work, so it stays outside `usePress` (its feedback is the
 * label changing at once); only the confirmed action goes through `usePress`. The Confirm button
 * ignores clicks that arrive right after the ask ({@link ASK_GUARD_MS}), so a double-click cannot
 * ask and confirm in one gesture. Escape cancels.
 */

import React from 'react';
import { usePress, PressIndicator, PRESS_CLASS } from '../press.js';
import { useCoarsePointer, touchTarget } from '../components/field-history.js';

const h = React.createElement;

/** Minimum touch target (CSS px) under a coarse pointer. */
export const TAP_MIN_PX = 44;
/** A Confirm click this soon after the ask is taken for the tail of a double-click and ignored. */
export const ASK_GUARD_MS = 400;

/** Inline style that makes a control a 44 px target under a coarse pointer (nothing otherwise). */
export function useTap(): React.CSSProperties | undefined {
  return touchTarget(useCoarsePointer(), TAP_MIN_PX);
}

/** A button whose press runs `run` through `usePress`. */
export function PressButton({ label, run, role, className = '', describedBy }: { label: string; run: () => unknown; role: string; className?: string; describedBy?: string }) {
  const { props, state } = usePress(run);
  return h('button', { ...props, type: 'button', 'data-role': role, 'aria-describedby': describedBy, style: useTap(), className: `${PRESS_CLASS} min-h-9 rounded border px-3 text-sm hover:bg-muted ${className}` },
    label, h(PressIndicator, { show: state.indicator }));
}

/**
 * A button that asks first, naming the count, when `confirmText` is given. Without it, it just runs.
 * `disabled` leaves it focusable (aria-disabled) and inert, with no press animation.
 */
export function ConfirmButton({ label, confirmText, run, role, className = '', disabled, describedBy, now = Date.now }: {
  label: string; confirmText?: string; run: () => unknown; role: string; className?: string; disabled?: boolean; describedBy?: string; now?: () => number;
}) {
  const [asking, setAsking] = React.useState(false);
  const askedAt = React.useRef(0);
  const tap = useTap();
  const confirmed = () => { if (now() - askedAt.current < ASK_GUARD_MS) return undefined; setAsking(false); return run(); };
  if (disabled) {
    return h('button', { type: 'button', 'aria-disabled': true, 'data-role': role, 'aria-describedby': describedBy, style: tap, className: `min-h-9 rounded border px-3 text-sm opacity-50 ${className}`, onClick: (e: React.MouseEvent) => e.preventDefault() }, label);
  }
  if (!confirmText) return h(PressButton, { label, run, role, className, describedBy });
  if (!asking) {
    return h('button', {
      type: 'button', 'data-role': role, 'aria-describedby': describedBy, style: tap, className: `${PRESS_CLASS} min-h-9 rounded border px-3 text-sm hover:bg-muted ${className}`,
      onClick: () => { askedAt.current = now(); setAsking(true); },
    }, label);
  }
  return h('span', { className: 'inline-flex items-center gap-1', onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Escape') setAsking(false); } },
    h(PressButton, { label: confirmText, run: confirmed, role, className }),
    h('button', { type: 'button', 'data-role': 'cancel', style: tap, className: `${PRESS_CLASS} min-h-9 rounded px-2 text-sm underline`, onClick: () => setAsking(false) }, 'Cancel'));
}
