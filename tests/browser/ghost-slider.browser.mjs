// Browser check for GhostSlider (jsdom cannot lay out a range input): in headless Chromium,
// press the thumb, drag it, and check that the ghost's centre is the thumb's pre-drag centre
// within 0.5px at min, middle and max; then release and check the ghost is gone and exactly
// one commit fired; then check one commit per arrow-key press.
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

  for (const start of [0, 30, 100]) {
    await page.evaluate((v) => window.__set(v), start);
    const before = await thumbCentre();
    const dx = start === 100 ? -60 : 60;
    await page.mouse.move(before.x, before.y);
    await page.mouse.down();
    await page.mouse.move(before.x + dx, before.y, { steps: 6 });
    const g = await ghost.boundingBox();
    const ghostCentre = g ? g.x + g.width / 2 : NaN;
    check(Math.abs(ghostCentre - before.x) <= TOLERANCE_PX,
      `at ${start}: ghost centre ${ghostCentre.toFixed(2)} vs pre-drag thumb centre ${before.x.toFixed(2)}`);
    await page.mouse.up();
    check((await ghost.count()) === 0, `at ${start}: the ghost is gone after release`);
    const commits = await page.evaluate(() => window.__commits);
    check(commits.length === 1, `at ${start}: one commit per drag (got ${JSON.stringify(commits)})`);
  }

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
