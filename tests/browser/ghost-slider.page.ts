// The page the browser check loads: one controlled GhostSlider, driven from the test through
// `window.__set(value)`, with commits recorded in `window.__commits`.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { GhostSlider } from '../../src/components/ghost-slider.js';

const w = window as unknown as { __commits: number[]; __set: (v: number) => void };
w.__commits = [];
let setValue: (v: number) => void = () => {};

function Host() {
  const [value, set] = React.useState(0);
  setValue = set;
  return React.createElement(GhostSlider, {
    value,
    min: 0,
    max: 100,
    step: 1,
    onValueChange: set,
    onValueCommit: (v: number) => w.__commits.push(v),
  });
}

w.__set = (v) => {
  flushSync(() => setValue(v));
  w.__commits = [];
};
flushSync(() => createRoot(document.getElementById('root')!).render(React.createElement(Host)));
