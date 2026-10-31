/**
 * GhostRangeSlider: a two-thumb ("double cursor") slider for a `[low, high]` range, with the
 * same contract as {@link GhostSlider}: while a thumb is dragged, a faded ghost stays where it
 * started; changes preview through `onValueChange` and commit once, on release (or per key
 * press), through `onValueCommit`.
 *
 * What it adds:
 * - **A scale.** Positions map to values through a {@link SliderScale}: linear, or quantile, so
 *   the track is laid out by percentiles of the data and its ticks sit at percentiles.
 * - **Open ends.** A thumb pushed to its end of the track means "no bound": its side of the value
 *   becomes `undefined`, which is how a range filter says "any".
 * - **Number fields, two-way** ({@link GhostRangeSliderField}): typing moves the thumb, dragging
 *   rewrites the field; drafts are never refused (tw-frontend-ux controls: text and number fields).
 *
 * Built from plain elements and pointer events (no new dependency); each thumb is a
 * `role="slider"` with the ARIA values and keys of the WAI-ARIA multi-thumb slider pattern.
 * Thumbs never cross. The touch target is 44px tall whatever the drawn thumb size. Colours come
 * from CSS custom properties (`--zodal-range-fill`, `--zodal-range-track`, `--zodal-range-thumb`,
 * `--zodal-range-thumb-border`, `--zodal-range-tick`) so a host restyles it without selector
 * fights; layout is inline so it works without the host's CSS.
 */

import React from 'react';
import { thumbLeft } from './ghost-slider.js';
import type { SliderScale } from './slider-scale.js';

const h = React.createElement;

/** `[low, high]`; `undefined` on a side means unbounded on that side. */
export type RangeValue = readonly [number | undefined, number | undefined];

/** The drawn thumb's width in px (the touch target is larger, see {@link TOUCH_TARGET_PX}). */
export const DEFAULT_RANGE_THUMB_PX = 20;
/** Minimum height of the interactive area: tw-frontend-ux §8. */
export const TOUCH_TARGET_PX = 44;
/** One arrow-key press moves this much of the track (one percentile on a quantile scale). */
export const KEY_STEP = 0.01;
/** Page Up / Page Down move this much. */
export const PAGE_STEP = 0.1;

export interface GhostRangeSliderProps {
  value: RangeValue;
  scale: SliderScale;
  /** Every move (drag or key): preview. */
  onValueChange?: (value: RangeValue) => void;
  /** Once per change: on release after a drag, and per key press. */
  onValueCommit?: (value: RangeValue) => void;
  /** Snap a raw value (e.g. `Math.round` for years). Default: identity. */
  round?: (value: number) => number;
  /** Text for a value: tick labels, `aria-valuetext`. Default: `String`. */
  format?: (value: number) => string;
  /** A thumb at its end of the track means "no bound" (`undefined`). Default true. */
  openEnds?: boolean;
  /** Draw the scale's ticks and their labels under the track. Default true. */
  showTicks?: boolean;
  thumbSize?: number;
  disabled?: boolean;
  /** Accessible names of the two thumbs. */
  lowLabel?: string;
  highLabel?: string;
  className?: string;
  id?: string;
}

type Side = 0 | 1;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Positions (0 to 1) of a range value's two thumbs; an open side sits at its end. */
export function rangePositions(value: RangeValue, scale: SliderScale): [number, number] {
  const lo = value[0] === undefined ? 0 : scale.toPosition(value[0]);
  const hi = value[1] === undefined ? 1 : scale.toPosition(value[1]);
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

/** The range value for two thumb positions (an end position is open when `openEnds`). */
export function rangeValueAt(
  positions: readonly [number, number],
  scale: SliderScale,
  { round = (v: number) => v, openEnds = true }: { round?: (v: number) => number; openEnds?: boolean } = {},
): RangeValue {
  const [p0, p1] = positions;
  const lo = openEnds && p0 <= 0 ? undefined : round(scale.toValue(p0));
  const hi = openEnds && p1 >= 1 ? undefined : round(scale.toValue(p1));
  return [lo, hi];
}

const sameRange = (a: RangeValue, b: RangeValue) => a[0] === b[0] && a[1] === b[1];

/** A two-thumb slider over a range, with ghost thumbs while dragging. Controlled. */
export function GhostRangeSlider({
  value,
  scale,
  onValueChange,
  onValueCommit,
  round = (v) => v,
  format = String,
  openEnds = true,
  showTicks = true,
  thumbSize = DEFAULT_RANGE_THUMB_PX,
  disabled = false,
  lowLabel = 'Minimum',
  highLabel = 'Maximum',
  className,
  id,
}: GhostRangeSliderProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  // While dragging, thumbs follow the pointer in position space (smooth even across plateaus);
  // otherwise their positions derive from the value.
  const [drag, setDrag] = React.useState<{ side: Side; from: [number, number]; at: [number, number] } | null>(null);
  const positions = drag ? drag.at : rangePositions(value, scale);
  const opts = { round, openEnds };

  const positionAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const usable = rect.width - thumbSize || 1; // the thumb is inset by half its width at each end
    return clamp01((clientX - rect.left - thumbSize / 2) / usable);
  };

  const moveTo = (side: Side, p: number, at: [number, number]): [number, number] => {
    const next: [number, number] = [...at];
    next[side] = side === 0 ? Math.min(p, at[1]) : Math.max(p, at[0]); // never cross
    return next;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button > 0) return;
    const p = positionAt(e.clientX);
    const [p0, p1] = positions;
    // The nearer thumb; when they coincide, the side the pointer is on.
    const side: Side = Math.abs(p - p0) < Math.abs(p - p1) ? 0 : Math.abs(p - p0) > Math.abs(p - p1) ? 1 : p < p0 ? 0 : 1;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const at = moveTo(side, p, positions);
    setDrag({ side, from: positions, at });
    (e.currentTarget.querySelectorAll('[role=slider]')[side] as HTMLElement | undefined)?.focus({ preventScroll: true });
    const v = rangeValueAt(at, scale, opts);
    if (!sameRange(v, value)) onValueChange?.(v);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const at = moveTo(drag.side, positionAt(e.clientX), drag.at);
    setDrag({ ...drag, at });
    onValueChange?.(rangeValueAt(at, scale, opts));
  };

  const endDrag = () => {
    if (!drag) return;
    setDrag(null);
    const v = rangeValueAt(drag.at, scale, opts);
    const before = rangeValueAt(drag.from, scale, opts);
    if (!sameRange(v, before)) onValueCommit?.(v);
  };

  const onKeyDown = (side: Side) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const cur = positions[side];
    const keys: Record<string, number> = {
      ArrowRight: cur + KEY_STEP,
      ArrowUp: cur + KEY_STEP,
      ArrowLeft: cur - KEY_STEP,
      ArrowDown: cur - KEY_STEP,
      PageUp: cur + PAGE_STEP,
      PageDown: cur - PAGE_STEP,
      Home: 0,
      End: 1,
    };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const v = rangeValueAt(moveTo(side, clamp01(keys[e.key]), positions), scale, opts);
    if (!sameRange(v, value)) {
      onValueChange?.(v);
      onValueCommit?.(v); // each key press is a commit
    }
  };

  const fill = 'var(--zodal-range-fill, #2563eb)';
  const thumbStyle = (p: number, ghost = false): React.CSSProperties => ({
    position: 'absolute',
    top: '50%',
    insetInlineStart: thumbLeft(p * 100, thumbSize),
    marginInlineStart: -thumbSize / 2,
    width: thumbSize,
    height: thumbSize,
    transform: 'translateY(-50%)',
    boxSizing: 'border-box',
    borderRadius: '9999px',
    border: `2px solid ${ghost ? 'var(--zodal-range-thumb-border, #2563eb)' : fill}`,
    background: 'var(--zodal-range-thumb, #fff)',
    opacity: ghost ? 0.45 : 1,
    pointerEvents: 'none',
    boxShadow: ghost ? 'none' : '0 1px 3px rgba(0,0,0,.3)',
  });

  const sides: Side[] = [0, 1];
  const ghosts = drag
    ? sides.filter((s) => Math.abs(drag.from[s] - drag.at[s]) > 1e-9).map((s) =>
        h('span', { key: `ghost${s}`, 'aria-hidden': true, 'data-slot': 'range-ghost-thumb', style: thumbStyle(drag.from[s], true) }),
      )
    : [];

  const valueText = (side: Side) => {
    const v = rangeValueAt(positions, scale, opts)[side];
    return v === undefined ? (side === 0 ? 'no minimum' : 'no maximum') : format(v);
  };

  return h('div', { className, id, 'data-slot': 'range-slider', style: { width: '100%', opacity: disabled ? 0.5 : 1 } },
    h('div', {
      ref: trackRef,
      'data-slot': 'range-slider-track-area',
      style: { position: 'relative', height: TOUCH_TARGET_PX, touchAction: 'none', cursor: disabled ? 'default' : 'pointer', userSelect: 'none' },
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onLostPointerCapture: endDrag,
    },
      h('div', {
        'data-slot': 'range-slider-track',
        style: {
          position: 'absolute', left: thumbSize / 2, right: thumbSize / 2, top: '50%', height: 4, marginTop: -2,
          borderRadius: 2, background: 'var(--zodal-range-track, rgba(120,113,108,.3))',
        },
      },
        h('div', {
          'data-slot': 'range-slider-fill',
          style: {
            position: 'absolute', top: 0, bottom: 0, borderRadius: 2, background: fill,
            insetInlineStart: `${positions[0] * 100}%`, width: `${(positions[1] - positions[0]) * 100}%`,
          },
        }),
      ),
      ...ghosts,
      ...sides.map((s) =>
        h('div', {
          key: `thumb${s}`,
          role: 'slider',
          tabIndex: disabled ? -1 : 0,
          'aria-label': s === 0 ? lowLabel : highLabel,
          'aria-orientation': 'horizontal',
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': Math.round(positions[s] * 100),
          'aria-valuetext': valueText(s),
          'aria-disabled': disabled || undefined,
          'data-slot': 'range-slider-thumb',
          onKeyDown: onKeyDown(s),
          // The interactive box is the drawn thumb; the 44px area above routes pointers to it.
          style: { ...thumbStyle(positions[s]), pointerEvents: 'none', outlineOffset: 2 },
        }),
      ),
    ),
    showTicks && scale.ticks.length
      ? h('div', { 'data-slot': 'range-slider-ticks', 'aria-hidden': true, style: { position: 'relative', height: 18, margin: `0 ${thumbSize / 2}px` } },
          ...scale.ticks.map((t, i) => {
            const edge = i === 0 ? 'start' : i === scale.ticks.length - 1 ? 'end' : 'mid';
            return h('span', {
              key: `tick${i}`,
              'data-slot': 'range-slider-tick',
              title: t.percentile !== undefined ? `${t.percentile}th percentile` : undefined,
              style: {
                position: 'absolute', top: 0, insetInlineStart: `${t.position * 100}%`, whiteSpace: 'nowrap',
                fontSize: '0.75em', lineHeight: '18px', color: 'var(--zodal-range-tick, rgba(120,113,108,1))',
                transform: edge === 'start' ? 'none' : edge === 'end' ? 'translateX(-100%)' : 'translateX(-50%)',
                borderInlineStart: edge === 'mid' ? '1px solid currentColor' : undefined,
                paddingInlineStart: edge === 'mid' ? 2 : undefined,
              },
            }, format(round(t.value)));
          }),
        )
      : null,
  );
}

export interface GhostRangeSliderFieldProps extends GhostRangeSliderProps {
  /** A value as the number fields show it (e.g. dollars as millions). Default: `String`. */
  toInput?: (value: number) => string;
  /** A field's text as a value: `undefined` for empty (no bound), `null` when not a valid value yet. */
  fromInput?: (text: string) => number | undefined | null;
  /** Labels of the two fields. */
  lowInputLabel?: string;
  highInputLabel?: string;
  /** Placeholder of an empty field (no bound). Default "any". */
  placeholder?: string;
}

const defaultFromInput = (text: string): number | undefined | null => {
  const t = text.trim();
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * {@link GhostRangeSlider} with two number fields under it, bound both ways. A field holds a
 * draft while focused: a valid draft moves its thumb at once (a preview, `onValueChange`); an
 * invalid one changes nothing. Blur or Enter commits the last valid value once and shows the
 * value again. Empty means "no bound".
 */
export function GhostRangeSliderField({
  toInput = String,
  fromInput = defaultFromInput,
  lowInputLabel = 'From',
  highInputLabel = 'To',
  placeholder = 'any',
  ...slider
}: GhostRangeSliderFieldProps) {
  const [drafts, setDrafts] = React.useState<[string | null, string | null]>([null, null]);
  const pending = React.useRef<RangeValue | null>(null); // the last valid preview, not yet committed
  const { value, onValueChange, onValueCommit, disabled } = slider;
  const commit = () => {
    if (pending.current) onValueCommit?.(pending.current);
    pending.current = null;
  };

  const field = (side: Side, label: string) => {
    const shown = drafts[side] ?? (value[side] === undefined ? '' : toInput(value[side] as number));
    const parsed = drafts[side] === null ? undefined : fromInput(drafts[side] as string);
    const invalid = drafts[side] !== null && parsed === null;
    return h('label', { key: `f${side}`, 'data-slot': 'range-slider-field', style: { display: 'block', flex: 1, minWidth: 0 } },
      h('span', { style: { display: 'block', fontSize: '0.75em', opacity: 0.7 } }, label),
      h('input', {
        type: 'text',
        inputMode: 'decimal',
        autoComplete: 'off',
        disabled,
        value: shown,
        placeholder,
        'aria-invalid': invalid || undefined,
        'data-slot': 'range-slider-input',
        style: { width: '100%', boxSizing: 'border-box', fontSize: 16, minHeight: TOUCH_TARGET_PX },
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          const text = e.target.value;
          setDrafts((d) => (side === 0 ? [text, d[1]] : [d[0], text]));
          const v = fromInput(text);
          if (v === null) return; // not a value yet: keep the draft, change nothing
          const next: [number | undefined, number | undefined] = [value[0], value[1]];
          next[side] = v;
          if (next[0] !== undefined && next[1] !== undefined && next[0] > next[1]) return; // crossed: wait
          pending.current = next;
          onValueChange?.(next);
        },
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') commit();
        },
        onBlur: () => {
          commit();
          setDrafts((d) => (side === 0 ? [null, d[1]] : [d[0], null]));
        },
      }),
    );
  };

  return h('div', { 'data-slot': 'range-slider-field-group' },
    h(GhostRangeSlider, slider),
    h('div', { style: { display: 'flex', gap: 12, marginTop: 4 } }, field(0, lowInputLabel), field(1, highInputLabel)),
  );
}
