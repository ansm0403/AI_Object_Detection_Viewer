// F8 step C: changing a box in the top view (move, sides, corners, turn, numbers), what
// follows it (3D view, photos), what is stored, undo / redo / revert, and what must NOT change
// (evaluation, search, the stored reviews). Real app, production build on :3100.
// usage: node c.js <repoRoot> <outDir>
const repo = process.argv[2];
const OUT = process.argv[3];
const fs = require('fs');
const path = require('path');
const { chromium } = require(repo + '/node_modules/playwright');
const URL = process.env.CHECK_URL || 'http://localhost:3100';
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(OUT, 'shots', name + '.png') });

const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
};

const SEL = {
  list: 'section[aria-label="Objects"]',
  view3d: 'section[aria-label="3D view"]',
  camera: 'section[aria-label="Camera image"]',
  thumbs: 'section[aria-label="Camera thumbnails"]',
  details: 'section[aria-label="Details"]',
  frames: 'section[aria-label="Frames"]',
  editor: 'section[aria-label="Top view"]',
};
const EDIT_KEY = 'ai-detection-viewer.box-edits';
const REVIEW_KEY = 'ai-detection-viewer.review';
const FRAME9 = '5b7cb170eee6468aa1fdbd3abcf63c5a';
const CAR = '52770232202d4ad1a98ed07d5b4c20b9';

async function open(browser, width = 1536, height = 700, setup) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    const target = new EventTarget();
    window.__THREE_DEVTOOLS__ = target;
    window.__renderers = [];
    window.__scenes = [];
    target.addEventListener('observe', (e) => {
      if (e.detail && e.detail.isWebGLRenderer) window.__renderers.push(e.detail);
      if (e.detail && e.detail.isScene) window.__scenes.push(e.detail);
    });
  });
  const page = await context.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(String(e)));
  if (setup) await setup(page);
  await page.goto(URL, { waitUntil: setup ? 'load' : 'networkidle', timeout: 120000 });
  await page.waitForSelector(`${SEL.view3d} canvas`, { timeout: 60000 });
  await page.waitForTimeout(2500);
  return { context, page };
}
const selectBox = async (page, frameNo, idPrefix) => {
  await page.locator(`${SEL.frames} button[aria-label^="Frame ${frameNo}"]`).first().click();
  await page.waitForTimeout(900);
  await page.locator(`${SEL.list} li`, { has: page.locator(`span.font-mono[title^="${idPrefix}"]`) }).first().click();
  await page.waitForTimeout(500);
};
const enterEditor = async (page, split = true) => {
  await page.keyboard.press('e');
  await page.waitForTimeout(900);
  if (split) {
    const pressed = await page.locator('button[aria-label="3D view next to the top view"]').getAttribute('aria-pressed');
    if (pressed !== 'true') { await page.keyboard.press('v'); await page.waitForTimeout(1500); }
  }
};
const centre = async (page, selector) => {
  const r = await page.locator(selector).first().boundingBox();
  return [r.x + r.width / 2, r.y + r.height / 2];
};
const handle = (page, name) => centre(page, `${SEL.editor} [data-handle="${name}"]`);
const fields = async (page) => Object.fromEntries(await Promise.all(['length', 'width', 'height', 'heading', 'lift'].map(async (f) => [f, Number(await page.locator(`${SEL.details} input[data-field="${f}"]`).inputValue())])));
const changeText = async (page) => (await page.locator('[data-part="change"]').innerText()).replace(/\s+/g, ' ').replace('Changed from the label: ', '');
const stored = (page) => page.evaluate((key) => { const v = localStorage.getItem(key); return v ? JSON.parse(v).state.edits : null; }, EDIT_KEY);
const storedCar = async (page) => { const e = await stored(page); return e ? e.nuscenes[`${FRAME9}/${CAR}`] || null : null; };
const rawStorage = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
/** Drag with the mouse from `from` to `to`; `during` runs before the button is released. */
async function drag(page, from, to, during) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 4 });
  await page.mouse.move(to[0], to[1], { steps: 4 });
  await page.waitForTimeout(120);
  const value = during ? await during() : undefined;
  await page.mouse.up();
  await page.waitForTimeout(350);
  return value;
}
/** World position of every box in the 3D scene (the parent group of each wireframe). */
const boxes3D = (page) => page.evaluate(() => {
  const scene = window.__scenes[window.__scenes.length - 1];
  const out = [];
  scene.traverse((o) => {
    if (o.isLineSegments && o.geometry && o.geometry.type === 'EdgesGeometry') {
      const p = o.parent.parent.position;
      const b = o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox);
      out.push([+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4), +(b.max.x - b.min.x).toFixed(4)]);
    }
  });
  return out;
});
const differing = (a, b) => a.length !== b.length ? -1 : a.filter((p, i) => p.some((v, k) => Math.abs(v - b[i][k]) > 1e-3)).length;
const cameraViewBox = (page) => page.evaluate(() => document.querySelector('section[aria-label="Camera image"] svg').getAttribute('viewBox'));
const marker = (page) => page.evaluate(() => {
  const button = [...document.querySelectorAll('section[aria-label="Camera thumbnails"] button')].find((b) => /sees the selected box/.test(b.getAttribute('aria-label')) && b.getAttribute('aria-pressed') === 'true');
  const m = button && [...button.querySelectorAll('span')].find((s) => s.style.left && s.style.top);
  return m ? `${m.style.left} ${m.style.top} ${m.style.width}` : null;
});
const activeCamera = (page) => page.evaluate(() => { const b = document.querySelector('section[aria-label="Camera thumbnails"] button[aria-pressed="true"]'); return b ? b.getAttribute('aria-label').split(',')[0] : null; });
const header = (page) => page.evaluate(() => document.querySelector('header').innerText.replace(/\s+/g, ' '));
const drawCalls = (page) => page.evaluate(async () => {
  const renderer = window.__renderers[window.__renderers.length - 1];
  const seen = [];
  for (let i = 0; i < 20; i += 1) { await new Promise((r) => requestAnimationFrame(r)); seen.push(renderer.info.render.calls); }
  seen.sort((a, b) => a - b);
  return seen[Math.floor(seen.length / 2)];
});
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  // =====================================================================
  // 1. dragging, and what follows it
  // =====================================================================
  {
    const { context, page } = await open(browser);
    await page.evaluate(() => { document.querySelector('section[aria-label="3D view"] canvas').__mark = 'same'; });
    // leave a review record first: edits must not touch it
    await selectBox(page, 9, '527702');
    await page.keyboard.press('r');
    await page.keyboard.press('2');
    await page.waitForTimeout(300);
    const reviewsBefore = await rawStorage(page, REVIEW_KEY);
    const scene0 = await boxes3D(page);
    const calls0 = await drawCalls(page);
    check('C · before any edit: nothing is stored under the edit key', (await rawStorage(page, EDIT_KEY)) === null || (await storedCar(page)) === null);

    await enterEditor(page);
    const f0 = await fields(page);
    const mpp = await page.evaluate(() => { const svg = document.querySelector('section[aria-label="Top view"] svg'); return Number(svg.getAttribute('viewBox').split(' ')[2]) / svg.getBoundingClientRect().width; });

    // ---- move -----------------------------------------------------------
    const c0 = await centre(page, `${SEL.editor} [data-part="box"]`);
    const photo0 = await cameraViewBox(page);
    const marker0 = await marker(page);
    const mid = await drag(page, c0, [c0[0] + 42, c0[1] - 28], async () => ({
      scene: await boxes3D(page),
      photo: await cameraViewBox(page),
      marker: await marker(page),
      stored: await storedCar(page),
      text: await changeText(page),
      undo: await page.locator('button[aria-label="Undo"]').isDisabled(),
    }));
    const c1 = await centre(page, `${SEL.editor} [data-part="box"]`);
    check('C · move: the box follows the pointer (42 px right, 28 px up, within 1.5 px)', near(c1[0] - c0[0], 42, 1.5) && near(c1[1] - c0[1], -28, 1.5), `${(c1[0] - c0[0]).toFixed(1)}, ${(c1[1] - c0[1]).toFixed(1)}`);
    check('C · WHILE dragging: exactly one box of the 3D scene has moved', differing(scene0, mid.scene) === 1, `${differing(scene0, mid.scene)} differ`);
    const movedBox = mid.scene.find((p, i) => p.some((v, k) => Math.abs(v - scene0[i][k]) > 1e-3));
    const was = scene0[mid.scene.indexOf(movedBox)];
    check('C · WHILE dragging: it moved by what the top view shows (x +42 px, z −28 px in metres)', movedBox && near(movedBox[0] - was[0], 42 * mpp, 0.03) && near(movedBox[2] - was[2], -28 * mpp, 0.03), movedBox ? `${(movedBox[0] - was[0]).toFixed(3)} m, ${(movedBox[2] - was[2]).toFixed(3)} m (expected ${(42 * mpp).toFixed(3)}, ${(-28 * mpp).toFixed(3)})` : '');
    check('C · WHILE dragging: the photo follows (its zoom region moved with the box)', mid.photo !== photo0, `${photo0} -> ${mid.photo}`);
    check('C · WHILE dragging: the thumbnail marker of the box moved', mid.marker !== null && mid.marker !== marker0, `${marker0} -> ${mid.marker}`);
    check('C · WHILE dragging: nothing is stored yet, and it is not an undo step yet', mid.stored === null && mid.undo === true);
    check('C · WHILE dragging: the panel already says how far', /^moved \d\.\d\d m$/.test(mid.text), mid.text);
    const s1 = await storedCar(page);
    check('C · on release the edit is stored (frame id, object id, seven numbers, a time)', s1 && s1.frameId === FRAME9 && s1.objectId === CAR && s1.translation.length === 3 && s1.size.length === 3 && typeof s1.yaw === 'number' && /^2026-/.test(s1.editedAt), JSON.stringify(s1).slice(0, 120));
    const f1 = await fields(page);
    check('C · move changes no number of the panel (length, width, height, heading, up/down)', JSON.stringify(f1) === JSON.stringify(f0), JSON.stringify(f1));
    const expectedMove = Math.hypot(42, 28) * mpp;
    check('C · "moved" in the panel is the distance dragged', near(Number((await changeText(page)).match(/moved (\d+\.\d+) m/)[1]), expectedMove, 0.02), `${await changeText(page)} (dragged ${expectedMove.toFixed(2)} m)`);
    check('C · the dataset label is now drawn as a dashed outline', (await page.locator(`${SEL.editor} [data-part="label"]`).count()) === 1);
    check('C · Undo and Revert are enabled, Redo is not', !(await page.locator('button[aria-label="Undo"]').isDisabled()) && !(await page.locator('button[aria-label="Revert to label"]').isDisabled()) && (await page.locator('button[aria-label="Redo"]').isDisabled()));
    check('C · the stored reviews are byte for byte what they were', (await rawStorage(page, REVIEW_KEY)) === reviewsBefore);
    check('C · the review verdict is unchanged ("The verdict stays Rejected · wrong size")', /The verdict stays Rejected · wrong size/.test((await page.locator('[data-part="verdict"]').innerText()).replace(/\s+/g, ' ')));
    await shot(page, 'c1_moved');

    // ---- a side: the opposite side stays -----------------------------------
    for (const [side, opposite, key] of [['front', 'back', 'length'], ['left', 'right', 'width']]) {
      const from = await handle(page, side);
      const far0 = await handle(page, opposite);
      const c = await centre(page, `${SEL.editor} [data-part="box"]`);
      // 24 px further out, along the line from the centre through the handle
      const d = Math.hypot(from[0] - c[0], from[1] - c[1]);
      const to = [from[0] + ((from[0] - c[0]) / d) * 24, from[1] + ((from[1] - c[1]) / d) * 24];
      const before = await fields(page);
      await drag(page, from, to);
      const after = await fields(page);
      const far1 = await handle(page, opposite);
      check(`C · ${side} handle: the ${key} grows by what was dragged (24 px)`, near(after[key] - before[key], 24 * mpp, 0.03), `${before[key]} -> ${after[key]} (expected +${(24 * mpp).toFixed(2)})`);
      check(`C · ${side} handle: the ${opposite} side stays where it is (within 1 px)`, near(far1[0], far0[0], 1) && near(far1[1], far0[1], 1), `${(far1[0] - far0[0]).toFixed(2)}, ${(far1[1] - far0[1]).toFixed(2)}`);
      check(`C · ${side} handle: nothing else changes`, ['length', 'width', 'height', 'heading', 'lift'].every((k) => k === key || after[k] === before[k]));
    }
    // ---- a corner: the opposite corner stays -------------------------------
    {
      const from = await handle(page, 'front-right');
      const far0 = await handle(page, 'back-left');
      const before = await fields(page);
      await drag(page, from, [from[0] + 14, from[1] + 18]);
      const after = await fields(page);
      const far1 = await handle(page, 'back-left');
      check('C · corner handle: length AND width change', after.length !== before.length && after.width !== before.width, `${before.length}×${before.width} -> ${after.length}×${after.width}`);
      check('C · corner handle: the opposite corner stays where it is (within 1 px)', near(far1[0], far0[0], 1) && near(far1[1], far0[1], 1));
    }
    // ---- shrinking stops at the minimum --------------------------------------
    {
      const from = await handle(page, 'left');
      const to = await handle(page, 'right');
      // Where the right side is ON THE MAP, from the stored numbers: centre − left axis × width / 2.
      const rightSide = (e) => [e.translation[0] + Math.sin(e.yaw) * (e.size[0] / 2), e.translation[1] - Math.cos(e.yaw) * (e.size[0] / 2)];
      const far0 = rightSide(await storedCar(page));
      await drag(page, from, [to[0] + (to[0] - from[0]) * 3, to[1] + (to[1] - from[1]) * 3]);
      const after = await fields(page);
      const far1 = rightSide(await storedCar(page));
      check('C · a side dragged through the box stops at the smallest size (0.10 m)', after.width === 0.1, `${after.width}`);
      check('C · … and the other side still has not moved (stored numbers, within a millimetre)', near(far1[0], far0[0], 1e-3) && near(far1[1], far0[1], 1e-3), `${(far1[0] - far0[0]).toExponential(1)}, ${(far1[1] - far0[1]).toExponential(1)}`);
      check('C · a box 0.10 m wide is too small on screen for handles: they are not offered, and the view says to zoom in', (await page.locator(`${SEL.editor} [data-handle="front"]`).count()) === 0 && (await page.locator(`${SEL.editor} [data-part="zoom-hint"]`).count()) === 1);
      await page.locator('button[aria-label="Undo"]').click();
      await page.waitForTimeout(300);
    }
    // ---- turn ------------------------------------------------------------------
    {
      const c = await centre(page, `${SEL.editor} [data-part="box"]`);
      const from = await handle(page, 'rotate');
      const before = await fields(page);
      const a = (30 * Math.PI) / 180; // standard rotation matrix with y down = clockwise on screen
      const to = [c[0] + (from[0] - c[0]) * Math.cos(a) - (from[1] - c[1]) * Math.sin(a), c[1] + (from[0] - c[0]) * Math.sin(a) + (from[1] - c[1]) * Math.cos(a)];
      await drag(page, from, to);
      const after = await fields(page);
      const c2 = await centre(page, `${SEL.editor} [data-part="box"]`);
      let turned = after.heading - before.heading;
      if (turned > 180) turned -= 360;
      if (turned < -180) turned += 360;
      check('C · knob: swinging it 30° clockwise on screen turns the box 30° clockwise (heading −30°)', near(turned, -30, 1), `${before.heading} -> ${after.heading} (${turned.toFixed(1)}°)`);
      check('C · knob: the box turns about its centre (the centre stays within 1.5 px)', near(c2[0], c[0], 1.5) && near(c2[1], c[1], 1.5));
      check('C · knob: sizes unchanged', after.length === before.length && after.width === before.width && after.height === before.height);
      check('C · the panel lists what changed, in words', /moved .* · length .* · width .* · turned −30\.\d°|moved .* · length .* · width .* · turned −29\.\d°/.test(await changeText(page)), await changeText(page));
    }
    await shot(page, 'c2_resized_turned');

    // ---- numbers ---------------------------------------------------------------
    const type = async (name, text, key = 'Enter') => {
      const input = page.locator(`${SEL.details} input[data-field="${name}"]`);
      await input.click();
      await input.fill(text);
      await input.press(key);
      await page.waitForTimeout(350);
    };
    {
      const c = await centre(page, `${SEL.editor} [data-part="box"]`);
      await type('length', '5.00');
      const c2 = await centre(page, `${SEL.editor} [data-part="box"]`);
      check('C · typing a length sets it and keeps the centre', (await fields(page)).length === 5 && near(c2[0], c[0], 1) && near(c2[1], c[1], 1));
      const s0 = await storedCar(page);
      const z0 = s0.translation[2];
      await type('height', '2.00');
      const s = await storedCar(page);
      check('C · typing a height sets it and keeps the BOTTOM (the centre rises by half, Up/down stays 0.00)', (await fields(page)).height === 2 && (await fields(page)).lift === 0 && near(s.translation[2] - z0, (2 - s0.size[2]) / 2, 1e-9), `centre z +${(s.translation[2] - z0).toFixed(3)}`);
      await type('lift', '0.30');
      const s2 = await storedCar(page);
      check('C · typing Up/down 0.30 lifts the box by 0.30 m ("raised 0.30 m") and changes nothing else', near(s2.translation[2] - s.translation[2], 0.3, 1e-6) && /raised 0\.30 m/.test(await changeText(page)) && s2.translation[0] === s.translation[0] && s2.size.join() === s.size.join());
      await type('heading', '90');
      check('C · typing a heading of 90 turns the front to the car\'s left', (await fields(page)).heading === 90);
      await type('lift', '-0,15'); // a decimal comma, as a Korean / German keyboard layout may give
      check('C · a decimal comma is read as a decimal point', (await fields(page)).lift === -0.15 && /lowered 0\.15 m/.test(await changeText(page)), `${(await fields(page)).lift}`);
      const before = JSON.stringify(await storedCar(page));
      await type('width', 'abc');
      check('C · text that is not a number changes nothing', JSON.stringify(await storedCar(page)) === before && (await fields(page)).width > 0);
      await type('width', '9.99', 'Escape');
      check('C · Escape in a field puts the value back and keeps the editor open', JSON.stringify(await storedCar(page)) === before && (await page.locator(SEL.editor).count()) === 1);
      const shown = await page.locator(`${SEL.details} input[data-field="length"]`).inputValue();
      await type('length', shown);
      check('C · entering the number that is already shown is not a change (no rounding of the stored value)', JSON.stringify(await storedCar(page)) === before);
      check('C · typing in a field does not trigger shortcuts (no verdict key, the editor stays in split view)', (await page.locator('button[aria-label="3D view next to the top view"]').getAttribute('aria-pressed')) === 'true');
    }
    // the photo and the 3D view show the final box
    const scene1 = await boxes3D(page);
    check('C · after all edits exactly one box of the 3D scene differs from the dataset', differing(scene0, scene1) === 1);
    await shot(page, 'c3_numbers');

    // ---- undo / redo / revert ----------------------------------------------------
    {
      const states = [JSON.stringify(await storedCar(page))];
      const undo = page.locator('button[aria-label="Undo"]');
      const redo = page.locator('button[aria-label="Redo"]');
      let steps = 0;
      while (!(await undo.isDisabled()) && steps < 40) { await undo.click(); await page.waitForTimeout(120); states.push(JSON.stringify(await storedCar(page))); steps += 1; }
      check('C · Undo walks back one change at a time to the dataset label (10 changes were made)', steps === 10, `${steps} steps`);
      check('C · … and at the label there is NO stored edit (an edit equal to the label does not exist)', (await storedCar(page)) === null && (await changeText(page)).startsWith('nothing'));
      check('C · … and the 3D scene is exactly the dataset again', differing(scene0, await boxes3D(page)) === 0);
      check('C · … and the dashed label outline is gone', (await page.locator(`${SEL.editor} [data-part="label"]`).count()) === 0);
      let redone = 0;
      while (!(await redo.isDisabled()) && redone < 40) { await redo.click(); await page.waitForTimeout(120); redone += 1; }
      check('C · Redo walks forward again to the last change', redone === 10 && JSON.stringify({ ...(await storedCar(page)), editedAt: '' }) === JSON.stringify({ ...JSON.parse(states[0]), editedAt: '' }), `${redone} steps`);
      await undo.click(); await undo.click(); await page.waitForTimeout(250);
      const c = await centre(page, `${SEL.editor} [data-part="box"]`);
      await drag(page, c, [c[0] - 10, c[1] + 6]);
      check('C · a new change after an undo drops what was ahead (Redo is disabled)', await redo.isDisabled());
      await page.locator('button[aria-label="Revert to label"]').click();
      await page.waitForTimeout(350);
      check('C · Revert to label removes the edit', (await storedCar(page)) === null && differing(scene0, await boxes3D(page)) === 0 && (await page.locator('button[aria-label="Revert to label"]').isDisabled()));
      await undo.click();
      await page.waitForTimeout(350);
      check('C · … and Revert is itself undoable (the edit is back)', (await storedCar(page)) !== null);
    }

    // ---- what must NOT change -----------------------------------------------------
    check('C · the stored reviews are still byte for byte what they were', (await rawStorage(page, REVIEW_KEY)) === reviewsBefore);
    check('C · the 3D canvas was never re-created', await page.evaluate(() => document.querySelector('section[aria-label="3D view"] canvas').__mark === 'same'));
    const editedScene = await boxes3D(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    check('C · after Done the edited box stays where it was put (review mode)', differing(editedScene, await boxes3D(page)) === 0 && differing(scene0, await boxes3D(page)) === 1);
    check('C · draw calls are what they were before editing (nothing was added to the 3D scene)', (await drawCalls(page)) === calls0, `${await drawCalls(page)} vs ${calls0}`);
    check('C · the review panel now offers "Edited · edit"', (await page.getByRole('button', { name: /Edited · edit/ }).count()) === 1);

    // evaluation is computed from the dataset's boxes
    await page.getByRole('button', { name: 'Evaluate', exact: true }).click();
    await page.waitForTimeout(2500);
    const evalHeader = await header(page);
    check('C · Evaluate with an edited box: still Precision 77% / Recall 68% for scene-0916', /Precision 77%/.test(evalHeader) && /Recall 68%/.test(evalHeader), evalHeader.slice(-70));
    check('C · Evaluate draws the DATASET box, not the edited one', differing(scene0, await boxes3D(page)) === 0);
    const frame9 = await page.locator(`${SEL.details}`).innerText();
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Crowded', exact: true }).click();
    await page.waitForFunction(() => /177\s*of\s*404/.test(document.querySelector('header').innerText), null, { timeout: 60000 }).catch(() => undefined);
    check('C · Explore with an edited box: "Crowded" still matches 177 of 404 frames in 7 of 10 scenes', /177\s*of\s*404\s*frames match · 7 of 10 scenes/.test(await header(page)), (await header(page)).slice(0, 160));
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.waitForTimeout(1500);
    check('C · back in Review the edited box is drawn again', differing(scene0, await boxes3D(page)) === 1);
    void frame9;

    // ---- survives a reload ------------------------------------------------------------
    const beforeReload = JSON.stringify(await storedCar(page));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector(`${SEL.view3d} canvas`);
    await page.waitForTimeout(2500);
    await selectBox(page, 9, '527702');
    check('C · after a reload the edit is still stored and the box is drawn edited', JSON.stringify(await storedCar(page)) === beforeReload && (await page.getByRole('button', { name: /Edited · edit/ }).count()) === 1);
    await enterEditor(page);
    check('C · reopening the editor shows the edit against the dashed label, with nothing to undo yet', (await page.locator(`${SEL.editor} [data-part="label"]`).count()) === 1 && (await page.locator('button[aria-label="Undo"]').isDisabled()) && !(await changeText(page)).startsWith('nothing'));
    check('C · no page errors', page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  // =====================================================================
  // 2. when the box may not be changed, and the camera after a change
  // =====================================================================
  {
    const { context, page } = await open(browser);
    await selectBox(page, 9, '527702');
    await enterEditor(page);
    // playing
    await page.getByRole('button', { name: /^Play/ }).first().click({ force: true });
    await page.waitForTimeout(250);
    const note = await page.locator(`${SEL.editor} [data-part="locked"]`).innerText().catch(() => '');
    const c = await centre(page, `${SEL.editor} [data-part="box"]`).catch(() => null);
    if (c) await drag(page, c, [c[0] + 30, c[1]]);
    check('C · while the sequence plays the box cannot be dragged and the view says why', /Pause playback/.test(note) && (await storedCar(page)) === null, note);
    await page.getByRole('button', { name: /^Pause/ }).first().click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(600);
    // the list is under the editor: go back to frame 9 on the timeline (the object stays selected)
    await page.locator(`${SEL.frames} button[aria-label^="Frame 9"]`).first().click();
    await page.waitForTimeout(1200);
    check('C · after pausing, back on frame 9, the editor is on the same box and unlocked', /car 527702 · frame 9/.test(await page.evaluate(() => document.querySelector('main').parentElement.children[1].innerText.replace(/\s+/g, ' '))) && (await page.locator(`${SEL.editor} [data-part="locked"]`).count()) === 0);

    // the camera after a change: move the box far behind the car
    const camBefore = await activeCamera(page);
    const farBefore = await fields(page);
    await page.locator(`${SEL.details} input[data-field="lift"]`).waitFor();
    // zoom out so the car and the space behind it are on screen, then drag the box there
    const ed = await page.locator(SEL.editor).boundingBox();
    await page.mouse.move(ed.x + ed.width / 2, ed.y + ed.height / 2);
    for (let i = 0; i < 9; i += 1) { await page.mouse.wheel(0, 240); await page.waitForTimeout(40); }
    await page.waitForTimeout(300);
    const tiny = await page.locator(`${SEL.editor} [data-part="box"]`).boundingBox();
    console.log(`      zoomed out as far as it goes: the box is ${Math.round(tiny.width)}×${Math.round(tiny.height)} px on screen`);
    check('C · zoomed far out: the handles are not offered and the view says "Zoom in to resize or turn the box"', (await page.locator(`${SEL.editor} [data-handle="front"]`).count()) === 0 && (await page.locator(`${SEL.editor} [data-part="zoom-hint"]`).count()) === 1);
    const from = await centre(page, `${SEL.editor} [data-part="box"]`);
    const car = await centre(page, `${SEL.editor} [data-part="car"]`);
    const to = [car[0] + (car[0] - from[0]), car[1] + (car[1] - from[1]) + 40];
    const during = await drag(page, from, to, () => activeCamera(page));
    const camAfter = await activeCamera(page);
    const afterFar = await fields(page);
    check('C · zoomed far out (the box only a few pixels wide), dragging its middle still MOVES it — no size changed', JSON.stringify([afterFar.length, afterFar.width]) === JSON.stringify([farBefore.length, farBefore.width]) && /^moved /.test(await changeText(page)), `${JSON.stringify(afterFar)} · ${await changeText(page)}`);
    check('C · the photo does not switch camera WHILE dragging', during === camBefore, `${camBefore} -> ${during}`);
    check('C · on release, when the photo no longer shows the box, the camera that does is shown', camAfter !== camBefore && (await page.locator(`${SEL.thumbs} button[aria-pressed="true"]`).getAttribute('aria-label')).includes('sees the selected box'), `${camBefore} -> ${camAfter}`);
    await shot(page, 'c4_camera_follows');
    await page.locator('button[aria-label="Revert to label"]').click();
    await page.waitForTimeout(400);

    // a pointer that is taken away mid-drag: the change is dropped
    const c3 = await centre(page, `${SEL.editor} [data-part="box"]`);
    await page.mouse.move(c3[0], c3[1]);
    await page.mouse.down();
    await page.mouse.move(c3[0] + 30, c3[1] + 10, { steps: 3 });
    await page.waitForTimeout(100);
    await page.evaluate(() => document.querySelector('section[aria-label="Top view"] svg').dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(300);
    check('C · a drag that is interrupted (pointercancel) changes nothing', (await storedCar(page)) === null && (await changeText(page)).startsWith('nothing'));

    // wheel and background drag still only move the VIEW
    const before = await fields(page);
    await page.mouse.move(ed.x + 30, ed.y + ed.height - 80);
    await page.mouse.down();
    await page.mouse.move(ed.x + 90, ed.y + ed.height - 120, { steps: 4 });
    await page.mouse.up();
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(300);
    check('C · dragging the background and the wheel move the view, not the box', (await storedCar(page)) === null && JSON.stringify(await fields(page)) === JSON.stringify(before));

    // hidden by a filter: cannot be entered; if hidden while open, locked
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    check('C · no page errors (blocked / camera)', page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  // =====================================================================
  // 3. the points: late, and not at all
  // =====================================================================
  {
    const { context, page } = await open(browser, 1536, 700, async (p) => {
      await p.route('**/points/5b7cb170eee6468aa1fdbd3abcf63c5a.json', (route) => setTimeout(() => route.continue(), 6000));
    });
    await selectBox(page, 9, '527702');
    await enterEditor(page, false);
    const note = await page.locator(`${SEL.editor} [data-part="locked"]`).innerText().catch(() => '');
    const c = await centre(page, `${SEL.editor} [data-part="box"]`);
    await drag(page, c, [c[0] + 30, c[1]]);
    check('C · while the points are still loading the box cannot be changed, and the view says so', /Loading the LiDAR points/.test(note) && (await storedCar(page)) === null && (await page.locator(`${SEL.details} input[data-field="length"]`).isDisabled()), note);
    check('C · … the name tag says "loading points…" and the panel "loading…"', /loading points/.test(await page.locator(SEL.editor).innerText()) && /In view loading/.test((await page.locator(SEL.details).innerText()).replace(/\s+/g, ' ')));
    await shot(page, 'c5_points_loading');
    await page.waitForFunction(() => !document.querySelector('section[aria-label="Top view"] [data-part="locked"]'), null, { timeout: 20000 });
    const c2 = await centre(page, `${SEL.editor} [data-part="box"]`);
    await drag(page, c2, [c2[0] + 30, c2[1]]);
    check('C · once the points have arrived the box can be changed', (await storedCar(page)) !== null);
    await context.close();
  }
  {
    const { context, page } = await open(browser, 1536, 700, async (p) => {
      await p.route('**/points/5b7cb170eee6468aa1fdbd3abcf63c5a.json', (route) => route.abort());
    });
    await selectBox(page, 9, '527702');
    await enterEditor(page, false);
    await page.waitForTimeout(600);
    const text = await page.locator(SEL.editor).innerText();
    const c = await centre(page, `${SEL.editor} [data-part="box"]`);
    await drag(page, c, [c[0] + 30, c[1]]);
    check('C · when the points could not be fetched the view says "points unavailable" and the box can still be changed (the photos remain)', /points unavailable/.test(text) && (await storedCar(page)) !== null && /points unavailable/.test((await page.locator(SEL.details).innerText())));
    await shot(page, 'c6_points_failed');
    check('C · no page errors (points)', page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  // =====================================================================
  // 4. the panel with a long "Changed" line, at the shortest and narrowest panels
  // =====================================================================
  for (const [w, h] of [[1536, 700], [1024, 768], [1280, 720]]) {
    const { context, page } = await open(browser, w, h);
    await selectBox(page, 9, '527702');
    await enterEditor(page, false);
    const c = await centre(page, `${SEL.editor} [data-part="box"]`);
    await drag(page, c, [c[0] + 25, c[1] - 12]);
    const type = async (name, text) => { const i = page.locator(`${SEL.details} input[data-field="${name}"]`); await i.click(); await i.fill(text); await i.press('Enter'); await page.waitForTimeout(250); };
    await type('length', '5.40'); await type('width', '2.10'); await type('height', '2.00'); await type('heading', '-120.5'); await type('lift', '-0.25');
    const info = await page.evaluate(() => {
      const panel = document.querySelector('section[aria-label="Details"]').getBoundingClientRect();
      const bad = [];
      for (const el of document.querySelectorAll('section[aria-label="Details"] input[data-field]')) {
        if (el.scrollWidth > el.clientWidth + 1) bad.push(`cut ${el.value}`);
        if (el.getBoundingClientRect().bottom > panel.bottom) bad.push(`below ${el.dataset.field}`);
      }
      const change = document.querySelector('[data-part="change"]').getBoundingClientRect();
      if (change.bottom > panel.bottom) bad.push('change line below the panel');
      const bar = document.querySelector('main').parentElement.children[1].firstElementChild;
      if (bar.scrollWidth > bar.clientWidth + 1) bad.push('bar overflows');
      const d = document.documentElement;
      if (d.scrollHeight > d.clientHeight || d.scrollWidth > d.clientWidth) bad.push('page scroll');
      return { bad, text: document.querySelector('[data-part="change"]').innerText.replace(/\s+/g, ' ') };
    });
    check(`C · ${w}×${h}: with every number changed, no value is cut and the "Changed" line is visible without scrolling`, info.bad.length === 0, info.bad.join('; ') || info.text);
    if (w === 1536) await shot(page, 'c7_all_changed_1536x700');
    if (w === 1024) await shot(page, 'c7_all_changed_1024x768');
    await context.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nc: ${results.length - failed} / ${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
  fs.writeFileSync(path.join(OUT, 'c.result.json'), JSON.stringify(results, null, 1));
})();
