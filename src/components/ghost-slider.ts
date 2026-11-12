/**
 * GhostSlider: a range slider that, while the person drags, leaves a ghost thumb at the saved
 * value (the value at pointer-down, or an explicit `savedValue`), so they can see how far they
 * moved and where to go back to. The ghost disappears on release.
 *
 * Drawn by a native `<input type="range">`, so a host's range-input styles apply, but the
 * pointer is handled here, not by the browser, because the native touch drag goes wrong on
 * phones: the thumb does not stay under the finger, and a release does not land where the
 * finger was lifted (arioso_studio, 2026-11-12). The rules match {@link GhostRangeSlider}'s:
 * - A press on (or within a finger's width of) the thumb grabs it where it was pressed, and the
 *   thumb then follows the pointer 1:1; a press on the track moves the thumb there (a mouse at
 *   once; a touch on release, or as soon as it drags).
 * - A touch does nothing until it has moved a few pixels sideways, and the area allows vertical
 *   panning (`touch-action: pan-y`), so a scroll that starts on the slider scrolls and changes
 *   nothing (the browser cancels the pointer; a cancel reverts the preview).
 * - One pointer at a time; the interactive area is 44px tall whatever the drawn thumb size.
 * - Keys (and assistive technology) still go through the native input: one commit per press.
 *
 * The one trap: a range input does not put the thumb's centre at `value%`. It keeps the thumb
 * inside the track, insetting it by up to half its width at each end (Radix does the same, its
 * `getThumbInBoundsOffset`), so the ghost is placed by {@link thumbLeft}, pointers are mapped
 * back by the inverse, and `thumbSize` must match the thumb's rendered width. The offset is
 * applied as `inset-inline-start`, so under `dir="rtl"`, where the browser mirrors the input,
 * the ghost mirrors with it.
 *
 * The ghost is a light ring with a dark outline, so it shows on the filled part of the track as
 * well as on the empty part; restyle it with `--zodal-slider-ghost-ring`,
 * `--zodal-slider-ghost-outline` and `--zodal-slider-ghost-fill`.
 *
 * Scope: single value, horizontal, controlled (`value`), either writing direction. Not handled
 * yet: vertical, uncontrolled use.
 */

import React from 'react';

const h = React.createElement;

/** Default thumb width in px: Chromium's and Firefox's default range thumb, and shadcn's `size-4`. */
export const DEFAULT_THUMB_SIZE_PX = 16;

/**
 * Where a thumb's centre sits for `percent` (0 to 100) along a horizontal track, measured from
 * the track's start edge (a CSS `left` in LTR, `inset-inline-start` in either direction): the
 * thumb is inset by half its width at 0 and at 100.
 */
export function thumbLeft(percent: number, thumbSizePx: number = DEFAULT_THUMB_SIZE_PX): string {
  const half = thumbSizePx / 2;
  return `calc(${percent}% + ${half - (percent / 50) * half}px)`;
}

/** Where `value` sits between `min` and `max`, in percent (0 for a degenerate range). */
export function valuePercent(value: number, min: number, max: number): number {
  const span = max - min || 1;
  return Math.min(100, Math.max(0, ((value - min) / span) * 100));
}

export interface GhostSliderProps {
  /** The current value (controlled). */
  value: number;
  /** Called on every move (drag or key). */
  onValueChange?: (value: number) => void;
  /** Called once when a change is done: on release after a drag, and per key press. */
  onValueCommit?: (value: number) => void;
  /**
   * Called once at the end of every pointer gesture, after `onValueCommit` if there was one;
   * `committed` is false when the gesture ended where it started or was cancelled (a cancel first
   * reverts the preview through `onValueChange`). A host holding a preview clears it here.
   */
  onDragEnd?: (committed: boolean) => void;
  /** Lower bound. Default 0. */
  min?: number;
  /** Upper bound. Default 100. */
  max?: number;
  /** Step. Default 1. */
  step?: number;
  /** Where the ghost sits while dragging. Default: the value at pointer-down. */
  savedValue?: number;
  /** The thumb's rendered width in px, to place the ghost exactly. Default 16. */
  thumbSize?: number;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/** Minimum height of the interactive area: tw-frontend-ux §8. */
export const SLIDER_TOUCH_TARGET_PX = 44;
/** A touch must move this many px sideways before it drags (below it, it may be a scroll or a tap). */
export const SLIDER_TOUCH_SLOP_PX = 6;
/** A touch this close to the thumb's centre grabs the thumb (half the touch target). */
const TOUCH_GRAB_PX = SLIDER_TOUCH_TARGET_PX / 2;

/** How many decimals a number is written with (`0.01` → 2, `1e-7` → 7, `2.5e-3` → 4). */
function decimalsOf(n: number): number {
  const [mantissa, exp] = String(n).split('e');
  const places = (mantissa.split('.')[1] ?? '').length - Number(exp ?? 0);
  return Math.max(0, places);
}

/** `value` snapped to `min + k * step` and kept in `[min, max]`, without float noise. */
export function snapToStep(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  if (!(step > 0)) return clamped;
  const digits = Math.max(decimalsOf(step), decimalsOf(min));
  const snapped = min + Math.round((clamped - min) / step) * step;
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(Math.min(digits + 2, 20)));
}

interface Drag {
  pointerId: number;
  touch: boolean;
  startX: number;
  onThumb: boolean;
  /** Pointer x minus the grabbed thumb's centre x, so a grab does not jump. */
  grab: number;
  /** The pointer's last x (a lostpointercapture may carry no coordinates). */
  lastX: number;
  moved: boolean;
  from: number;
  value: number;
}

/** A range slider with a ghost thumb at the saved value while dragging. */
export function GhostSlider({
  value,
  onValueChange,
  onValueCommit,
  onDragEnd,
  min = 0,
  max = 100,
  step = 1,
  savedValue,
  thumbSize = DEFAULT_THUMB_SIZE_PX,
  disabled = false,
  id,
  name,
  className,
  ...aria
}: GhostSliderProps) {
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const dragRef = React.useRef<Drag | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const latest = React.useRef({ onValueChange, onValueCommit, onDragEnd });
  latest.current = { onValueChange, onValueCommit, onDragEnd };

  // Keys and assistive technology move the native input, which fires `change` once per press:
  // that is the commit. (Pointers never reach the input: they are handled below.)
  React.useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const commit = () => latest.current.onValueCommit?.(Number(input.value));
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, []);

  /** The track's geometry: where the thumb's centre can go, and which way values grow. */
  const geometry = () => {
    const input = inputRef.current!;
    const rect = input.getBoundingClientRect();
    const rtl = getComputedStyle(input).direction === 'rtl';
    const half = thumbSize / 2;
    const usable = Math.max(rect.width - thumbSize, 1); // the thumb is inset by half its width at each end
    const centreX = (v: number) => {
      const f = valuePercent(v, min, max) / 100;
      return rtl ? rect.right - half - f * usable : rect.left + half + f * usable;
    };
    const valueAtX = (x: number) => {
      const f = Math.min(1, Math.max(0, (rtl ? rect.right - half - x : x - rect.left - half) / usable));
      return snapToStep(min + f * (max - min), min, max, step);
    };
    return { centreX, valueAtX };
  };

  // The ref is updated synchronously: pointer events can arrive faster than renders.
  const update = (next: Drag | null, emit?: number) => {
    const before = dragRef.current?.value ?? value;
    dragRef.current = next;
    setDrag(next);
    if (emit !== undefined && emit !== before) latest.current.onValueChange?.(emit);
  };

  const focusInput = () => inputRef.current?.focus({ preventScroll: true });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || dragRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const { centreX, valueAtX } = geometry();
    const touch = e.pointerType !== 'mouse';
    const offset = e.clientX - centreX(value);
    const onThumb = Math.abs(offset) <= Math.max(thumbSize / 2, touch ? TOUCH_GRAB_PX : 0);
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* a pointer the browser no longer tracks: moves still arrive while it is over the track */
    }
    const next: Drag = {
      pointerId: e.pointerId, touch, startX: e.clientX, lastX: e.clientX, onThumb, grab: onThumb ? offset : 0,
      moved: false, from: value, value,
    };
    // A mouse press on the track moves the thumb there at once; a touch waits (scroll or tap?).
    if (!touch && !onThumb) Object.assign(next, { moved: true, value: valueAtX(e.clientX) });
    update(next, next.value);
    // A touch may still turn out to be a scroll: focus (and so blur a text field, closing the
    // on-screen keyboard) only once it drags or taps.
    if (!touch) {
      focusInput();
      e.preventDefault();
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.moved && Math.abs(e.clientX - d.startX) < (d.touch ? SLIDER_TOUCH_SLOP_PX : 1)) return;
    if (!d.moved && d.touch) focusInput();
    const v = geometry().valueAtX(e.clientX - d.grab);
    update({ ...d, moved: true, lastX: e.clientX, value: v }, v);
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null; // pointerup and lostpointercapture may both arrive: finish once
    setDrag(null);
    const { onValueChange: change, onValueCommit: commit, onDragEnd: end } = latest.current;
    if (cancelled) {
      if (d.value !== d.from) change?.(d.from); // revert the preview
      end?.(false);
      return;
    }
    if (d.touch && !d.moved) focusInput(); // a tap
    // A tap (no drag) on the track moves the thumb there; a tap on the thumb does nothing.
    // The x is the pointerup's, else the last one seen (lostpointercapture may carry none).
    const x = e.type === 'pointerup' ? e.clientX : d.lastX;
    const final = !d.moved && !d.onThumb ? geometry().valueAtX(x) : d.value;
    if (final !== d.value) change?.(final);
    if (final !== d.from) commit?.(final);
    end?.(final !== d.from);
  };

  const ghost = drag === null ? null : (savedValue ?? drag.from);
  const showGhost = ghost !== null && ghost !== value;

  // Layout that placing the ghost depends on is inline, so it holds without Tailwind's CSS.
  return h('div', {
    className: ['flex w-full items-center', className].filter(Boolean).join(' '),
    style: {
      position: 'relative',
      minHeight: SLIDER_TOUCH_TARGET_PX,
      touchAction: 'pan-y',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      cursor: disabled ? 'default' : 'pointer',
    },
    'data-slot': 'slider',
    'data-dragging': drag?.moved ? '' : undefined,
    onPointerDown,
    onPointerMove,
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => finish(e, false),
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => finish(e, true),
    onLostPointerCapture: (e: React.PointerEvent<HTMLDivElement>) => finish(e, false),
  },
    h('input', {
      ref: inputRef,
      id,
      name,
      type: 'range',
      min,
      max,
      step,
      value,
      disabled,
      className: 'accent-primary disabled:opacity-50',
      // The ghost is placed against the wrapper: the track must span it exactly. Pointers go to
      // the wrapper (see the module docstring), never to the native input.
      style: { width: '100%', margin: 0, pointerEvents: 'none' },
      'data-slot': 'slider-input',
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onValueChange?.(Number(e.target.value)),
      ...aria,
    }),
    showGhost
      ? h('span', {
          'aria-hidden': true,
          'data-slot': 'slider-ghost-thumb',
          style: {
            position: 'absolute',
            pointerEvents: 'none',
            boxSizing: 'border-box',
            // Logical properties, so the ghost follows the input when it mirrors under RTL.
            insetInlineStart: thumbLeft(valuePercent(ghost, min, max), thumbSize),
            marginInlineStart: -thumbSize / 2,
            width: thumbSize,
            height: thumbSize,
            top: '50%',
            transform: 'translateY(-50%)',
            borderRadius: '9999px',
            // Light ring, dark outline: visible on the filled and on the empty part of the track.
            border: '2px solid var(--zodal-slider-ghost-ring, rgb(255 255 255 / 0.9))',
            boxShadow: '0 0 0 1px var(--zodal-slider-ghost-outline, rgb(0 0 0 / 0.55))',
            background: 'var(--zodal-slider-ghost-fill, rgb(0 0 0 / 0.2))',
          },
        })
      : null,
  );
}
