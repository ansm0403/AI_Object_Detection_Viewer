// F8 step D: the "edited" marks (list row, 3D name tag, top bar, Selected section, evidence
// strip) and the keys of the editor (arrows, Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y).
// Real app, production build on :3100.
// usage: node d.js <repoRoot> <outDir>
const repo = process.argv[2];
const OUT = process.argv[3];
const fs = require('fs');
const path = require('path');
const { chromium } = require(repo + '/node_modules/playwright');
const URL = process.env.CHECK_URL || 'http://localhost:3100';
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const shot = (page, name, clip) => page.screenshot({ path: path.join(OUT, 'shots', name + '.png'), ...(clip ? { clip } : {}) });

const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
};

const SEL = {
  list: 'section[aria-label="Objects"]',
  view3d: 'section[aria-label="3D view"]',
  camera: 'section[aria-label="Camera image"]',
  details: 'section[aria-label="Details"]',
  frames: 'section[aria-label="Frames"]',
  editor: 'section[aria-label="Top view"]',
};
const EDIT_KEY = 'ai-detection-viewer.box-edits';
const REVIEW_KEY = 'ai-detection-viewer.review';
const FRAME9 = '5b7cb170eee6468aa1fdbd3abcf63c5a';
const CAR = '52770232202d4ad1a98ed07d5b4c20b9';

async function open(browser, width = 1536, height = 700, { seed, failEdits } = {}) {
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
  if (seed) {
    // stored values from an earlier visit (only when nothing is there yet: a reload keeps what the page wrote)
    await context.addInitScript((pairs) => {
      for (const [k, v] of pairs) if (v !== null && localStorage.getItem(k) === null) localStorage.setItem(k, v);
    }, seed);
  }
  if (failEdits) {
    // the browser refuses to store the EDITS (the reviews are still stored)
    await context.addInitScript((key) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(k, v) {
        if (k === key) throw new DOMException('full', 'QuotaExceededError');
        return original.call(this, k, v);
      };
    }, EDIT_KEY);
  }
  const page = await context.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForSelector(`${SEL.view3d} canvas`, { timeout: 60000 });
  await page.waitForTimeout(2500);
  return { context, page };
}
const gotoFrame = async (page, frameNo) => {
  await page.locator(`${SEL.frames} button[aria-label^="Frame ${frameNo}"]`).first().click();
  await page.waitForTimeout(900);
};
const row = (page, idPrefix) => page.locator(`${SEL.list} li`, { has: page.locator(`span.font-mono[title^="${idPrefix}"]`) }).first();
const selectBox = async (page, frameNo, idPrefix) => {
  await gotoFrame(page, frameNo);
  await row(page, idPrefix).click();
  await page.waitForTimeout(500);
};
const enterEditor = async (page) => {
  await page.keyboard.press('e');
  await page.waitForTimeout(900);
};
const centre = async (page, selector) => {
  const r = await page.locator(selector).first().boundingBox();
  return [r.x + r.width / 2, r.y + r.height / 2];
};
const boxCentre = (page) => centre(page, `${SEL.editor} [data-part="box"]`);
const changeText = async (page) => (await page.locator('[data-part="change"]').innerText()).replace(/\s+/g, ' ').replace('Changed from the label: ', '');
const stored = (page) => page.evaluate((key) => { const v = localStorage.getItem(key); return v ? JSON.parse(v).state.edits : null; }, EDIT_KEY);
const storedCar = async (page) => { const e = await stored(page); return e ? e.nuscenes[`${FRAME9}/${CAR}`] || null : null; };
const rawStorage = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const mpp = (page) => page.evaluate(() => { const svg = document.querySelector('section[aria-label="Top view"] svg'); return Number(svg.getAttribute('viewBox').split(' ')[2]) / svg.getBoundingClientRect().width; });
async function drag(page, from, to) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 4 });
  await page.mouse.move(to[0], to[1], { steps: 4 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(350);
}
const boxes3D = (page) => page.evaluate(() => {
  const scene = window.__scenes[window.__scenes.length - 1];
  const out = [];
  scene.traverse((o) => {
    if (o.isLineSegments && o.geometry && o.geometry.type === 'EdgesGeometry') {
      const p = o.parent.parent.position;
      out.push([+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)]);
    }
  });
  return out;
});
const differing = (a, b) => a.length !== b.length ? -1 : a.filter((p, i) => p.some((v, k) => Math.abs(v - b[i][k]) > 1e-3)).length;
const drawCalls = (page) => page.evaluate(async () => {
  const renderer = window.__renderers[window.__renderers.length - 1];
  const seen = [];
  for (let i = 0; i < 20; i += 1) { await new Promise((r) => requestAnimationFrame(r)); seen.push(renderer.info.render.calls); }
  seen.sort((a, b) => a - b);
  return seen[Math.floor(seen.length / 2)];
});
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
/** Every "edited" mark on screen, read by position and text. */
const marks = (page) => page.evaluate(() => {
  const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const text = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
  const rows = [...document.querySelectorAll('section[aria-label="Objects"] li')].filter((li) => li.querySelector('[data-edited]'));
  const count = document.querySelector('header [data-part="edited-count"]');
  const tag = [...document.querySelectorAll('section[aria-label="3D view"] *')].map((el) => (el.children.length === 0 ? el.textContent : '')).find((t) => /3D ·/.test(t)) || document.querySelector('section[aria-label="3D view"]').innerText.replace(/\s+/g, ' ');
  const note = document.querySelector('section[aria-label="Details"] [data-part="edit-note"]');
  return {
    rows: rows.map((li) => (li.querySelector('span.font-mono') || {}).title || '?').map((t) => t.slice(0, 6)),
    listRows: document.querySelectorAll('section[aria-label="Objects"] li').length,
    headerCount: count ? text(count) : null,
    headerCountVisible: visible(count),
    headerTitle: (document.querySelector('header [title^="Reviewed boxes"]') || { title: '' }).title,
    notSaved: /Not saved/i.test((document.querySelector('header [title^="Reviewed boxes"]') || { innerText: '' }).innerText),
    tag: (tag.match(/3D ·[^\n]*/) || [tag])[0].slice(0, 90),
    note: text(note),
    inLabel: document.querySelectorAll('[data-part="label-count"]').length,
  };
});
/** Is the top bar on one line, and how much room is left between its two halves? */
const topBar = (page) => page.evaluate(() => {
  const slot = document.querySelector('main').parentElement.children[0];
  const bar = slot.firstElementChild;
  let bottom = 0;
  for (const el of bar.querySelectorAll('*')) { const b = el.getBoundingClientRect(); if (b.width > 0) bottom = Math.max(bottom, b.bottom); }
  const groups = [...bar.children].map((g) => g.getBoundingClientRect());
  const d = document.documentElement;
  return { wraps: bottom > slot.getBoundingClientRect().bottom + 0.5, spare: groups.length === 2 ? Math.round(groups[1].left - groups[0].right) : null, pageScroll: d.scrollWidth > d.clientWidth || d.scrollHeight > d.clientHeight };
});
const key = (page, init) => page.evaluate((i) => { window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...i })); }, init);

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let seedEdits = null;
  let seedReviews = null;

  // =====================================================================
  // 1. the keys
  // =====================================================================
  {
    const { context, page } = await open(browser);
    await page.evaluate(() => { document.querySelector('section[aria-label="3D view"] canvas').__mark = 'same'; });
    await selectBox(page, 9, '527702');
    await page.keyboard.press('r');
    await page.keyboard.press('2');
    await page.waitForTimeout(300);
    const reviewsBefore = await rawStorage(page, REVIEW_KEY);
    const scene0 = await boxes3D(page);
    const calls0 = await drawCalls(page);
    const m0 = await marks(page);
    check('D · before any edit: no mark anywhere (list, 3D name tag, top bar, Selected, evidence strip)', m0.rows.length === 0 && m0.headerCount === null && !/edited/.test(m0.tag) && m0.note === null && m0.inLabel === 0 && !/edited/.test(m0.headerTitle), JSON.stringify(m0).slice(0, 200));

    // ---- too early: the 400 ms guard ----------------------------------------------
    await page.keyboard.press('e');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    check('D · an arrow pressed right after the editor opened (before the box was on screen 0.4 s) moves nothing', (await page.locator(SEL.editor).count()) === 1 && (await storedCar(page)) === null);
    await page.waitForTimeout(900);
    const ranges = await page.evaluate(() => [...document.querySelectorAll('input[type="range"]')].filter((el) => el.getBoundingClientRect().width > 0).length);
    check('D · while editing no slider is on screen (an arrow could not also move a slider)', ranges === 0, `${ranges} sliders`);

    const legend = await page.evaluate(() => {
      const ed = document.querySelector('section[aria-label="Top view"]').getBoundingClientRect();
      const l = document.querySelector('[data-part="legend"]').getBoundingClientRect();
      const s = document.querySelector('[data-part="scale"]').getBoundingClientRect();
      const k = document.querySelector('[data-part="legend-keys"]');
      const kr = k ? k.getBoundingClientRect() : null;
      return { keys: k ? k.innerText.trim() : null, inside: l.left >= ed.left && l.right <= ed.right && l.bottom <= ed.bottom && l.top >= ed.top, clear: l.right <= s.left || l.bottom <= s.top, keysInside: kr ? kr.right <= l.right + 0.5 && kr.bottom <= l.bottom + 0.5 : false, size: `${Math.round(l.width)}×${Math.round(l.height)}`, editor: Math.round(ed.width) };
    });
    check('D · the top view says how the arrow keys work ("Arrow keys: move 5 cm · with Shift: 50 cm"), inside the legend, clear of the scale bar', /Arrow keys: move 5 cm · with Shift: 50 cm/.test(legend.keys || '') && legend.inside && legend.clear && legend.keysInside, JSON.stringify(legend));

    // ---- one press: 5 cm, the way the screen shows it ------------------------------
    const scale = await mpp(page);
    const c0 = await boxCentre(page);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const c1 = await boxCentre(page);
    const s1 = await storedCar(page);
    check('D · → moves the box 5 cm to the right on screen, not up or down', near(c1[0] - c0[0], 0.05 / scale, 0.6) && near(c1[1] - c0[1], 0, 0.6), `${(c1[0] - c0[0]).toFixed(2)} px, ${(c1[1] - c0[1]).toFixed(2)} px (5 cm = ${(0.05 / scale).toFixed(2)} px)`);
    check('D · … the panel says "moved 0.05 m" and the edit is stored', (await changeText(page)) === 'moved 0.05 m' && s1 !== null, await changeText(page));
    const sceneAfter = await boxes3D(page);
    const movedIndex = sceneAfter.findIndex((p, i) => p.some((v, k) => Math.abs(v - scene0[i][k]) > 1e-3));
    check('D · … and exactly one box of the 3D scene moved, by 5 cm, at the same height', differing(scene0, sceneAfter) === 1 && near(Math.hypot(sceneAfter[movedIndex][0] - scene0[movedIndex][0], sceneAfter[movedIndex][2] - scene0[movedIndex][2]), 0.05, 0.002) && near(sceneAfter[movedIndex][1], scene0[movedIndex][1], 0.002), movedIndex >= 0 ? `${Math.hypot(sceneAfter[movedIndex][0] - scene0[movedIndex][0], sceneAfter[movedIndex][2] - scene0[movedIndex][2]).toFixed(4)} m` : 'none moved');
    await page.waitForTimeout(900); // end of the run
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(300);
    check('D · ← brings it back: the box is the label again and NO edit is stored', (await storedCar(page)) === null && (await changeText(page)).startsWith('nothing'), await changeText(page));
    await page.waitForTimeout(900);
    const u0 = await boxCentre(page);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    const u1 = await boxCentre(page);
    check('D · ↑ moves the box 5 cm up on screen (the way the car faces)', near(u1[1] - u0[1], -0.05 / scale, 0.6) && near(u1[0] - u0[0], 0, 0.6), `${(u1[0] - u0[0]).toFixed(2)} px, ${(u1[1] - u0[1]).toFixed(2)} px`);
    await page.waitForTimeout(900);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    check('D · ↓ brings it back', (await storedCar(page)) === null);
    await page.waitForTimeout(900);
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(300);
    const l1 = await boxCentre(page);
    check('D · Shift+← moves it 50 cm to the left', near(l1[0] - u0[0], -0.5 / scale, 1) && (await changeText(page)) === 'moved 0.50 m', `${(l1[0] - u0[0]).toFixed(2)} px (50 cm = ${(0.5 / scale).toFixed(2)} px) · ${await changeText(page)}`);
    const z = (await storedCar(page)).translation[2];
    await page.locator('button[aria-label="Revert to label"]').click();
    await page.waitForTimeout(400);
    await page.locator('button[aria-label="Undo"]').click();
    await page.waitForTimeout(300);
    const zLabel = (await storedCar(page)).translation[2];
    check('D · an arrow changes no height (centre z as stored is what it was)', z === zLabel);
    await page.locator('button[aria-label="Revert to label"]').click();
    await page.waitForTimeout(900);

    // ---- a held arrow is ONE undo step ---------------------------------------------
    const undo = page.locator('button[aria-label="Undo"]');
    const redo = page.locator('button[aria-label="Redo"]');
    const undoSteps = async () => { let n = 0; while (!(await undo.isDisabled()) && n < 60) { await undo.click(); await page.waitForTimeout(100); n += 1; } return n; };
    const baseSteps = await undoSteps(); // back to the start of the session
    check('D · (setup) undone back to the label', (await storedCar(page)) === null, `${baseSteps} steps`);
    await page.waitForTimeout(900);
    const h0 = await boxCentre(page);
    for (let i = 0; i < 12; i += 1) { await page.keyboard.down('ArrowRight'); await page.waitForTimeout(33); }
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(350);
    const h1 = await boxCentre(page);
    check('D · holding → (12 key repeats) moves the box 12 × 5 cm = 0.60 m', near(h1[0] - h0[0], 0.6 / scale, 1.2) && (await changeText(page)) === 'moved 0.60 m', `${(h1[0] - h0[0]).toFixed(1)} px (0.60 m = ${(0.6 / scale).toFixed(1)} px) · ${await changeText(page)}`);
    await shot(page, 'd1_nudged');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    check('D · … and ONE Ctrl+Z takes the whole run back (nothing left to undo, no edit stored)', (await storedCar(page)) === null && (await undo.isDisabled()));
    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(300);
    check('D · Ctrl+Shift+Z redoes it (0.60 m again)', (await changeText(page)) === 'moved 0.60 m' && (await redo.isDisabled()), await changeText(page));
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(300);
    check('D · Ctrl+Y redoes too', (await changeText(page)) === 'moved 0.60 m', await changeText(page));
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+z'); // nothing to undo
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    check('D · Ctrl+Z with nothing left to undo does nothing (no error, the editor stays open)', (await storedCar(page)) === null && (await page.locator(SEL.editor).count()) === 1 && page.__errors.length === 0);

    // ---- two presses with a pause between them are two steps ---------------------------
    await page.waitForTimeout(900);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1000);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    check('D · two presses a second apart are two undo steps (after one Ctrl+Z: "moved 0.05 m")', (await changeText(page)) === 'moved 0.05 m', await changeText(page));
    // a run, then a different kind of change, then a run again
    await page.waitForTimeout(900);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    const bc = await boxCentre(page);
    await drag(page, bc, [bc[0], bc[1] - 20]);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    const before3 = await changeText(page);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(250);
    const after1 = await changeText(page);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(250);
    const after2 = await changeText(page);
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(250);
    const after3 = await changeText(page);
    check('D · arrows → drag → arrow are three steps: each Ctrl+Z takes back one of them', new Set([before3, after1, after2, after3]).size === 4 && after2 === 'moved 0.15 m' && after3 === 'moved 0.05 m', `${before3} | ${after1} | ${after2} | ${after3}`);

    // ---- keys do not reach the box from a text field ---------------------------------------
    const before = JSON.stringify(await storedCar(page));
    const input = page.locator(`${SEL.details} input[data-field="length"]`);
    await input.click();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(250);
    check('D · in a number field the arrows and Ctrl+Z belong to the field: the box does not change', JSON.stringify(await storedCar(page)) === before);
    await input.press('Escape');
    await page.locator(`${SEL.editor} [data-part="scale"]`).click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(200);

    // ---- a Korean input method: the physical key decides ------------------------------------
    await key(page, { key: 'ㅋ', code: 'KeyZ', ctrlKey: true });
    await page.waitForTimeout(300);
    check('D · Ctrl+Z typed with the Korean layout on ("ㅋ") still undoes', (await storedCar(page)) === null, await changeText(page));
    await key(page, { key: 'ㅋ', code: 'KeyZ', ctrlKey: true, shiftKey: true });
    await page.waitForTimeout(300);
    check('D · … and Ctrl+Shift+Z ("ㅋ") redoes', (await changeText(page)) === 'moved 0.05 m', await changeText(page));

    // ---- keys that must stay with the browser / mean nothing here -------------------------------
    const before2 = JSON.stringify(await storedCar(page));
    await page.keyboard.press('Alt+ArrowUp');
    await page.keyboard.press('a');
    await page.keyboard.press('j');
    await page.keyboard.press('z');
    await page.waitForTimeout(250);
    check('D · Alt+arrow, A, J, plain Z do nothing to the box or the verdict', JSON.stringify(await storedCar(page)) === before2 && (await rawStorage(page, REVIEW_KEY)) === reviewsBefore);
    const scroll = await page.evaluate(() => [window.scrollX, window.scrollY, document.documentElement.scrollHeight > document.documentElement.clientHeight]);
    check('D · the arrows did not scroll the page', scroll[0] === 0 && scroll[1] === 0 && scroll[2] === false, JSON.stringify(scroll));

    // ---- while the box may not be changed ---------------------------------------------------------
    await page.getByRole('button', { name: /^Play/ }).first().click({ force: true });
    await page.waitForTimeout(250);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.getByRole('button', { name: /^Pause/ }).first().click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(500);
    await gotoFrame(page, 9);
    await page.waitForTimeout(600);
    check('D · while the sequence plays the arrows move nothing', JSON.stringify(await storedCar(page)) === before2);

    check('D · the stored reviews are byte for byte what they were', (await rawStorage(page, REVIEW_KEY)) === reviewsBefore);
    check('D · the 3D canvas was never re-created', await page.evaluate(() => document.querySelector('section[aria-label="3D view"] canvas').__mark === 'same'));

    // =====================================================================
    // 2. the marks
    // =====================================================================
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    const m1 = await marks(page);
    check('D · after Done: the list row of the edited box carries the mark — and only that row', m1.rows.length === 1 && m1.rows[0] === '527702', `${JSON.stringify(m1.rows)} of ${m1.listRows} rows`);
    check('D · the 3D name tag says "· 1 edited"', /· 1 edited/.test(m1.tag), m1.tag);
    check('D · the top bar says "1 edited" (1536 px wide) and its tooltip too', m1.headerCount === '1 edited' && m1.headerCountVisible && /1 box edited in this scene/.test(m1.headerTitle), `${m1.headerCount} · ${m1.headerTitle.slice(-40)}`);
    check('D · the Selected section says what was changed ("moved 0.05 m")', m1.note === 'moved 0.05 m', String(m1.note));
    check('D · the evidence strip says its LiDAR count is the label\'s ("in label")', m1.inLabel === 1);
    check('D · draw calls are what they were before editing', (await drawCalls(page)) === calls0, `${await drawCalls(page)} vs ${calls0}`);
    await shot(page, 'd2_marks');
    const listBox = await page.locator(SEL.list).boundingBox();
    const rowBox = await row(page, '527702').boundingBox();
    await shot(page, 'd2_marks_list_row', { x: listBox.x, y: Math.max(0, rowBox.y - 70), width: listBox.width, height: 150 });

    // another box of the same frame
    await page.locator(`${SEL.list} li`).nth(3).click();
    await page.waitForTimeout(400);
    const other = await marks(page);
    check('D · another box selected: no "Edited" row in Selected, no "in label" — the list mark stays on the edited row', other.note === null && other.inLabel === 0 && other.rows.join() === '527702', JSON.stringify(other).slice(0, 160));
    // another frame of the same scene
    await gotoFrame(page, 10);
    const f10 = await marks(page);
    check('D · another frame: no list mark, no "edited" in the 3D tag — the top bar still counts the scene ("1 edited")', f10.rows.length === 0 && !/edited/.test(f10.tag) && f10.headerCount === '1 edited', JSON.stringify(f10).slice(0, 200));
    // a second edit, in frame 10
    await page.locator(`${SEL.list} li`).first().click();
    await page.waitForTimeout(400);
    await enterEditor(page);
    await page.keyboard.press('Shift+ArrowUp');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    const two = await marks(page);
    check('D · a second box edited in frame 10: top bar "2 edited", frame 10 shows one mark and "· 1 edited"', two.headerCount === '2 edited' && two.rows.length === 1 && /· 1 edited/.test(two.tag) && two.note === 'moved 0.50 m', JSON.stringify(two).slice(0, 220));
    seedEdits = await rawStorage(page, EDIT_KEY);
    seedReviews = await rawStorage(page, REVIEW_KEY);

    // the other modes use the dataset's boxes: no marks
    await gotoFrame(page, 9);
    await page.getByRole('button', { name: 'Evaluate', exact: true }).click();
    await page.waitForTimeout(2500);
    const ev = await marks(page);
    check('D · Evaluate: no mark anywhere (it shows the dataset\'s boxes)', ev.rows.length === 0 && ev.headerCount === null && !/edited/.test(ev.tag) && ev.note === null && ev.inLabel === 0, JSON.stringify(ev).slice(0, 200));
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await page.waitForTimeout(1500);
    const ex = await marks(page);
    check('D · Explore: no mark anywhere', ex.rows.length === 0 && ex.headerCount === null && !/edited/.test(ex.tag) && ex.note === null && ex.inLabel === 0, JSON.stringify(ex).slice(0, 200));
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.waitForTimeout(1500);

    // another scene: its count is its own
    await page.locator(`${SEL.frames} button`, { hasText: /scene-/ }).first().click();
    await page.waitForTimeout(300);
    await page.getByRole('option', { name: /scene-0061/ }).first().click().catch(async () => { await page.getByText('scene-0061').first().click(); });
    await page.waitForTimeout(3000);
    const sc = await marks(page);
    check('D · another scene (scene-0061): nothing is marked and the top bar shows no "edited" count', sc.rows.length === 0 && sc.headerCount === null && !/edited/.test(sc.tag), JSON.stringify(sc).slice(0, 200));

    check('D · no page errors', page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  // =====================================================================
  // 3. marks from a stored edit, and marks going away
  // =====================================================================
  {
    const { context, page } = await open(browser, 1536, 700, { seed: [[EDIT_KEY, seedEdits], [REVIEW_KEY, seedReviews]] });
    await gotoFrame(page, 9);
    const m = await marks(page);
    check('D · on a new visit (edits read from storage): frame 9 shows the mark, "· 1 edited", and the top bar "2 edited"', m.rows.join() === '527702' && /· 1 edited/.test(m.tag) && m.headerCount === '2 edited', JSON.stringify(m).slice(0, 200));
    await row(page, '527702').click();
    await page.waitForTimeout(400);
    await enterEditor(page);
    await page.locator('button[aria-label="Revert to label"]').click();
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    const r = await marks(page);
    check('D · after Revert to label: the row mark, the tag note, the Selected row and "in label" are gone; the top bar says "1 edited"', r.rows.length === 0 && !/edited/.test(r.tag) && r.note === null && r.inLabel === 0 && r.headerCount === '1 edited', JSON.stringify(r).slice(0, 200));
    check('D · no page errors (stored edit)', page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  // =====================================================================
  // 4. the browser refuses to store the edits
  // =====================================================================
  {
    const { context, page } = await open(browser, 1536, 700, { failEdits: true });
    await selectBox(page, 9, '527702');
    const m0 = await marks(page);
    await enterEditor(page);
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    const m = await marks(page);
    check('D · when the browser refuses to store the edits: the edit still works for this visit and the top bar says "Not saved"', !m0.notSaved && m.notSaved && m.rows.join() === '527702' && (await rawStorage(page, EDIT_KEY)) === null, JSON.stringify(m).slice(0, 160));
    const bar = await topBar(page);
    check('D · … and the top bar is still one line (1536 px)', !bar.wraps && !bar.pageScroll, `spare ${bar.spare}px`);
    await shot(page, 'd3_not_saved', { x: 0, y: 0, width: 1536, height: 110 });
    check('D · no page errors (storage refused)', page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  // =====================================================================
  // 5. widths: the top bar on one line, the list row and the evidence strip not cut
  // =====================================================================
  // ---- the top bar, over a sweep of window widths, in ONE visit (the window is resized) ----
  {
    const { context, page } = await open(browser, 1536, 800, { seed: [[EDIT_KEY, seedEdits], [REVIEW_KEY, seedReviews]], failEdits: true });
    const WIDTHS = [1024, 1100, 1200, 1279, 1280, 1300, 1320, 1340, 1360, 1380, 1399, 1400, 1420, 1439, 1440, 1460, 1500, 1536];
    const sweep = async (label, widen) => {
      const lines = [];
      let wrapped = [];
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 800 });
        await page.waitForTimeout(200);
        const texts = widen ? await page.evaluate(() => {
          const box = document.querySelector('header [title^="Reviewed boxes"]');
          const n = box.querySelector('span span');
          const e = box.querySelector('[data-part="edited-count"]');
          const was = [n.textContent, e ? e.textContent : null];
          n.textContent = '2424';
          if (e) e.textContent = '156 edited';
          return was;
        }) : null;
        const r = await topBar(page);
        const m = await marks(page);
        if (texts) await page.evaluate((was) => {
          const box = document.querySelector('header [title^="Reviewed boxes"]');
          box.querySelector('span span').textContent = was[0];
          const e = box.querySelector('[data-part="edited-count"]');
          if (e) e.textContent = was[1];
        }, texts);
        if (r.wraps || r.pageScroll) wrapped.push(w);
        lines.push(`${w}:${r.wraps ? 'WRAPS' : r.spare}`);
        if (m.headerCountVisible !== (w >= 1440)) wrapped.push(`${w} count ${m.headerCountVisible ? 'shown' : 'hidden'}`);
      }
      check(`D · top bar, ${WIDTHS.length} widths from 1024 to 1536 px, ${label}: always one line; "N edited" shown from 1440 px`, wrapped.length === 0, `${wrapped.length ? `PROBLEM at ${wrapped.join(', ')} · ` : ''}room left (px) ${lines.join(' ')}`);
    };
    await gotoFrame(page, 9);
    await sweep('2 boxes edited', false);
    await sweep('widest texts ("2424" reviewed, "156 edited")', true);
    // now the browser really refuses a write: "Not saved" comes up by itself
    await page.setViewportSize({ width: 1536, height: 800 });
    await row(page, '527702').click();
    await page.waitForTimeout(400);
    await enterEditor(page);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    check('D · (setup) the refused write shows "Not saved" in the top bar', (await marks(page)).notSaved);
    await sweep('with "Not saved"', false);
    await sweep('with "Not saved" AND the widest texts', true);
    for (const w of [1280, 1400, 1440]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(250);
      await shot(page, `d4_top_bar_not_saved_${w}`, { x: 0, y: 0, width: w, height: 110 });
    }
    const hidden = await page.evaluate(() => /1 rejected/.test(document.querySelector('header').innerText));
    await page.setViewportSize({ width: 1300, height: 800 });
    await page.waitForTimeout(250);
    const at1300 = await page.evaluate(() => ({ text: /rejected/.test(document.querySelector('header [title^="Reviewed boxes"]').innerText), title: document.querySelector('header [title^="Reviewed boxes"]').title }));
    check('D · with "Not saved" at 1300 px the two counts give way (still in the tooltip); at 1440 px they are shown', hidden && !at1300.text && /1 rejected, 0 unsure/.test(at1300.title), at1300.title.slice(-70));
    check('D · no page errors (top bar sweep)', page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }
  for (const [w, h] of [[1024, 768], [1280, 720], [1400, 800], [1440, 900], [1536, 700]]) {
    const { context, page } = await open(browser, w, h, { seed: [[EDIT_KEY, seedEdits], [REVIEW_KEY, seedReviews]] });
    await selectBox(page, 9, '527702');
    const m = await marks(page);
    check(`D · ${w} px: the tooltip of the top bar counts the edits ("2 boxes edited in this scene")`, /2 boxes edited in this scene/.test(m.headerTitle), m.headerTitle.slice(-50));

    // by POSITION: every cell of the marked row inside the row, none on top of another
    const cells = await page.evaluate(() => {
      const li = [...document.querySelectorAll('section[aria-label="Objects"] li')].find((x) => x.querySelector('[data-edited]'));
      if (!li) return { bad: ['no marked row'] };
      const row = li.getBoundingClientRect();
      const kids = [...li.children].map((el) => ({ r: el.getBoundingClientRect(), el })).filter((k) => k.r.width > 0);
      const bad = [];
      kids.forEach((k, i) => {
        if (k.r.left < row.left - 0.5 || k.r.right > row.right + 0.5) bad.push(`cell ${i} outside the row`);
        if (i > 0 && k.r.left < kids[i - 1].r.right - 0.5) bad.push(`cell ${i} over cell ${i - 1}`);
      });
      const name = li.children[1];
      const mark = li.querySelector('[data-edited]');
      const cut = name.scrollWidth > name.clientWidth;
      mark.style.display = 'none';
      const cutWithout = name.scrollWidth > name.clientWidth;
      mark.style.display = '';
      const m = mark.getBoundingClientRect();
      return { bad, cut, cutWithout, name: name.textContent, nameWidth: Math.round(name.clientWidth), mark: `${m.width.toFixed(1)}×${m.height.toFixed(1)}`, rowWidth: Math.round(row.width) };
    });
    check(`D · ${w} px: the marked list row — every cell inside the row, none overlapping, the class name not cut by the mark`, cells.bad.length === 0 && cells.cut === cells.cutWithout, `${cells.bad.join('; ') || 'ok'} · row ${cells.rowWidth}px, name "${cells.name}" ${cells.nameWidth}px${cells.cut ? ' (cut)' : ''}, mark ${cells.mark}px`);
    // the evidence strip of the edited box
    const strip = await page.evaluate(() => {
      const tag = document.querySelector('[data-part="label-count"]');
      if (!tag) return { bad: ['no "in label"'] };
      const stripEl = tag.parentElement.parentElement;
      const box = stripEl.getBoundingClientRect();
      const groups = [...stripEl.children].map((g) => g.getBoundingClientRect());
      const bad = [];
      groups.forEach((g, i) => {
        if (g.left < box.left - 0.5 || g.right > box.right + 0.5) bad.push(`group ${i} outside the strip`);
        if (i > 0 && g.left < groups[i - 1].right - 0.5) bad.push(`group ${i} over group ${i - 1}`);
      });
      const gaps = groups.slice(1).map((g, i) => Math.round(g.left - groups[i].right));
      return { bad, width: Math.round(box.width), gaps, text: stripEl.innerText.replace(/\s+/g, ' ') };
    });
    check(`D · ${w} px: the evidence strip with "in label" — every part inside the strip, none overlapping`, strip.bad.length === 0, `${(strip.bad || []).join('; ') || 'ok'} · strip ${strip.width}px, gaps ${JSON.stringify(strip.gaps)} · ${strip.text}`);
    // the Selected row
    const note = await page.evaluate(() => {
      const el = document.querySelector('section[aria-label="Details"] [data-part="edit-note"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const panel = document.querySelector('section[aria-label="Details"]').getBoundingClientRect();
      return { inside: r.left >= panel.left && r.right <= panel.right + 0.5, cut: el.scrollWidth > el.clientWidth + 1, text: el.innerText };
    });
    check(`D · ${w} px: the "Edited" row of Selected is inside the panel and not cut`, note && note.inside && !note.cut, JSON.stringify(note));
    if (w === 1024) await shot(page, 'd5_marks_1024x768');
    if (w === 1440) await shot(page, 'd5_marks_1440x900');
    check(`D · ${w} px: no page errors`, page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  // =====================================================================
  // 6. the longest texts: every number changed (Selected row), a weak box (evidence strip)
  // =====================================================================
  for (const [w, h] of [[1024, 768], [1536, 700]]) {
    const { context, page } = await open(browser, w, h);
    await selectBox(page, 9, '527702');
    await enterEditor(page);
    const c = await boxCentre(page);
    await drag(page, c, [c[0] + 25, c[1] - 12]);
    const type = async (name, text) => { const i = page.locator(`${SEL.details} input[data-field="${name}"]`); await i.click(); await i.fill(text); await i.press('Enter'); await page.waitForTimeout(250); };
    await type('length', '5.40'); await type('width', '2.10'); await type('height', '2.00'); await type('heading', '-120.5'); await type('lift', '-0.25');
    await page.locator(`${SEL.editor} [data-part="scale"]`).click({ force: true }).catch(() => undefined);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    const note = await page.evaluate(() => {
      const el = document.querySelector('section[aria-label="Details"] [data-part="edit-note"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const panel = document.querySelector('section[aria-label="Details"]').getBoundingClientRect();
      const rowEl = el.parentElement.parentElement;
      const next = rowEl.nextElementSibling ? rowEl.nextElementSibling.getBoundingClientRect() : null;
      return { inside: r.left >= panel.left - 0.5 && r.right <= panel.right + 0.5, cut: el.scrollWidth > el.clientWidth + 1, overNext: next ? r.bottom > next.top + 0.5 : false, lines: Math.round(r.height / 16), text: el.innerText.replace(/\s+/g, ' ') };
    });
    check(`D · ${w}×${h}: with every number changed, the "Edited" row of Selected is whole (wraps inside the panel, nothing cut, not over the next row)`, note && note.inside && !note.cut && !note.overNext, JSON.stringify(note));
    if (w === 1024) await shot(page, 'd6_all_changed_selected_1024');

    // a weak box (few LiDAR points), edited: the longest evidence strip
    let weak = null;
    const rows = await page.locator(`${SEL.list} li`).count();
    for (let i = 0; i < rows && weak === null; i += 1) {
      await page.locator(`${SEL.list} li`).nth(i).click();
      await page.waitForTimeout(120);
      const text = await page.evaluate(() => { const s = [...document.querySelectorAll('span')].find((el) => /^\d+ pts? · weak$/.test(el.textContent.trim())); return s ? s.textContent.trim() : null; });
      if (text) weak = text;
    }
    if (weak === null) {
      check(`D · ${w}×${h}: (a weak box to try the longest evidence strip on)`, false, 'no weak box in frame 9');
    } else {
      await page.waitForTimeout(400);
      await enterEditor(page);
      await page.keyboard.press('Shift+ArrowRight');
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(700);
      const strip = await page.evaluate(() => {
        const tag = document.querySelector('[data-part="label-count"]');
        if (!tag) return { bad: ['no "in label"'] };
        const stripEl = tag.parentElement.parentElement;
        const box = stripEl.getBoundingClientRect();
        const groups = [...stripEl.children].map((g) => g.getBoundingClientRect());
        const bad = [];
        groups.forEach((g, i) => {
          if (g.left < box.left - 0.5 || g.right > box.right + 0.5) bad.push(`group ${i} outside the strip`);
          if (i > 0 && g.left < groups[i - 1].right - 0.5) bad.push(`group ${i} over group ${i - 1}`);
        });
        return { bad, width: Math.round(box.width), gaps: groups.slice(1).map((g, i) => Math.round(g.left - groups[i].right)), text: stripEl.innerText.replace(/\s+/g, ' ') };
      });
      check(`D · ${w}×${h}: a WEAK box, edited ("${weak} in label") — the evidence strip still fits, nothing overlapping`, strip.bad.length === 0, `${(strip.bad || []).join('; ') || 'ok'} · strip ${strip.width}px, gaps ${JSON.stringify(strip.gaps)} · ${strip.text}`);
      if (w === 1024) await shot(page, 'd6_weak_box_strip_1024');
    }
    check(`D · ${w}×${h}: no page errors (longest texts)`, page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nd: ${results.length - failed} / ${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
  fs.writeFileSync(path.join(OUT, 'd.result.json'), JSON.stringify(results, null, 1));
})();
