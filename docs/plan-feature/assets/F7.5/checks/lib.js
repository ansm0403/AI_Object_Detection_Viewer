// Shared helpers for the F7.5 step checks (real app on :3100, production build).
// See README.md in this folder for how to run them.
//
// `playwright` resolves from the repository's node_modules (it comes with
// `@playwright/test` in the root package.json), so run the scripts from inside
// the repository. Nothing is written into the repository: captures, result
// files and downloaded exports go to CHECK_OUT (default: the system temp folder).
const { chromium } = require('playwright');
const os = require('os');
const path = require('path');
const fs = require('fs');

const URL = process.env.CHECK_URL || 'http://localhost:3100';
const OUT = process.env.CHECK_OUT || path.join(os.tmpdir(), 'ai-detection-viewer-checks');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

function makeChecker(name) {
  const results = [];
  const check = (label, ok, detail = '') => {
    results.push({ label, ok: !!ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  };
  const done = () => {
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${name}: ${results.length - failed} / ${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
    fs.writeFileSync(path.join(OUT, `${name}.result.json`), JSON.stringify(results, null, 1));
    return failed;
  };
  return { check, done, results };
}

async function launch() {
  return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
}

async function openApp(context, { width = 1536, height = 700 } = {}) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForSelector('section[aria-label="3D view"] canvas', { timeout: 60000 });
  await page.waitForTimeout(2500);
  return page;
}

const mode = (page, name) => page.getByRole('button', { name, exact: true }).click();

/** Wait until every scene's boxes are in memory: the picker's count reads "n / 10" — instead poll the sample. */
async function text(page, selector) {
  return (await page.locator(selector).first().innerText()).replace(/\s+/g, ' ').trim();
}

/** Is `inner` fully inside `outer` (1px tolerance)? */
const inside = (inner, outer) =>
  inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.width <= outer.x + outer.width + 1 && inner.y + inner.height <= outer.y + outer.height + 1;

/** Elements whose text is clipped (scrollWidth > clientWidth) or that stick out of `rootSelector`. */
async function clipped(page, rootSelector, itemSelector) {
  return page.evaluate(
    ({ rootSelector, itemSelector }) => {
      const root = document.querySelector(rootSelector);
      if (!root) return [`no root ${rootSelector}`];
      const outer = root.getBoundingClientRect();
      const bad = [];
      for (const el of root.querySelectorAll(itemSelector)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const label = (el.textContent || '').trim().slice(0, 40);
        if (el.scrollWidth > el.clientWidth + 1) bad.push(`text cut: "${label}" (${el.scrollWidth} > ${el.clientWidth})`);
        if (r.left < outer.left - 1 || r.right > outer.right + 1) bad.push(`outside horizontally: "${label}"`);
      }
      return bad;
    },
    { rootSelector, itemSelector },
  );
}

const noPageScroll = (page) =>
  page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollHeight <= d.clientHeight && d.scrollWidth <= d.clientWidth;
  });

module.exports = { URL, OUT, SHOTS, makeChecker, launch, openApp, mode, text, inside, clipped, noPageScroll };
