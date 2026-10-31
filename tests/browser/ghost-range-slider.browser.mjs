// Browser check for GhostRangeSlider (jsdom cannot lay out a drag): in headless Chromium, drag
// each thumb and check that its ghost's centre is the thumb's pre-drag centre within 0.5px, that
// the thumbs never cross, that a drag commits exactly once, that the ghost is gone after
// release, and that the interactive area is at least 44px tall (tw-frontend-ux §8).
//
// Run: pnpm test:browser (needs a Chromium for playwright-core).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'tsup';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const TOLERANCE_PX = 0.5;
const out = mkdtempSync(join(tmpdir(), 'ghost-range-slider-'));
let browser;
let failures = 0;
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures += 1;
};

try {
  await build({
    entry: { page: join(here, 'ghost-range-slider.page.ts') },
    outDir: out, format: ['iife'], platform: 'browser', noExternal: [/.*/],
    env: { NODE_ENV: 'production' }, silent: true, config: false, dts: false,
  });
  const script = readFileSync(join(out, 'page.global.js'), 'utf8');
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 500, height: 200 }, deviceScaleFactor: 1 });
  await page.setContent('<!doctype html><html><body style="margin:40px"><div id="root" style="width:320px"></div></body></html>');
  await page.addScriptTag({ content: script });

  const area = page.locator('[data-slot="range-slider-track-area"]');
  const thumbs = page.locator('[role=slider]');
  const ghosts = page.locator('[data-slot="range-ghost-thumb"]');
  const centre = async (loc) => { const b = await loc.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

  const box = await area.boundingBox();
  check(box.height >= 44, `touch area is ${box.height}px tall (>= 44)`);

  for (const [label, start, side, targetFrac] of [
    ['low thumb from the start', [undefined, undefined], 0, 0.4],
    ['high thumb from the end', [undefined, undefined], 1, 0.6],
    ['low thumb from the middle', [900, 4900], 0, 0.1],
  ]) {
    await page.evaluate((v) => window.__set(v), start);
    const thumb = thumbs.nth(side);
    const before = await centre(thumb);
    await page.mouse.move(before.x, before.y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * targetFrac, before.y, { steps: 6 });
    const ghost = await centre(ghosts.first());
    check(Math.abs(ghost.x - before.x) <= TOLERANCE_PX, `${label}: ghost at the pre-drag centre (off by ${(ghost.x - before.x).toFixed(2)}px)`);
    await page.mouse.up();
    check((await ghosts.count()) === 0, `${label}: no ghost after release`);
    const commits = await page.evaluate(() => window.__commits.length);
    check(commits === 1, `${label}: one commit per drag (got ${commits})`);
  }

  // Thumbs never cross: drag the low thumb far past the high one.
  await page.evaluate((v) => window.__set(v), [100, 2500]);
  const low = await centre(thumbs.nth(0));
  await page.mouse.move(low.x, low.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, low.y, { steps: 6 });
  await page.mouse.up();
  const [v0, v1] = await page.evaluate(() => window.__value);
  check(v0 !== undefined && v1 !== undefined && v0 <= v1, `thumbs never cross (low ${v0}, high ${v1})`);
  const [c0, c1] = [await centre(thumbs.nth(0)), await centre(thumbs.nth(1))];
  check(Math.abs(c0.x - c1.x) <= TOLERANCE_PX, 'the low thumb stops at the high thumb');

  // Quantile layout: the middle of the track is the median of the data, not the middle value.
  await page.evaluate(() => window.__set([undefined, undefined]));
  const end = await centre(thumbs.nth(1));
  await page.mouse.move(end.x, end.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, end.y, { steps: 4 });
  await page.mouse.up();
  const median = await page.evaluate(() => window.__value[1]);
  check(median > 2300 && median < 2700, `the track's middle is the data's median (~2500, got ${median})`);
} finally {
  await browser?.close();
  rmSync(out, { recursive: true, force: true });
}
if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
console.log('all range-slider browser checks passed');
