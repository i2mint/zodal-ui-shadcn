// The page the range-slider browser check loads: one controlled GhostRangeSlider on a quantile
// scale, driven through `window.__set(value)`, with commits recorded in `window.__commits`.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { GhostRangeSlider, type RangeValue } from '../../src/components/ghost-range-slider.js';
import { quantileScale, quantilesOf } from '../../src/components/slider-scale.js';

const w = window as unknown as { __commits: RangeValue[]; __set: (v: RangeValue) => void; __value: RangeValue };
w.__commits = [];
let setValue: (v: RangeValue) => void = () => {};
// A skewed distribution: the quantile scale must spread it evenly along the track.
const scale = quantileScale(quantilesOf(Array.from({ length: 1000 }, (_, i) => (i / 10) ** 2)));

function Host() {
  const [value, set] = React.useState<RangeValue>([undefined, undefined]);
  setValue = set;
  w.__value = value;
  return React.createElement(GhostRangeSlider, {
    value,
    scale,
    round: Math.round,
    onValueChange: set,
    onValueCommit: (v: RangeValue) => w.__commits.push(v),
  });
}

w.__set = (v) => {
  flushSync(() => setValue(v));
  w.__commits = [];
};
flushSync(() => createRoot(document.getElementById('root')!).render(React.createElement(Host)));
