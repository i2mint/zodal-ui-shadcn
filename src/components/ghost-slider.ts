/**
 * GhostSlider: a range slider that, while the person drags, leaves a faded "ghost" thumb at
 * the saved value (the value at pointer-down, or an explicit `savedValue`), so they can see how
 * far they moved and where to go back to. The ghost disappears on release.
 *
 * Built on a native `<input type="range">`, like the rest of this package's plain-HTML
 * baseline: no new runtime dependency. (shadcn's `Slider` wraps Radix `@radix-ui/react-slider`,
 * and neither has a ghost thumb.)
 *
 * The one trap: a range input does not put the thumb's centre at `value%`. It keeps the thumb
 * inside the track, insetting it by up to half its width at each end (Radix does the same, its
 * `getThumbInBoundsOffset`), so the ghost is placed by {@link thumbLeft}, and `thumbSize` must
 * match the thumb's rendered width. The offset is applied as `inset-inline-start` (and the
 * ghost centred with `margin-inline-start`), so under `dir="rtl"`, where the browser mirrors
 * the range input, the ghost mirrors with it.
 *
 * Scope: single value, horizontal, controlled (`value`), either writing direction. Not handled
 * yet: vertical, ranges (one ghost per thumb), uncontrolled use.
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

/** A range slider with a ghost thumb at the saved value while dragging. */
export function GhostSlider({
  value,
  onValueChange,
  onValueCommit,
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
  const [dragFrom, setDragFrom] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const commitRef = React.useRef(onValueCommit);
  commitRef.current = onValueCommit;

  // A range input fires `change` once when a drag is released and once per key press: that is
  // the commit. (React's `onChange` is the native `input` event, which fires on every move.)
  React.useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const commit = () => commitRef.current?.(Number(input.value));
    input.addEventListener('change', commit);
    return () => input.removeEventListener('change', commit);
  }, []);

  // A release can land outside the input: end the drag on any pointer release.
  React.useEffect(() => {
    if (dragFrom === null) return;
    const end = () => setDragFrom(null);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [dragFrom]);

  const ghost = dragFrom === null ? null : (savedValue ?? dragFrom);
  const showGhost = ghost !== null && ghost !== value;

  // Layout that placing the ghost depends on is inline, so it holds without Tailwind's CSS.
  return h('div', {
    className: ['flex w-full items-center', className].filter(Boolean).join(' '),
    style: { position: 'relative' },
    'data-slot': 'slider',
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
      // The ghost is placed against the wrapper: the track must span it exactly.
      style: { width: '100%', margin: 0 },
      'data-slot': 'slider-input',
      onPointerDown: () => {
        if (!disabled) setDragFrom(value);
      },
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onValueChange?.(Number(e.target.value)),
      ...aria,
    }),
    showGhost
      ? h('span', {
          'aria-hidden': true,
          'data-slot': 'slider-ghost-thumb',
          className: 'rounded-full border border-primary/50 bg-background/60',
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
          },
        })
      : null,
  );
}
