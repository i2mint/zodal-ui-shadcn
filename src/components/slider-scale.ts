/**
 * Slider scales: how a value maps to a position along a track (0 at the start, 1 at the end)
 * and back. Framework-free, so any renderer (or a test) can use them.
 *
 * - {@link linearScale}: equal distances mean equal differences in value.
 * - {@link quantileScale}: equal distances mean equal shares of the data. The track is laid out
 *   by percentiles, so a skewed distribution (box office, popularity, follower counts) gets
 *   room where the data is, instead of a long empty tail; the ticks sit at percentiles and are
 *   labelled with the values found there.
 */

export interface SliderTick {
  /** Where the tick sits, 0 to 1. */
  position: number;
  /** The value at that position. */
  value: number;
  /** The share of the data below it, 0 to 100, for a quantile scale. */
  percentile?: number;
}

export interface SliderScale {
  readonly kind: 'linear' | 'quantile';
  /** Smallest and largest values on the track. */
  readonly min: number;
  readonly max: number;
  /** Position (0 to 1) of `value`; values off the track are clamped. */
  toPosition(value: number): number;
  /** Value at `position` (0 to 1). */
  toValue(position: number): number;
  /** Marks worth drawing under the track. */
  readonly ticks: readonly SliderTick[];
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** A linear scale from `min` to `max`, with `tickCount` evenly spaced ticks (ends included). */
export function linearScale(min: number, max: number, { tickCount = 5 }: { tickCount?: number } = {}): SliderScale {
  const span = max - min || 1; // a degenerate range must not divide by zero
  const n = Math.max(tickCount, 2);
  const ticks: SliderTick[] = Array.from({ length: n }, (_, i) => {
    const position = i / (n - 1);
    return { position, value: min + position * span };
  });
  return {
    kind: 'linear',
    min,
    max,
    toPosition: (value) => (Number.isNaN(value) ? 0 : clamp01((value - min) / span)),
    toValue: (position) => min + clamp01(position) * (max - min),
    ticks,
  };
}

/** Default tick percentiles of a quantile scale: the ends, the quartiles, and the 10/90 tails. */
export const DEFAULT_TICK_PERCENTILES = [0, 10, 25, 50, 75, 90, 100] as const;

/**
 * A scale laid out by the data's percentiles.
 *
 * `quantiles[i]` is the value at percentile `100 * i / (quantiles.length - 1)`, non-decreasing
 * (101 values give whole percentiles; {@link quantilesOf} computes them from raw data). Between
 * two quantiles the scale is linear. Where several quantiles share one value (a plateau: many
 * films released in the same year), that value sits at the middle of the plateau, except at
 * the two ends of the track (see `toPosition`). Throws on fewer than two or non-finite values.
 */
export function quantileScale(
  quantiles: readonly number[],
  { tickPercentiles = DEFAULT_TICK_PERCENTILES }: { tickPercentiles?: readonly number[] } = {},
): SliderScale {
  const q = [...quantiles];
  if (q.length < 2 || !q.every((v) => Number.isFinite(v))) {
    throw new Error('quantileScale needs at least two quantiles, all finite'); // a dropped NaN would shift every percentile
  }
  for (let i = 1; i < q.length; i++) {
    if (q[i] < q[i - 1]) throw new Error('quantileScale needs non-decreasing quantiles');
  }
  const k = q.length - 1;

  const toValue = (position: number) => {
    const x = clamp01(position) * k;
    const i = Math.min(Math.floor(x), k - 1);
    return q[i] + (x - i) * (q[i + 1] - q[i]);
  };

  // A value at the data's minimum (or maximum) sits at the track's end, even when many
  // quantiles share it: a minimum equal to the smallest value excludes nothing, like no
  // minimum. Inside the track, a value shared by several quantiles sits at their middle.
  const toPosition = (value: number) => {
    if (Number.isNaN(value) || value <= q[0]) return 0;
    if (value >= q[k]) return 1;
    // lo: first index with q >= value; hi: last index with q <= value.
    let a = 0;
    let b = k;
    while (a < b) {
      const m = (a + b) >> 1;
      if (q[m] < value) a = m + 1;
      else b = m;
    }
    const lo = a;
    a = 0;
    b = k;
    while (a < b) {
      const m = (a + b + 1) >> 1;
      if (q[m] > value) b = m - 1;
      else a = m;
    }
    const hi = a;
    if (lo <= hi) return (lo + hi) / 2 / k; // on a plateau (or one exact quantile)
    return (hi + (value - q[hi]) / (q[lo] - q[hi])) / k; // strictly between q[hi] and q[lo]
  };

  const ticks = tickPercentiles.map((p) => ({ position: p / 100, value: toValue(p / 100), percentile: p }));
  return { kind: 'quantile', min: q[0], max: q[k], toPosition, toValue, ticks };
}

/** `count + 1` quantiles of `values` (linear interpolation, NaN ignored): the input of {@link quantileScale}. */
export function quantilesOf(values: Iterable<number>, count = 100): number[] {
  if (!(Number.isInteger(count) && count >= 1)) throw new Error('quantilesOf needs a whole count >= 1');
  const sorted = Array.from(values).filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  if (!sorted.length) return [];
  return Array.from({ length: count + 1 }, (_, i) => {
    const x = (i / count) * (sorted.length - 1);
    const j = Math.floor(x);
    return j + 1 < sorted.length ? sorted[j] + (x - j) * (sorted[j + 1] - sorted[j]) : sorted[j];
  });
}
