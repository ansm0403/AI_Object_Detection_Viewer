// F8 step C, stress: a pointer move on EVERY painted frame (what a real mouse does), in the real
// app. The moves are dispatched inside the page from requestAnimationFrame, so nothing waits for
// the test runner. Production build on :3100.
// usage: node perf-c2.js <repoRoot> <swiftshader|gpu> <scene> <frameNo> [label]
const repo = process.argv[2];
const gl = process.argv[3] || 'gpu';
const scene = process.argv[4] || 'scene-0061';
const frameNo = process.argv[5] || '20';
const label = process.argv[6] || '';
const { chromium } = require(repo + '/node_modules/playwright');
const ARGS = gl === 'gpu' ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

/** Runs in the page: 3 s of frames, optionally dragging the box with one pointer move per frame. */
const WINDOW = (dragging) => new Promise((resolve) => {
  const svg = document.querySelector('section[aria-label="Top view"] svg');
  const box = svg && svg.querySelector('[data-part="box"]');
  const intervals = [];
  let cx = 0, cy = 0;
  const fire = (target, type, x, y) => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y }));
  if (dragging) {
    const r = box.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    fire(box, 'pointerdown', cx, cy);
  }
  const start = performance.now();
  let last = start;
  let moves = 0;
  const tick = (t) => {
    intervals.push(t - last);
    last = t;
    const elapsed = t - start;
    if (elapsed >= 3000) {
      if (dragging) { fire(svg, 'pointermove', cx, cy); fire(svg, 'pointerup', cx, cy); }
      resolve({ intervals: intervals.slice(1), moves });
      return;
    }
    if (dragging) {
      const a = (elapsed / 3000) * Math.PI * 2;
      fire(svg, 'pointermove', cx + Math.sin(a) * 50, cy + (1 - Math.cos(a)) * 25);
      moves += 1;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

(async () => {
  const browser = await chromium.launch({ args: ARGS });
  const context = await browser.newContext({ viewport: { width: 1536, height: 700 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto('http://localhost:3100', { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForSelector('section[aria-label="3D view"] canvas');
  await page.waitForTimeout(2500);
  if (scene !== 'scene-0916') {
    await page.locator('section[aria-label="Frames"] button', { hasText: /scene-/ }).first().click();
    await page.waitForTimeout(500);
    await page.getByText(scene).first().click();
    await page.waitForTimeout(4500);
  }
  await page.locator(`section[aria-label="Frames"] button[aria-label^="Frame ${frameNo}"]`).first().click();
  await page.waitForTimeout(2500);
  const boxes = await page.locator('section[aria-label="Objects"] li').count();
  await page.locator('section[aria-label="Objects"] li', { hasText: /^car/ }).first().click();
  await page.waitForTimeout(800);
  await page.keyboard.press('e');
  await page.waitForTimeout(1200);

  const script = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'ScriptDuration').value * 1000;
  const run = async (dragging) => {
    const js0 = await script();
    const r = await page.evaluate(WINDOW, dragging);
    const js1 = await script();
    const s = r.intervals.slice().sort((a, b) => a - b);
    return { fps: (r.intervals.length * 1000) / r.intervals.reduce((a, b) => a + b, 0), p95: s[Math.floor(s.length * 0.95)], max: s[s.length - 1], over25: r.intervals.filter((x) => x > 25).length, frames: r.intervals.length, js: (js1 - js0) / 3, moves: r.moves };
  };
  const out = [];
  for (const view of ['focus', 'split']) {
    if (view === 'split') { await page.keyboard.press('v'); await page.waitForTimeout(1800); }
    const idle = [];
    const drag = [];
    for (let i = 0; i < 3; i += 1) { idle.push(await run(false)); await page.waitForTimeout(300); drag.push(await run(true)); await page.waitForTimeout(500); }
    const idleJs = median(idle.map((x) => x.js));
    const dragJs = median(drag.map((x) => x.js));
    const movesPerSecond = median(drag.map((x) => x.moves)) / 3;
    out.push({
      view,
      idleFps: +median(idle.map((x) => x.fps)).toFixed(1),
      dragFps: +median(drag.map((x) => x.fps)).toFixed(1),
      dragP95Ms: +median(drag.map((x) => x.p95)).toFixed(1),
      dragMaxMs: drag.map((x) => x.max.toFixed(0)).join(' / '),
      dragFramesOver25ms: drag.map((x) => `${x.over25}/${x.frames}`).join('  '),
      idleJsMsPerSec: Math.round(idleJs),
      dragJsMsPerSec: Math.round(dragJs),
      movesPerSec: Math.round(movesPerSecond),
      extraJsMsPerMove: +((dragJs - idleJs) / movesPerSecond).toFixed(1),
    });
  }
  const stored = await page.evaluate(() => localStorage.getItem('ai-detection-viewer.box-edits'));
  await browser.close();
  console.log(JSON.stringify({ label, gl, scene, frameNo, boxes, storedAfter: stored ? Object.keys(JSON.parse(stored).state.edits.nuscenes).length : 0, rows: out }, null, 1));
})();
