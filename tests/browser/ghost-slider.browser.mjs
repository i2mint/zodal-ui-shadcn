// Browser check for GhostSlider (jsdom cannot lay out a range input): in headless Chromium,
// press the thumb, drag it, and check that the ghost's centre is the thumb's pre-drag centre
// within 0.5px at min, middle and max, left-to-right and then right-to-left (where the browser
// mirrors the input and the ghost must mirror with it); then release and check the ghost is gone
// and exactly one commit fired; then drag with a finger (real touch events) and check the thumb
// lands where the finger was lifted; then check one commit per arrow-key press.
//
// Run: pnpm test:browser (needs a Chromium for playwright-core: `npx playwright-core install
// chromium` once). Not part of `pnpm test`, so CI does not need a browser.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'tsup';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const TOLERANCE_PX = 0.5;
const THUMB_PX = 16;
const out = mkdtempSync(join(tmpdir(), 'ghost-slider-'));
let browser;
let failures = 0;
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures += 1;
};

try {
  await build({
    entry: { page: join(here, 'ghost-slider.page.ts') },
    outDir: out,
    format: ['iife'],
    platform: 'browser',
    noExternal: [/.*/],
    env: { NODE_ENV: 'production' },
    silent: true,
    config: false,
    dts: false,
  });
  const script = readFileSync(join(out, 'page.global.js'), 'utf8');

  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 500, height: 200 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 40px; }
    #root { width: 320px; }
    input[type=range] { -webkit-appearance: none; appearance: none; height: ${THUMB_PX}px; background: transparent; }
    input[type=range]::-webkit-slider-runnable-track { height: 4px; background: rgb(200, 200, 200); }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: ${THUMB_PX}px; height: ${THUMB_PX}px;
      margin-top: -6px; background: rgb(255, 0, 0); border: 0; border-radius: 0; }
  </style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: script });

  const input = page.locator('input[type=range]');
  const ghost = page.locator('[data-slot="slider-ghost-thumb"]');

  /** The red thumb's centre x, in page px, read from a screenshot of the slider. */
  const thumbCentre = async () => {
    const box = await input.boundingBox();
    const png = (await input.screenshot()).toString('base64');
    const span = await page.evaluate(async (data) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { data: px } = ctx.getImageData(0, 0, img.width, img.height);
      let min = Infinity;
      let max = -Infinity;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const i = (y * img.width + x) * 4;
          if (px[i] > 200 && px[i + 1] < 60 && px[i + 2] < 60) {
            min = Math.min(min, x);
            max = Math.max(max, x);
          }
        }
      }
      return { min, max };
    }, png);
    if (!Number.isFinite(span.min)) throw new Error('thumb not found in the screenshot');
    return { x: box.x + (span.min + span.max + 1) / 2, y: box.y + box.height / 2 };
  };

  for (const [dir, start] of ['ltr', 'rtl'].flatMap((d) => [0, 30, 100].map((s) => [d, s]))) {
    await page.evaluate((d) => document.getElementById('root').setAttribute('dir', d), dir);
    await page.evaluate((v) => window.__set(v), start);
    const before = await thumbCentre();
    // Drag towards the middle: under RTL a higher value sits further left.
    const dx = (start === 100 ? -60 : 60) * (dir === 'rtl' ? -1 : 1);
    await page.mouse.move(before.x, before.y);
    await page.mouse.down();
    await page.mouse.move(before.x + dx, before.y, { steps: 6 });
    const g = await ghost.boundingBox();
    const ghostCentre = g ? g.x + g.width / 2 : NaN;
    check(Math.abs(ghostCentre - before.x) <= TOLERANCE_PX,
      `${dir} at ${start}: ghost centre ${ghostCentre.toFixed(2)} vs pre-drag thumb centre ${before.x.toFixed(2)}`);
    await page.mouse.up();
    check((await ghost.count()) === 0, `${dir} at ${start}: the ghost is gone after release`);
    const commits = await page.evaluate(() => window.__commits);
    check(commits.length === 1, `${dir} at ${start}: one commit per drag (got ${JSON.stringify(commits)})`);
  }

  // A finger (real touch events through CDP): the thumb lands where the finger is lifted, also
  // when the grab was off the thumb's centre, and also on the way right (the ghost then sits on
  // the filled part of the track, and must still show).
  await page.evaluate(() => document.getElementById('root').setAttribute('dir', 'ltr'));
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 8, radiusY: 8 }],
  });
  for (const [start, grabOffset, dx] of [[20, 5, 120], [80, -4, -150], [50, 0, 3]]) {
    await page.evaluate((v) => window.__set(v), start);
    const t0 = await thumbCentre();
    const x0 = t0.x + grabOffset;
    await touch('touchStart', x0, t0.y);
    for (let i = 1; i <= 8; i++) await touch('touchMove', x0 + (dx * i) / 8, t0.y);
    const ghostSeen = dx > 5 ? (await ghost.count()) === 1 : true;
    await touch('touchEnd');
    const after = await thumbCentre();
    const lifted = x0 + dx;
    if (Math.abs(dx) > 5) {
      check(Math.abs(after.x + grabOffset - lifted) <= 2, // within one step (3px here) of rounding
        `touch from ${start}, grabbed ${grabOffset}px off centre, moved ${dx}px: thumb + grab offset at ${(after.x + grabOffset).toFixed(1)}, finger lifted at ${lifted.toFixed(1)}`);
      check(ghostSeen, `touch from ${start} moving ${dx > 0 ? 'right' : 'left'}: the ghost shows while dragging`);
    } else {
      check(Math.abs(after.x - t0.x) <= 0.5, `a touch that moves under the slop does not move the thumb`);
    }
    const commits = await page.evaluate(() => window.__commits);
    check(commits.length === (Math.abs(dx) > 5 ? 1 : 0), `touch from ${start}: ${Math.abs(dx) > 5 ? 'one commit' : 'no commit'} (got ${JSON.stringify(commits)})`);
  }

  // A tap on the track moves the thumb there.
  await page.evaluate(() => window.__set(10));
  const box = await input.boundingBox();
  await touch('touchStart', box.x + box.width * 0.75, box.y + box.height / 2);
  await touch('touchEnd');
  const tapped = await page.evaluate(() => window.__commits);
  check(tapped.length === 1 && Math.abs(tapped[0] - 75) <= 1, `a tap on the track moves the thumb there (got ${JSON.stringify(tapped)})`);

  await page.evaluate(() => window.__set(50));
  await input.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const keyCommits = await page.evaluate(() => window.__commits);
  check(JSON.stringify(keyCommits) === JSON.stringify([51, 52]), `one commit per arrow-key press (got ${JSON.stringify(keyCommits)})`);
  check((await ghost.count()) === 0, 'no ghost from the keyboard');
} finally {
  await browser?.close();
  rmSync(out, { recursive: true, force: true });
}

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('all browser checks passed');
