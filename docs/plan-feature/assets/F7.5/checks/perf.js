// F7.5: the 3D floor cost (draw calls on the 40-box frame) and how long the new interactions take.
const { URL, makeChecker, launch, mode } = require('./lib');

async function open(browser, width, height) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const target = new EventTarget();
    window.__THREE_DEVTOOLS__ = target;
    window.__renderers = [];
    target.addEventListener('observe', (e) => { if (e.detail && e.detail.isWebGLRenderer) window.__renderers.push(e.detail); });
  });
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForSelector('section[aria-label="3D view"] canvas');
  await page.waitForTimeout(5000);
  return { context, page };
}
const drawCalls = (page) => page.evaluate(async () => {
  const renderer = window.__renderers[window.__renderers.length - 1];
  if (!renderer) return null;
  const seen = [];
  for (let i = 0; i < 20; i += 1) { await new Promise((r) => requestAnimationFrame(r)); seen.push(renderer.info.render.calls); }
  seen.sort((a, b) => a - b);
  return seen[Math.floor(seen.length / 2)];
});
const timeUntil = async (page, action, predicate, arg) => {
  const start = Date.now();
  await action();
  await page.waitForFunction(predicate, arg, { timeout: 30000, polling: 'raf' });
  return Date.now() - start;
};

(async () => {
  const { check, done } = makeChecker('perf');
  const browser = await launch();

  for (const [w, h, expected] of [[1440, 900, 41], [1536, 700, 42]]) {
    const { context, page } = await open(browser, w, h);
    const header = await page.evaluate(() => document.querySelector('header').textContent);
    const calls = await drawCalls(page);
    check(`${w}×${h}: the 40-box frame (${/Frame 1\/41 · 40 detections/.test(header) ? 'scene-0916 frame 1' : header.slice(60, 100)}) draws in ${calls} calls — the floor is ${expected}`, calls === expected, String(calls));
    if (w === 1536) {
      await mode(page, 'Evaluate');
      await page.waitForTimeout(2000);
      const evalCalls = await drawCalls(page);
      check(`${w}×${h}: evaluate mode on the same frame: ${evalCalls} draw calls (the report and the sample check add no 3D objects)`, evalCalls === expected, String(evalCalls));
      await page.getByRole('button', { name: 'Report', exact: true }).click();
      await page.waitForSelector('[role="dialog"]');
      await page.waitForTimeout(1500);
      const withReport = await drawCalls(page);
      check(`${w}×${h}: with the report open the scene underneath still draws ${withReport} calls (nothing added, nothing re-created)`, withReport === expected, String(withReport));
      await page.keyboard.press('Escape');

      // how long the new interactions take (production build, software GL, one run each — indicative)
      const report = await timeUntil(page, () => page.getByRole('button', { name: 'Report', exact: true }).click(), () => !!document.querySelector('[role="dialog"] section[aria-label="Recall by drive"] tbody tr'));
      await page.keyboard.press('Escape');
      const enter = await timeUntil(page, () => page.getByRole('button', { name: 'Sample check', exact: true }).click(), () => document.querySelectorAll('ul[aria-label="Sampled boxes"] > li').length === 100 && document.querySelector('section[aria-label="Details"]').innerText.includes('box 1 of'));
      await page.waitForTimeout(1500);
      const other = await timeUntil(page, () => page.keyboard.press('a'), () => document.querySelector('section[aria-label="Details"]').innerText.includes('box 2 of'));
      await page.waitForTimeout(1500);
      await page.keyboard.press('u'); await page.waitForTimeout(2500);  // → box 3
      await page.keyboard.press('u'); await page.waitForTimeout(2500);  // → box 4 (scene-0061)
      const same = await timeUntil(page, () => page.keyboard.press('u'), () => document.querySelector('section[aria-label="Details"]').innerText.includes('box 5 of')); // box 5 is in the same scene
      console.log(`INFO  open the report: ${report} ms · enter the sample check (score all scenes, draw the sample, open box 1 in another scene): ${enter} ms · verdict → next box in ANOTHER scene: ${other} ms · verdict → next box in the SAME scene: ${same} ms`);
      check('the new interactions respond within a second each (indicative, software GL)', report < 1000 && other < 1000 && same < 1000, `${report} / ${enter} / ${other} / ${same}`);
    }
    await context.close();
  }
  const failed = done();
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
