/**
 * GhostRangeSlider: a two-thumb ("double cursor") slider for a `[low, high]` range, with the
 * same contract as {@link GhostSlider}: while a thumb is dragged, a faded ghost stays where it
 * started; changes preview through `onValueChange` and commit once, at the end of a gesture
 * (release, a tap on the track, or a key press), through `onValueCommit`.
 *
 * What it adds:
 * - **A scale.** Positions map to values through a {@link SliderScale}: linear, or quantile, so
 *   the track is laid out by percentiles of the data and its ticks sit at percentiles.
 * - **Open ends.** A thumb pushed to its end of the track means "no bound": its side of the value
 *   becomes `undefined`, which is how a range filter says "any".
 * - **Number fields, two-way** ({@link GhostRangeSliderField}): typing moves the thumb, dragging
 *   rewrites the field; drafts are never refused (tw-frontend-ux controls: text and number fields).
 *
 * Interaction rules (each one fixes a way sliders go wrong on a phone):
 * - Moving one thumb changes only its side of the value; the other side is kept as it is.
 * - One pointer at a time: a second finger is ignored.
 * - A press on a thumb grabs it where it was pressed (no jump); a press on the track moves the
 *   nearer thumb there. A touch does nothing until it has moved a few pixels sideways, and the
 *   track allows vertical panning (`touch-action: pan-y`), so a scroll that starts on the slider
 *   scrolls the page and changes nothing (the browser cancels the pointer; a cancel reverts).
 * - When both thumbs sit together, the first move's direction picks which one moves.
 * - A key moves its thumb at least far enough to change the (rounded) value: one percentile of
 *   the track per arrow, ten per Page key, then on until the value actually changes.
 *
 * Built from plain elements and pointer events (no new dependency); each thumb is a
 * `role="slider"` (WAI-ARIA multi-thumb pattern: the low thumb's maximum is the high thumb's
 * position and vice versa) inside a labelled `role="group"`. The track is laid out left to
 * right whatever the page direction. The touch target is 44px tall whatever the drawn thumb
 * size. Colours come from CSS custom properties (`--zodal-range-fill`, `--zodal-range-track`,
 * `--zodal-range-thumb`, `--zodal-range-thumb-border`, `--zodal-range-tick`) so a host restyles
 * it without selector fights; layout is inline so it works without the host's CSS.
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
/** One arrow-key press moves at least this much of the track (one percentile on a quantile scale). */
export const KEY_STEP = 0.01;
/** Page Up / Page Down move at least this much. */
export const PAGE_STEP = 0.1;
/** A touch must move this many px sideways before it drags (below it, it may be a scroll or a tap). */
export const TOUCH_SLOP_PX = 6;

/** Locale digits, at most 2 decimals; thousands grouped only from 10,000 (so years read 1925). */
const defaultFormat = (() => {
  const grouped = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const plain = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, useGrouping: false });
  return (v: number) => (Math.abs(v) >= 10_000 ? grouped : plain).format(v);
})();

export interface GhostRangeSliderProps {
  value: RangeValue;
  scale: SliderScale;
  /** Every change of value during a gesture: preview. */
  onValueChange?: (value: RangeValue) => void;
  /** Once per gesture that changed the value: release, track tap, key press. */
  onValueCommit?: (value: RangeValue) => void;
  /** Snap a raw value (e.g. `Math.round` for years). Default: identity. */
  round?: (value: number) => number;
  /** Text for a value: tick labels, `aria-valuetext`. Default: a locale number, 2 decimals at most. */
  format?: (value: number) => string;
  /** A thumb at its end of the track means "no bound" (`undefined`). Default true. */
  openEnds?: boolean;
  /** Draw the scale's ticks and their labels under the track. Default true. */
  showTicks?: boolean;
  thumbSize?: number;
  disabled?: boolean;
  /** Accessible name of the whole control (the `role="group"`). */
  label?: string;
  /** Accessible names of the two thumbs. */
  lowLabel?: string;
  highLabel?: string;
  className?: string;
  id?: string;
}

type Side = 0 | 1;

/** Rough width of a tick label in px at the ticks' 0.75em (about 12px): enough to avoid overlaps. */
const LABEL_CHAR_PX = 7;
const LABEL_GAP_PX = 6;

/**
 * Which ticks get a text label on a track `width` px wide: the two ends always, then the
 * others from the middle outwards (median, quartiles, tails), each only if its label does not
 * overlap one already placed. Ticks left unlabelled are still drawn as marks.
 */
export function labelledTicks(ticks: readonly { position: number }[], texts: readonly string[], width: number): boolean[] {
  const n = ticks.length;
  const keep = new Array<boolean>(n).fill(false);
  const spans: [number, number][] = [];
  const span = (i: number): [number, number] => {
    const w = texts[i].length * LABEL_CHAR_PX;
    const x = ticks[i].position * width;
    // the end labels are anchored inward, the others centred (as drawn)
    if (i === 0) return [x, x + w];
    if (i === n - 1) return [x - w, x];
    return [x - w / 2, x + w / 2];
  };
  const order = [0, n - 1, ...Array.from({ length: Math.max(n - 2, 0) }, (_, k) => k + 1).sort(
    (a, b) => Math.abs(ticks[a].position - 0.5) - Math.abs(ticks[b].position - 0.5),
  )];
  for (const i of order) {
    if (i < 0 || i >= n || keep[i]) continue;
    const [a, b] = span(i);
    if (i === 0 || i === n - 1 || spans.every(([c, d]) => b + LABEL_GAP_PX <= c || a >= d + LABEL_GAP_PX)) {
      keep[i] = true;
      spans.push([a, b]);
    }
  }
  return keep;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Positions (0 to 1) of a range value's two thumbs; an open side sits at its end. */
export function rangePositions(value: RangeValue, scale: SliderScale): [number, number] {
  const lo = value[0] === undefined ? 0 : scale.toPosition(value[0]);
  const hi = value[1] === undefined ? 1 : scale.toPosition(value[1]);
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

/** The value of one side at a position (`undefined` at that side's end when `openEnds`). */
export function sideValueAt(
  side: Side,
  position: number,
  scale: SliderScale,
  { round = (v: number) => v, openEnds = true }: { round?: (v: number) => number; openEnds?: boolean } = {},
): number | undefined {
  if (openEnds && (side === 0 ? position <= 0 : position >= 1)) return undefined;
  return round(scale.toValue(position));
}

/** The range value for two thumb positions (both sides recomputed: for a fresh value). */
export function rangeValueAt(
  positions: readonly [number, number],
  scale: SliderScale,
  opts: { round?: (v: number) => number; openEnds?: boolean } = {},
): RangeValue {
  return [sideValueAt(0, positions[0], scale, opts), sideValueAt(1, positions[1], scale, opts)];
}

/** `value` with one side replaced, kept ordered (a side never passes the other). */
function withSide(value: RangeValue, side: Side, v: number | undefined): RangeValue {
  const other = value[1 - side];
  if (v !== undefined && other !== undefined && (side === 0 ? v > other : v < other)) v = other;
  return side === 0 ? [v, value[1]] : [value[0], v];
}

const sameRange = (a: RangeValue, b: RangeValue) => a[0] === b[0] && a[1] === b[1];

interface Drag {
  pointerId: number;
  touch: boolean;
  startX: number;
  /** null until the first move decides it (both thumbs pressed together). */
  side: Side | null;
  onThumb: boolean;
  /** Pointer position minus the grabbed thumb's position, so a grab does not jump. */
  grab: number;
  moved: boolean;
  from: RangeValue;
  fromPos: [number, number];
  /** The moved thumb's position (follows the pointer, smooth across plateaus). */
  at: number;
  value: RangeValue;
}

/** A two-thumb slider over a range, with ghost thumbs while dragging. Controlled. */
export function GhostRangeSlider({
  value,
  scale,
  onValueChange,
  onValueCommit,
  round = (v) => v,
  format = defaultFormat,
  openEnds = true,
  showTicks = true,
  thumbSize = DEFAULT_RANGE_THUMB_PX,
  disabled = false,
  label,
  lowLabel = 'Minimum',
  highLabel = 'Maximum',
  className,
  id,
}: GhostRangeSliderProps) {
  const areaRef = React.useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [trackWidth, setTrackWidth] = React.useState(300); // re-measured on mount and resize
  React.useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w > thumbSize) setTrackWidth(w - thumbSize); // no layout (a test DOM): keep the default
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [thumbSize]);
  const dragRef = React.useRef<Drag | null>(null);
  dragRef.current = drag;
  const opts = { round, openEnds };

  const shown = drag ? drag.value : value;
  const positions = rangePositions(shown, scale);
  if (drag?.moved && drag.side !== null) positions[drag.side] = drag.at;

  const positionAt = (clientX: number) => {
    const rect = areaRef.current!.getBoundingClientRect();
    const usable = rect.width - thumbSize || 1; // the thumb is inset by half its width at each end
    return clamp01((clientX - rect.left - thumbSize / 2) / usable);
  };
  const thumbHalf = () => thumbSize / 2 / Math.max((areaRef.current?.getBoundingClientRect().width ?? 1) - thumbSize, 1);

  // The ref is updated synchronously: pointer events can arrive faster than renders.
  const update = (next: Drag) => {
    const before = dragRef.current?.value ?? value;
    dragRef.current = next;
    setDrag(next);
    if (!sameRange(next.value, before)) onValueChange?.(next.value);
  };

  /** Move `side` to position `p` (clamped at the other thumb), as a value. */
  const placed = (base: RangeValue, side: Side, p: number, pos: [number, number]): { value: RangeValue; at: number } => {
    const at = side === 0 ? Math.min(p, pos[1]) : Math.max(p, pos[0]);
    return { value: withSide(base, side, sideValueAt(side, at, scale, opts)), at };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || dragRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const p = positionAt(e.clientX);
    const pos = rangePositions(value, scale);
    const half = thumbHalf();
    const d0 = Math.abs(p - pos[0]);
    const d1 = Math.abs(p - pos[1]);
    const together = Math.abs(pos[0] - pos[1]) < 1e-9;
    const onThumb = Math.min(d0, d1) <= half;
    const side: Side | null = together ? (onThumb ? null : p < pos[0] ? 0 : 1) : d0 <= d1 ? 0 : 1;
    const grab = onThumb && side !== null ? p - pos[side] : 0;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* a pointer the browser no longer tracks: moves still arrive while it is over the track */
    }
    const touch = e.pointerType !== 'mouse';
    const next: Drag = {
      pointerId: e.pointerId, touch, startX: e.clientX, side, onThumb, grab, moved: false,
      from: value, fromPos: pos, at: side === null ? pos[0] : pos[side], value,
    };
    // A mouse press on the track moves the nearer thumb at once; a touch waits (scroll or tap?).
    if (!touch && !onThumb && side !== null) {
      Object.assign(next, placed(value, side, p, pos), { moved: true });
    }
    update(next);
    if (side !== null) (areaRef.current?.querySelectorAll('[role=slider]')[side] as HTMLElement | undefined)?.focus({ preventScroll: true });
    if (!touch) e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < (d.touch ? TOUCH_SLOP_PX : 1)) return;
    const side: Side = d.side ?? (dx < 0 ? 0 : 1);
    const p = positionAt(e.clientX) - d.grab;
    update({ ...d, side, moved: true, ...placed(d.from, side, clamp01(p), d.fromPos) });
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null; // pointerup and lostpointercapture may both arrive: finish once
    setDrag(null);
    if (cancelled) {
      if (!sameRange(d.value, d.from)) onValueChange?.(d.from); // revert the preview
      return;
    }
    let final = d.value;
    // A tap (no drag) on the track moves the nearer thumb there; a tap on a thumb does nothing.
    if (!d.moved && !d.onThumb && d.side !== null) final = placed(d.from, d.side, positionAt(e.clientX), d.fromPos).value;
    if (!sameRange(final, d.from)) {
      if (!sameRange(final, d.value)) onValueChange?.(final);
      onValueCommit?.(final);
    }
  };

  const onKeyDown = (side: Side) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const pos = rangePositions(value, scale);
    const dir = { ArrowRight: 1, ArrowUp: 1, PageUp: 1, ArrowLeft: -1, ArrowDown: -1, PageDown: -1 }[e.key];
    let next: RangeValue;
    if (e.key === 'Home' || e.key === 'End') {
      next = placed(value, side, e.key === 'Home' ? 0 : 1, pos).value;
    } else if (dir !== undefined) {
      // Step, then keep stepping until the (rounded) value changes or the thumb hits a stop.
      const limit = dir > 0 ? (side === 0 ? pos[1] : 1) : side === 0 ? 0 : pos[0];
      let p = pos[side] + dir * (e.key.startsWith('Page') ? PAGE_STEP : KEY_STEP);
      next = placed(value, side, clamp01(p), pos).value;
      while (next[side] === value[side] && (dir > 0 ? p < limit : p > limit)) {
        p += dir * KEY_STEP;
        next = placed(value, side, clamp01(p), pos).value;
      }
    } else return;
    e.preventDefault();
    if (!sameRange(next, value)) {
      onValueChange?.(next);
      onValueCommit?.(next); // each key press is a commit
    }
  };

  const fill = 'var(--zodal-range-fill, #2563eb)';
  const thumbStyle = (p: number, ghost = false): React.CSSProperties => ({
    position: 'absolute',
    top: '50%',
    left: thumbLeft(p * 100, thumbSize),
    marginLeft: -thumbSize / 2,
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
  const ghosts =
    drag?.moved && drag.side !== null && Math.abs(drag.fromPos[drag.side] - positions[drag.side]) > 1e-9
      ? [h('span', { key: 'ghost', 'aria-hidden': true, 'data-slot': 'range-ghost-thumb', style: thumbStyle(drag.fromPos[drag.side], true) })]
      : [];

  const valueText = (side: Side) => {
    const v = shown[side];
    return v === undefined ? (side === 0 ? 'no minimum' : 'no maximum') : format(v);
  };

  return h('div', { className, id, role: 'group', 'aria-label': label, 'data-slot': 'range-slider', style: { width: '100%', opacity: disabled ? 0.5 : 1 } },
    h('div', {
      ref: areaRef,
      dir: 'ltr', // positions are measured from the left: keep the track left to right
      'data-slot': 'range-slider-track-area',
      style: { position: 'relative', height: TOUCH_TARGET_PX, touchAction: 'pan-y', cursor: disabled ? 'default' : 'pointer', userSelect: 'none' },
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => finish(e, false),
      onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => finish(e, true),
      onLostPointerCapture: (e: React.PointerEvent<HTMLDivElement>) => finish(e, false),
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
            left: `${positions[0] * 100}%`, width: `${(positions[1] - positions[0]) * 100}%`,
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
          'aria-valuemin': s === 0 ? 0 : Math.round(positions[0] * 100),
          'aria-valuemax': s === 0 ? Math.round(positions[1] * 100) : 100,
          'aria-valuenow': Math.round(positions[s] * 100),
          'aria-valuetext': valueText(s),
          'aria-disabled': disabled || undefined,
          'data-slot': 'range-slider-thumb',
          onKeyDown: onKeyDown(s),
          style: { ...thumbStyle(positions[s]), outlineOffset: 2 },
        }),
      ),
    ),
    showTicks && scale.ticks.length
      ? h('div', { dir: 'ltr', 'data-slot': 'range-slider-ticks', 'aria-hidden': true, style: { position: 'relative', height: 18, margin: `0 ${thumbSize / 2}px` } },
          ...(() => {
            const texts = scale.ticks.map((t) => format(round(t.value)));
            const keep = labelledTicks(scale.ticks, texts, trackWidth);
            return scale.ticks.map((t, i) => {
            const edge = i === 0 ? 'start' : i === scale.ticks.length - 1 ? 'end' : 'mid';
            return h('span', {
              key: `tick${i}`,
              'data-slot': 'range-slider-tick',
              title: t.percentile !== undefined ? `${t.percentile}th percentile` : undefined,
              style: {
                position: 'absolute', top: 0, left: `${t.position * 100}%`, whiteSpace: 'nowrap',
                fontSize: '0.75em', lineHeight: '18px', color: 'var(--zodal-range-tick, rgba(120,113,108,1))',
                transform: edge === 'start' ? 'none' : edge === 'end' ? 'translateX(-100%)' : 'translateX(-50%)',
                borderLeft: edge === 'mid' ? '1px solid currentColor' : undefined,
                paddingLeft: edge === 'mid' ? 2 : undefined,
                // An unlabelled tick is a short notch, so it never cuts through a neighbour's label.
                height: keep[i] ? undefined : 5,
              },
            }, keep[i] ? texts[i] : null);
          });
          })(),
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
 * draft while focused and never refuses a keystroke. A draft that is a valid value on its
 * side (a number, or empty for "no bound", not past the other side) moves its thumb at once
 * (a preview, `onValueChange`); anything else is marked `aria-invalid` and changes nothing.
 * Blur or Enter commits the last valid draft once, if it differs from the value the field
 * had when focused; an invalid draft is dropped and the field shows the value again.
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
  const focusValue = React.useRef<RangeValue | null>(null);
  const { value, onValueChange, onValueCommit, disabled } = slider;

  const parse = (side: Side, text: string): RangeValue | null => {
    const v = fromInput(text);
    if (v === null) return null;
    const other = (focusValue.current ?? value)[1 - side];
    if (v !== undefined && other !== undefined && (side === 0 ? v > other : v < other)) return null; // crossed
    return side === 0 ? [v, value[1]] : [value[0], v];
  };

  const commit = (): RangeValue | null => {
    const p = pending.current;
    pending.current = null;
    if (p && !(focusValue.current && sameRange(p, focusValue.current))) onValueCommit?.(p);
    focusValue.current = null;
    return p;
  };

  const field = (side: Side, label: string) => {
    const draft = drafts[side];
    const shownText = draft ?? (value[side] === undefined ? '' : toInput(value[side] as number));
    const invalid = draft !== null && parse(side, draft) === null;
    return h('label', { key: `f${side}`, 'data-slot': 'range-slider-field', style: { display: 'block', flex: 1, minWidth: 0 } },
      h('span', { style: { display: 'block', fontSize: '0.75em', opacity: 0.7 } }, label),
      h('input', {
        type: 'text',
        inputMode: 'decimal',
        autoComplete: 'off',
        disabled,
        value: shownText,
        placeholder,
        'aria-invalid': invalid || undefined,
        'data-slot': 'range-slider-input',
        style: { width: '100%', boxSizing: 'border-box', fontSize: 16, minHeight: TOUCH_TARGET_PX },
        onFocus: () => {
          focusValue.current = value;
          pending.current = null;
        },
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          const text = e.target.value;
          setDrafts((d) => (side === 0 ? [text, d[1]] : [d[0], text]));
          const next = parse(side, text);
          if (next === null) {
            // Unusable: forget any earlier valid prefix ("200" of "2005") and show the value.
            if (pending.current && focusValue.current) onValueChange?.(focusValue.current);
            pending.current = null;
            return;
          }
          pending.current = next;
          onValueChange?.(next);
        },
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') focusValue.current = commit() ?? value; // still focused: the new baseline
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
