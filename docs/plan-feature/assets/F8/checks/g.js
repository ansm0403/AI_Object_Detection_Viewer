// F8 edge-case review: conditions the step checks never exercised. Run BEFORE any fix.
// Real app, production build on :3100.   usage: node g.js <repoRoot> <outDir>
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
const LIST = 'section[aria-label="Objects"]';
const FRAMES = 'section[aria-label="Frames"]';
const DETAILS = 'section[aria-label="Details"]';
const EDITOR = 'section[aria-label="Top view"]';
const VIEW3D = 'section[aria-label="3D view"]';
const EDIT_KEY = 'ai-detection-viewer.box-edits';
const REVIEW_KEY = 'ai-detection-viewer.review';
const FRAME9 = '5b7cb170eee6468aa1fdbd3abcf63c5a';
const CAR = '52770232202d4ad1a98ed07d5b4c20b9';

async function newContext(browser, width, height, { seed, init } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    const target = new EventTarget();
    window.__THREE_DEVTOOLS__ = target;
    window.__renderers = [];
    target.addEventListener('observe', (e) => { if (e.detail && e.detail.isWebGLRenderer) window.__renderers.push(e.detail); });
  });
  if (seed) await context.addInitScript((pairs) => { for (const [k, v] of pairs) if (v !== null && localStorage.getItem(k) === null) localStorage.setItem(k, v); }, seed);
  if (init) await context.addInitScript(init);
  return context;
}
async function openPage(context, wait = 2500) {
  const page = await context.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForSelector(`${VIEW3D} canvas`, { timeout: 60000 });
  await page.waitForTimeout(wait);
  return page;
}
async function open(browser, width = 1536, height = 700, options = {}) {
  const context = await newContext(browser, width, height, options);
  return { context, page: await openPage(context) };
}
const gotoFrame = async (page, n) => { await page.locator(`${FRAMES} button[aria-label^="Frame ${n}"]`).first().click(); await page.waitForTimeout(900); };
const gotoScene = async (page, name) => {
  await page.locator(`${FRAMES} button`, { hasText: /scene-/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('option', { name: new RegExp(name) }).first().click().catch(async () => { await page.getByText(name).first().click(); });
  await page.waitForTimeout(3000);
};
const row = (page, idPrefix) => page.locator(`${LIST} li`, { has: page.locator(`span.font-mono[title^="${idPrefix}"]`) }).first();
const selectCar = async (page) => { await gotoFrame(page, 9); await row(page, '527702').click(); await page.waitForTimeout(450); };
const enter = async (page) => { await page.keyboard.press('e'); await page.waitForTimeout(900); };
const leave = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(700); };
const editorOpen = (page) => page.locator(EDITOR).count().then((n) => n === 1);
const edits = (page, scope = 'nuscenes') => page.evaluate(([key, s]) => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v).state.edits[s] || {} : {}; } catch (e) { return { error: String(e) }; } }, [EDIT_KEY, scope]);
const carEdit = async (page) => (await edits(page))[`${FRAME9}/${CAR}`] || null;
const raw = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const fields = async (page) => Object.fromEntries(await Promise.all(['length', 'width', 'height', 'heading', 'lift'].map(async (f) => [f, Number(await page.locator(`${DETAILS} input[data-field="${f}"]`).inputValue())])));
const type = async (page, name, text, key = 'Enter') => { const i = page.locator(`${DETAILS} input[data-field="${name}"]`); await i.click(); await i.fill(text); await i.press(key); await page.waitForTimeout(300); };
const marks = (page) => page.evaluate(() => ({
  rows: document.querySelectorAll('section[aria-label="Objects"] [data-edited]').length,
  count: (document.querySelector('header [data-part="edited-count"]') || { innerText: null }).innerText,
  tag: /edited/i.test((document.querySelector('section[aria-label="3D view"]') || { innerText: '' }).innerText),
  notSaved: /Not saved/i.test(document.querySelector('header').innerText),
}));
const changeText = async (page) => (await page.locator('[data-part="change"]').innerText()).replace(/\s+/g, ' ').replace('Changed from the label: ', '');
const overflow = (page) => page.evaluate(() => { const d = document.documentElement; return { x: d.scrollWidth - d.clientWidth, y: d.scrollHeight - d.clientHeight }; });
const key = (page, init) => page.evaluate((i) => { window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...i })); }, init);
const geometries = (page) => page.evaluate(() => { const r = window.__renderers[window.__renderers.length - 1]; return r ? r.info.memory.geometries : null; });
/** Run one scenario; a crash in it is a failed check, not the end of the script. */
async function scenario(name, run) {
  try { await run(); } catch (error) { check(`${name}: the scenario ran to its end`, false, String(error).split('\n')[0].slice(0, 220)); }
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let goodEdits = null;
  let goodReviews = null;

  // ---- G1: two tabs ------------------------------------------------------------------------
  await scenario('G1 two tabs', async () => {
    const context = await newContext(browser, 1536, 700);
    const a = await openPage(context);
    const b = await openPage(context);
    await selectCar(a);
    await selectCar(b);
    await a.keyboard.press('r');
    await a.waitForTimeout(300);
    await enter(a);
    await a.keyboard.press('Shift+ArrowRight');
    await a.waitForTimeout(700);
    const mb = await marks(b);
    check('G1 · two tabs: an edit made in tab A shows in tab B without a reload (list mark, "1 edited", 3D tag)', mb.rows === 1 && mb.count === '1 edited' && mb.tag, JSON.stringify(mb));
    await enter(b);
    const inB = await changeText(b);
    await a.keyboard.press('Shift+ArrowRight');
    await a.waitForTimeout(700);
    const inB2 = await changeText(b);
    check('G1 · … tab B’s editor, open on the same box, follows a further change made in tab A', inB === 'moved 0.50 m' && inB2 === 'moved 1.00 m', `${inB} → ${inB2}`);
    // B changes it too (after A): the last write wins, and both tabs agree
    await b.waitForTimeout(500);
    await b.keyboard.press('Shift+ArrowUp');
    await b.waitForTimeout(700);
    const fromA = await changeText(a);
    const fromB = await changeText(b);
    check('G1 · … a change in tab B then shows in tab A: both tabs show the same box', fromA === fromB && fromA !== 'moved 1.00 m', `A: ${fromA} | B: ${fromB}`);
    // A reverts while B is still in its editor
    await a.locator('button[aria-label="Revert to label"]').click();
    await a.waitForTimeout(700);
    const afterRevert = await changeText(b);
    const undoB = await b.locator('button[aria-label="Undo"]').isDisabled();
    check('G1 · … tab A reverts: tab B shows the label again, no edit is stored', afterRevert.startsWith('nothing') && (await carEdit(b)) === null, afterRevert);
    await b.keyboard.press('Control+z');
    await b.waitForTimeout(500);
    const afterUndo = await carEdit(a);
    check('G1 · … and tab B’s undo steps start again from there: Undo is disabled, and Ctrl+Z does not bring back the edit tab A removed', undoB && afterUndo === null, `Undo in B was ${undoB ? 'disabled' : 'enabled'}; after Ctrl+Z the stored edit is ${afterUndo ? 'BACK' : 'still absent'}`);
    check('G1 · no page errors in either tab', a.__errors.length === 0 && b.__errors.length === 0, [...a.__errors, ...b.__errors].join(' | '));
    await a.locator('button[aria-label="Revert to label"]').click().catch(() => undefined);
    await a.keyboard.press('Shift+ArrowLeft');
    await a.waitForTimeout(500);
    goodEdits = await raw(a, EDIT_KEY);
    goodReviews = await raw(a, REVIEW_KEY);
    await context.close();
  });

  // ---- G2: stored values that are broken, stale or from before the feature ---------------------
  const broken = {
    'not JSON': '{{{ not json',
    'an empty string': '',
    'JSON null': 'null',
    'a number': '42',
    'state missing': JSON.stringify({ version: 1 }),
    'edits is a string': JSON.stringify({ version: 1, state: { edits: 'x' } }),
    'a scope is an array': JSON.stringify({ version: 1, state: { edits: { nuscenes: [1, 2], 'nuscenes-practice': {} } } }),
    'unknown future version': JSON.stringify({ version: 99, state: { edits: { nuscenes: {}, 'nuscenes-practice': {} } } }),
  };
  for (const [name, value] of Object.entries(broken)) {
    await scenario(`G2 stored edits: ${name}`, async () => {
      const { context, page } = await open(browser, 1536, 700, { seed: [[EDIT_KEY, value], [REVIEW_KEY, goodReviews]] });
      await selectCar(page);
      const m = await marks(page);
      await enter(page);
      await page.keyboard.press('Shift+ArrowRight');
      await page.waitForTimeout(600);
      const stored = await carEdit(page);
      check(`G2 · stored edits are "${name}": the app opens, nothing is marked edited, and a new edit works and is stored`, m.rows === 0 && m.count === null && !m.notSaved && (await editorOpen(page)) && stored !== null && page.__errors.length === 0, `${JSON.stringify(m)} · errors: ${page.__errors.join(' | ').slice(0, 120)}`);
      check(`G2 · … the stored reviews are untouched (the rejected car is still rejected)`, (await raw(page, REVIEW_KEY)) === goodReviews);
      await context.close();
    });
  }
  await scenario('G2 bad records', async () => {
    const good = JSON.parse(goodEdits);
    const k = `${FRAME9}/${CAR}`;
    const base = good.state.edits.nuscenes[k];
    const bad = {
      [k]: base, // the one good record
      [`${FRAME9}/nan`]: { ...base, objectId: 'nan', translation: [null, 1, 2] },
      [`${FRAME9}/negative-size`]: { ...base, objectId: 'negative-size', size: [-1, 4, 1.5] },
      [`${FRAME9}/zero-size`]: { ...base, objectId: 'zero-size', size: [0, 4, 1.5] },
      [`${FRAME9}/huge`]: { ...base, objectId: 'huge', size: [1e9, 4, 1.5] },
      [`${FRAME9}/yaw-text`]: { ...base, objectId: 'yaw-text', yaw: 'left' },
      [`${FRAME9}/short`]: { ...base, objectId: 'short', size: [1, 2] },
      [`${FRAME9}/no-time`]: { frameId: FRAME9, objectId: 'no-time', translation: base.translation, size: base.size, yaw: 0 },
      'key-does-not-match': { ...base, objectId: 'something-else' },
      [`gone-frame/${CAR}`]: { ...base, frameId: 'gone-frame' },
      [`${FRAME9}/gone-object`]: { ...base, objectId: 'gone-object' },
      'just-a-string': 'hello',
      'null-record': null,
    };
    good.state.edits.nuscenes = bad;
    good.state.edits.extraScope = { x: 1 };
    const { context, page } = await open(browser, 1536, 700, { seed: [[EDIT_KEY, JSON.stringify(good)], [REVIEW_KEY, goodReviews]] });
    await gotoFrame(page, 9);
    const m = await marks(page);
    check('G2 · 13 stored records, 1 good and 12 bad (NaN, negative / zero / huge size, text for a number, a missing field, a key that does not match, a frame or box that is gone, not an object): only the good one is laid over — 1 mark, "1 edited"', m.rows === 1 && m.count === '1 edited' && page.__errors.length === 0, `${JSON.stringify(m)} · ${page.__errors.join(' | ').slice(0, 160)}`);
    // export with them in storage
    await page.getByRole('button', { name: /^Export/ }).click();
    const menu = await page.evaluate(() => document.querySelector('[role="menu"][aria-label="Export reviews"] p').innerText.replace(/\s+/g, ' '));
    await page.keyboard.press('Escape');
    check('G2 · … the export menu counts the ONE edit a file would hold — not the stored records whose box does not exist', /· 1 box edited ·/.test(menu), menu);
    await context.close();
  });
  await scenario('G2 before the feature', async () => {
    // a browser that has reviews in all three scopes and has never seen the edit key
    const reviews = JSON.parse(goodReviews);
    reviews.state.reviews['nuscenes-practice'] = { [`${FRAME9}/${CAR}`]: { frameId: FRAME9, objectId: CAR, verdict: 'approved', reasons: [], note: 'practice note', reviewedAt: '2026-11-20T00:00:00.000Z' } };
    reviews.state.reviews['nuscenes-false-alarms'] = { 'f/pred:CAM_FRONT:3': { frameId: 'f', objectId: 'pred:CAM_FRONT:3', verdict: 'rejected', reasons: [], note: '', reviewedAt: '2026-11-20T00:00:00.000Z' } };
    const text = JSON.stringify(reviews);
    const { context, page } = await open(browser, 1536, 700, { seed: [[REVIEW_KEY, text]] });
    const before = await raw(page, REVIEW_KEY);
    await selectCar(page);
    await enter(page);
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(600);
    await leave(page);
    check('G2 · a browser from before F8 (reviews in all three scopes, no edit key): the review value is byte for byte what it was, before and after the first edit', before === text && (await raw(page, REVIEW_KEY)) === text && (await carEdit(page)) !== null && page.__errors.length === 0);
    await context.close();
  });

  // ---- G3: storage that refuses everything ---------------------------------------------------------
  for (const [name, init] of [
    ['every write throws', () => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; }],
    ['every read AND write throws (storage blocked)', () => { const deny = function () { throw new DOMException('denied', 'SecurityError'); }; Storage.prototype.getItem = deny; Storage.prototype.setItem = deny; Storage.prototype.removeItem = deny; }],
  ]) {
    await scenario(`G3 storage: ${name}`, async () => {
      const { context, page } = await open(browser, 1536, 700, { init });
      await selectCar(page);
      await enter(page);
      await page.keyboard.press('Shift+ArrowRight');
      await page.waitForTimeout(600);
      const text = await changeText(page).catch(() => 'no editor');
      const barNote = await page.evaluate(() => /Not saved/i.test(document.querySelector('main').parentElement.children[1].innerText));
      await leave(page);
      const m = await marks(page);
      check(`G3 · ${name}: editing still works for the visit (the box moves, the marks appear) and both the editor and the top bar say "Not saved"`, text === 'moved 0.50 m' && barNote && m.rows === 1 && m.notSaved && page.__errors.length === 0, `${text} · ${JSON.stringify(m)} · ${page.__errors.join(' | ').slice(0, 140)}`);
      await context.close();
    });
  }

  // ---- G4: the Korean keyboard layout -------------------------------------------------------------
  await scenario('G4 Korean layout', async () => {
    const { context, page } = await open(browser);
    await selectCar(page);
    await key(page, { key: 'ㄷ', code: 'KeyE' });
    await page.waitForTimeout(900);
    const opened = await editorOpen(page);
    await key(page, { key: 'ㅍ', code: 'KeyV' });
    await page.waitForTimeout(1300);
    const split = await page.locator('button[aria-label="3D view next to the top view"]').getAttribute('aria-pressed');
    await key(page, { key: 'Process', code: 'KeyV' });
    await page.waitForTimeout(1300);
    const focus = await page.locator('button[aria-label="3D view next to the top view"]').getAttribute('aria-pressed');
    check('G4 · Korean layout: "ㄷ" (the E key) opens the editor, "ㅍ" (V) switches the view, and V while a syllable is being composed ("Process") switches it back', opened && split === 'true' && focus === 'false', `${opened} ${split} ${focus}`);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    await key(page, { key: 'ㅋ', code: 'KeyZ', ctrlKey: true });
    await page.waitForTimeout(400);
    check('G4 · … Ctrl+"ㅋ" (Z) undoes the nudge', (await carEdit(page)) === null);
    const before = JSON.stringify(await fields(page));
    await type(page, 'length', '사점오');
    await type(page, 'width', 'ㅁㄴㅇ');
    check('G4 · … Korean text typed into a number field changes nothing', JSON.stringify(await fields(page)) === before && (await carEdit(page)) === null && page.__errors.length === 0);
    await context.close();
  });

  // ---- G5: numbers at and beyond the limits -----------------------------------------------------------
  await scenario('G5 extreme numbers', async () => {
    const { context, page } = await open(browser);
    await selectCar(page);
    await enter(page);
    await page.keyboard.press('v');
    await page.waitForTimeout(1500);
    const start = await fields(page);
    const tries = [];
    for (const [name, text] of [['length', '9999'], ['width', '0'], ['height', '-3'], ['heading', '725'], ['lift', '999'], ['lift', '-999'], ['length', '1e3'], ['width', 'Infinity'], ['height', 'NaN'], ['length', ''], ['length', '  '], ['width', '0.00001'], ['heading', '-0'], ['height', '1,5,5']]) {
      await type(page, name, text);
      tries.push(`${name}="${text}"→${(await fields(page))[name]}`);
    }
    const end = await fields(page);
    const stored = await carEdit(page);
    const finite = stored && [...stored.translation, ...stored.size, stored.yaw].every((n) => Number.isFinite(n));
    check('G5 · numbers far outside what a box can be: every stored number stays finite and inside the limits (size 0.1 – 50 m, up/down ±20 m, heading within ±180°)', finite && stored.size.every((n) => n >= 0.1 - 1e-9 && n <= 50 + 1e-9) && Math.abs(end.lift) <= 20 && Math.abs(end.heading) <= 180, tries.join(' · '));
    check('G5 · … the 3D view, the photo and the top view survive a 50 m box 20 m in the air (no page error)', page.__errors.length === 0 && (await page.locator(`${VIEW3D} canvas`).count()) === 1 && (await editorOpen(page)), page.__errors.join(' | ').slice(0, 200));
    await shot(page, 'g5_extreme_box');
    const photo = await page.evaluate(() => ({ sees: document.querySelectorAll('section[aria-label="Camera thumbnails"] button[aria-label*="sees the selected box"]').length, text: document.querySelector('section[aria-label="Camera image"]').innerText.replace(/\s+/g, ' ').slice(0, 80) }));
    check('G5 · … what the photo says when the box is that large (recorded)', true, JSON.stringify(photo));
    await page.locator('button[aria-label="Revert to label"]').click();
    await page.waitForTimeout(500);
    check('G5 · … Revert to label brings back exactly the label’s numbers', JSON.stringify(await fields(page)) === JSON.stringify(start) && (await carEdit(page)) === null);
    // 100+ changes: the history has a limit, the page does not slow to a stop
    const t0 = Date.now();
    for (let i = 0; i < 110; i += 1) { await page.keyboard.press(i % 2 ? 'ArrowRight' : 'ArrowUp'); await page.waitForTimeout(i % 10 === 0 ? 850 : 20); }
    await page.waitForTimeout(900);
    let undone = 0;
    const undo = page.locator('button[aria-label="Undo"]');
    while (!(await undo.isDisabled()) && undone < 200) { await page.keyboard.press('Control+z'); await page.waitForTimeout(25); undone += 1; }
    check('G5 · 110 arrow presses in bursts, then Ctrl+Z until nothing is left: back at the label, in far fewer steps than presses (bursts are single steps; here presses more than 0.8 s apart start a new one)', undone >= 12 && undone <= 40 && (await carEdit(page)) === null, `${undone} undo steps for 110 presses, ${Date.now() - t0} ms for the presses`);
    await context.close();
  });

  // ---- G6: the screen changes under the open editor ------------------------------------------------------
  await scenario('G6 changes under the editor', async () => {
    const { context, page } = await open(browser);
    await page.waitForTimeout(3000);
    await page.evaluate(() => { document.querySelector('section[aria-label="3D view"] canvas').__mark = 'same'; });
    await selectCar(page);
    await enter(page);
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(500);
    // another frame: the same car has ANOTHER box there (the object id is the same in every frame)
    await gotoFrame(page, 30);
    const far = await page.evaluate(() => ({ editor: !!document.querySelector('section[aria-label="Top view"]'), bar: document.querySelector('main').parentElement.children[1].innerText.replace(/\s+/g, ' ').slice(0, 40), inputs: document.querySelectorAll('section[aria-label="Details"] input[data-field]').length }));
    const farChange = far.inputs ? await changeText(page) : 'no panel';
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    const nudged = Object.keys(await edits(page)).length;
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    const kept = await carEdit(page);
    check('G6 · another frame while editing: the editor follows to the SAME car’s box of frame 30 — a different box, with no edit; an arrow there moves that box only, Ctrl+Z takes it back, the frame-9 edit is untouched', far.editor && /frame 30/.test(far.bar) && far.inputs === 5 && farChange.startsWith('nothing') && nudged === 2 && Object.keys(await edits(page)).length === 1 && kept !== null, `${far.bar} · ${farChange} · records after the arrow: ${nudged}`);
    // a frame where the car has no box at all
    let absent = null;
    for (const f of [41, 40, 39, 38, 37, 36, 35, 1, 2]) {
      await gotoFrame(page, f);
      const none = await page.evaluate(() => ({ inputs: document.querySelectorAll('section[aria-label="Details"] input[data-field]').length, text: document.querySelector('section[aria-label="Top view"]').innerText.replace(/\s+/g, ' ') }));
      if (none.inputs === 0) { absent = { frame: f, text: none.text.slice(0, 150) }; break; }
    }
    if (absent) {
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Control+z');
      await page.waitForTimeout(400);
      check(`G6 · a frame where the car has no box (frame ${absent.frame}): the editor stays, says so, offers no number fields; arrows and Ctrl+Z change nothing`, /has no box in this frame/i.test(absent.text) && JSON.stringify(await carEdit(page)) === JSON.stringify(kept) && Object.keys(await edits(page)).length === 1, absent.text);
    } else {
      check('G6 · (a frame where the car has no box)', true, 'the car has a box in every frame that was tried — not exercised');
    }
    await gotoFrame(page, 9);
    check('G6 · … back on frame 9 the editor is on the car again, with its edit', (await changeText(page)) === 'moved 0.50 m');
    // another scene from the picker
    await gotoScene(page, 'scene-0061');
    const other = await page.evaluate(() => ({ editor: !!document.querySelector('section[aria-label="Top view"]'), text: (document.querySelector('section[aria-label="Top view"]') || { innerText: '' }).innerText.replace(/\s+/g, ' ').slice(0, 120), bar: document.querySelector('main').parentElement.children[1].innerText.replace(/\s+/g, ' ').slice(0, 60) }));
    check('G6 · another scene picked while editing: the editor stays open with no box ("no box selected"), nothing crashes, the 3D canvas is the same one', other.editor && /no box selected/i.test(other.bar) && page.__errors.length === 0 && (await page.evaluate(() => document.querySelector('section[aria-label="3D view"] canvas').__mark === 'same')), `${other.bar} | ${other.text}`);
    await shot(page, 'g6_other_scene_no_box');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(300);
    check('G6 · … keys there change nothing (the car’s edit in the other scene is as it was)', JSON.stringify(await carEdit(page)) === JSON.stringify(kept));
    await leave(page);
    check('G6 · … Esc closes the editor and the review screen of the new scene is there (list rows)', !(await editorOpen(page)) && (await page.locator(`${LIST} li`).count()) > 0);

    // practice switched on while the editor is open
    await gotoScene(page, 'scene-0916');
    await selectCar(page);
    await enter(page);
    await page.getByRole('button', { name: /practice/i }).first().click();
    await page.waitForTimeout(2800);
    const practice = await page.evaluate(() => ({ editor: !!document.querySelector('section[aria-label="Top view"]'), bar: document.querySelector('main').parentElement.children[1].innerText.replace(/\s+/g, ' ').slice(0, 90), header: /practice/i.test(document.querySelector('header').innerText) }));
    const m = await marks(page);
    check('G6 · Practice switched on while editing: the data becomes the practice set, the real edit is NOT shown on it, no crash (recorded: whether the editor stays open)', practice.header && m.rows === 0 && m.count === null && page.__errors.length === 0, `editor ${practice.editor ? 'open' : 'closed'} · ${practice.bar}`);
    if (practice.editor) await leave(page);
    await page.getByRole('button', { name: /practice/i }).first().click();
    await page.waitForTimeout(2800);
    check('G6 · … Practice off again: the real edit is back', (await marks(page)).count === '1 edited');

    // another mode, another dataset
    await selectCar(page);
    await enter(page);
    await page.getByRole('button', { name: 'Evaluate', exact: true }).click();
    await page.waitForTimeout(2500);
    const evalOpen = await editorOpen(page);
    await page.keyboard.press('e');
    await page.waitForTimeout(600);
    const evalAfterE = await editorOpen(page);
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.waitForTimeout(1500);
    check('G6 · Evaluate clicked while editing: the editor closes, E does nothing in Evaluate, and back in Review it is still closed', !evalOpen && !evalAfterE && !(await editorOpen(page)) && page.__errors.length === 0);
    await row(page, '527702').click().catch(() => undefined);
    await page.waitForTimeout(300);
    if (!(await editorOpen(page))) await enter(page);
    await page.getByRole('button', { name: 'COCO', exact: true }).click();
    await page.waitForTimeout(2500);
    const coco = await page.evaluate(() => ({ editor: !!document.querySelector('section[aria-label="Top view"]'), editButton: [...document.querySelectorAll('button')].some((b) => /Edit box|Edited · edit/.test(b.innerText)), marks: document.querySelectorAll('[data-edited]').length }));
    await page.locator(`${LIST} li`).first().click().catch(() => undefined);
    await page.keyboard.press('e');
    await page.waitForTimeout(600);
    check('G6 · COCO chosen while editing: the editor closes; on COCO there is no Edit button, no mark, and E does nothing', !coco.editor && !coco.editButton && coco.marks === 0 && !(await editorOpen(page)) && page.__errors.length === 0, JSON.stringify(coco));
    await page.getByRole('button', { name: 'nuScenes', exact: true }).click();
    await page.waitForTimeout(3500);
    check('G6 · … back on nuScenes the edit is still there', (await carEdit(page)) !== null && page.__errors.length === 0, page.__errors.join(' | ').slice(0, 160));
    await context.close();
  });

  // ---- G7: keys with no pause ---------------------------------------------------------------------------
  await scenario('G7 keys with no pause', async () => {
    const { context, page } = await open(browser, 1536, 700, { seed: [[REVIEW_KEY, goodReviews]] });
    await page.waitForTimeout(2500);
    await selectCar(page);
    for (const k of ['e', 'Escape', 'e', 'v', 'v', 'Escape', 'e', 'Escape', 'e']) await page.keyboard.press(k);
    await page.waitForTimeout(1500);
    check('G7 · E Esc E V V Esc E Esc E with no pause: the editor ends open on the car, no error', (await editorOpen(page)) && page.__errors.length === 0, page.__errors.join(' | ').slice(0, 160));
    for (let i = 0; i < 12; i += 1) await page.keyboard.press('Control+z');
    for (let i = 0; i < 6; i += 1) await page.keyboard.press('Control+y');
    check('G7 · Ctrl+Z ×12 and Ctrl+Y ×6 with nothing to undo: nothing stored, no error', (await carEdit(page)) === null && page.__errors.length === 0);
    // one rejected box only (the car) → reject two more so there is a walk, then N without pause
    await leave(page);
    await page.locator(`${LIST} li`).nth(2).click();
    await page.waitForTimeout(300);
    await page.keyboard.press('r');
    await gotoFrame(page, 14);
    await page.locator(`${LIST} li`).nth(1).click();
    await page.waitForTimeout(300);
    await page.keyboard.press('r');
    await page.waitForTimeout(300);
    await enter(page);
    for (let i = 0; i < 9; i += 1) { await page.keyboard.press('n'); await page.keyboard.press('ArrowRight'); }
    await page.waitForTimeout(1800);
    const walk = await page.evaluate(() => (document.querySelector('[data-part="rejected-walk"]') || { innerText: '' }).innerText.replace(/\s+/g, ' '));
    check('G7 · N and → alternating 9 times with no pause: the walk moved, and NOT ONE box was moved by the arrows (each came within 0.4 s of an arrival)', /Rejected \d \/ 3/.test(walk) && Object.keys(await edits(page)).length === 0 && page.__errors.length === 0, `${walk} · stored edits: ${Object.keys(await edits(page)).length}`);
    await context.close();
  });

  // ---- G8: reload with the editor open; many open / close cycles --------------------------------------------
  await scenario('G8 reload and cycles', async () => {
    const { context, page } = await open(browser);
    await selectCar(page);
    await enter(page);
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(500);
    const before = JSON.stringify(await carEdit(page));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector(`${VIEW3D} canvas`);
    await page.waitForTimeout(2500);
    check('G8 · reload with the editor open: the editor is closed afterwards, the edit is kept', !(await editorOpen(page)) && JSON.stringify(await carEdit(page)) === before);
    await selectCar(page);
    await page.waitForTimeout(500);
    const g0 = await geometries(page);
    for (let i = 0; i < 15; i += 1) { await page.keyboard.press('e'); await page.waitForTimeout(140); await page.keyboard.press('v'); await page.waitForTimeout(140); await page.keyboard.press('Escape'); await page.waitForTimeout(140); }
    await page.waitForTimeout(1500);
    const g1 = await geometries(page);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(400);
    check('G8 · 15 open / switch view / close cycles: the 3D scene holds as many geometries as before (nothing piles up), and with the editor closed the arrows and Ctrl+Z do nothing', g0 !== null && g1 === g0 && JSON.stringify(await carEdit(page)) === before && page.__errors.length === 0, `geometries ${g0} → ${g1}`);
    await context.close();
  });

  // ---- G9: window sizes outside what was promised ----------------------------------------------------------------
  for (const [w, h] of [[390, 800], [768, 900], [1024, 600], [1280, 560], [2560, 1300]]) {
    await scenario(`G9 ${w}×${h}`, async () => {
      const { context, page } = await open(browser, w, h, { seed: [[REVIEW_KEY, goodReviews], [EDIT_KEY, goodEdits]] });
      await gotoFrame(page, 9);
      const scroll0 = await overflow(page);
      await row(page, '527702').scrollIntoViewIfNeeded();
      await row(page, '527702').click();
      await page.waitForTimeout(450);
      await enter(page);
      const info = await page.evaluate(() => {
        const ed = document.querySelector('section[aria-label="Top view"]');
        if (!ed) return { editor: false };
        const e = ed.getBoundingClientRect();
        const bar = document.querySelector('main').parentElement.children[1].firstElementChild;
        const b = bar.getBoundingClientRect();
        const bad = [];
        for (const el of bar.querySelectorAll('button, span')) { const r = el.getBoundingClientRect(); if (r.width > 0 && (r.right > window.innerWidth + 0.5 || r.left < -0.5)) { bad.push(`"${el.innerText.trim().slice(0, 18)}" outside the window`); break; } }
        const inputs = [...document.querySelectorAll('section[aria-label="Details"] input[data-field]')];
        for (const el of inputs) { if (el.scrollWidth > el.clientWidth + 1) bad.push(`value ${el.value} cut`); const r = el.getBoundingClientRect(); if (r.right > window.innerWidth + 0.5) bad.push('a number field outside the window'); }
        const d = document.documentElement;
        return { editor: true, size: `${Math.round(e.width)}×${Math.round(e.height)}`, barHeight: Math.round(b.height), inputs: inputs.length, bad, x: d.scrollWidth - d.clientWidth, y: d.scrollHeight - d.clientHeight, handles: ed.querySelectorAll('[data-handle]').length };
      });
      const usable = info.editor && info.inputs === 5 && info.bad.length === 0 && info.x <= 0;
      const fixedLayout = w >= 1024;
      check(`G9 · ${w}×${h}${fixedLayout ? '' : ' (below the supported width: the page stacks and scrolls)'}: the editor opens, all five number fields are there, nothing runs out of the window sideways${fixedLayout ? ', and the editor adds no page scroll (what there was before opening it stays)' : ''}`, usable && (!fixedLayout || info.y <= scroll0.y), `${JSON.stringify(info)} · before opening: x ${scroll0.x}, y ${scroll0.y}`);
      if (info.editor) {
        // can a number be changed and is the change line reachable?
        await page.locator(`${DETAILS} input[data-field="lift"]`).scrollIntoViewIfNeeded();
        await type(page, 'lift', '0.30');
        const reach = await page.evaluate(() => { const c = document.querySelector('[data-part="change"]'); if (!c) return null; c.scrollIntoView({ block: 'nearest' }); const r = c.getBoundingClientRect(); const top = document.elementFromPoint(Math.min(window.innerWidth - 2, r.left + 5), r.top + 5); return { visible: r.top >= 0 && r.bottom <= window.innerHeight + 0.5, onTop: !!top && (c.contains(top) || top.contains(c)), text: c.innerText.replace(/\s+/g, ' ').slice(0, 80) }; });
        check(`G9 · ${w}×${h}: a number can be typed and the "Changed from the label" line can be brought into view (by scrolling the panel if needed)`, reach && reach.visible && /raised 0\.30 m/.test(reach.text), JSON.stringify(reach));
      }
      if (!fixedLayout && info.editor) {
        // stacked layout: no empty cell between the timeline and the panel with the numbers
        const stack = await page.evaluate(() => {
          const rect = (label) => { const el = document.querySelector(`section[aria-label="${label}"]`); return el ? el.getBoundingClientRect() : null; };
          const list = rect('Objects');
          const frames = rect('Frames');
          const details = rect('Details');
          const top = rect('Top view');
          return { listHeight: list ? Math.round(list.height) : -1, gap: Math.round(details.top - frames.bottom), topViewFirst: top.top < frames.top && top.top < details.top };
        });
        check(`G9 · ${w}×${h}: stacked — the top view comes first, the empty list cell is left out, and the panel with the numbers follows the timeline directly`, stack.listHeight === 0 && stack.gap < 40 && stack.topViewFirst, JSON.stringify(stack));
        await page.screenshot({ path: path.join(OUT, 'shots', `g9_${w}x${h}_full.png`), fullPage: true });
        await leave(page);
        const back = await page.evaluate(() => Math.round(document.querySelector('section[aria-label="Objects"]').getBoundingClientRect().height));
        check(`G9 · ${w}×${h}: … and after Done the list is back`, back > 100 && (await page.locator('section[aria-label="Objects"] li').count()) > 0, `${back}px`);
      }
      await shot(page, `g9_${w}x${h}`);
      check(`G9 · ${w}×${h}: no page errors`, page.__errors.length === 0, page.__errors.join(' | ').slice(0, 160));
      await context.close();
    });
  }

  // ---- G10: the longest names in the edit bar ----------------------------------------------------------------------
  await scenario('G10 longest names', async () => {
    const { context, page } = await open(browser, 1024, 768, { seed: [[REVIEW_KEY, goodReviews]], init: () => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'ai-detection-viewer.box-edits') throw new DOMException('full', 'QuotaExceededError'); return original.call(this, k, v); }; } });
    await page.waitForTimeout(2500);
    await gotoScene(page, 'scene-0061');
    // the longest class label in the list of any frame of this scene
    let best = { length: 0 };
    for (const f of [1, 10, 20, 30]) {
      await gotoFrame(page, f);
      const found = await page.evaluate(() => { let top = { length: 0 }; [...document.querySelectorAll('section[aria-label="Objects"] li')].forEach((li, i) => { const t = li.children[1].textContent.trim(); if (t.length > top.length) top = { length: t.length, text: t, index: i }; }); return top; });
      if (found.length > best.length) best = { ...found, frame: f };
    }
    await gotoFrame(page, best.frame);
    await page.locator(`${LIST} li`).nth(best.index).scrollIntoViewIfNeeded();
    await page.locator(`${LIST} li`).nth(best.index).click();
    await page.waitForTimeout(400);
    await page.keyboard.press('r');
    await enter(page);
    await page.waitForTimeout(400);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(500);
    const bar = await page.evaluate(() => {
      const slot = document.querySelector('main').parentElement.children[1];
      const el = slot.firstElementChild;
      const box = el.getBoundingClientRect();
      const kids = [...el.children].filter((k) => k.getBoundingClientRect().width > 0).map((k) => k.getBoundingClientRect());
      const bad = [];
      kids.forEach((r, i) => { if (r.right > box.right + 0.5) bad.push(`part ${i} outside`); if (r.bottom > slot.getBoundingClientRect().bottom + 0.5) bad.push(`part ${i} below`); if (i > 0 && r.left < kids[i - 1].right - 0.5) bad.push(`part ${i} over ${i - 1}`); });
      return { bad, text: el.innerText.replace(/\s+/g, ' ').slice(0, 110), spare: Math.round(kids[kids.length - 1].left - kids[kids.length - 2].right) };
    });
    check(`G10 · 1024 px, the longest class name of scene-0061 ("${best.text}"), the "Rejected" group AND "Not saved": the edit bar is one line, nothing overlapping`, bar.bad.length === 0, `${bar.bad.join('; ') || 'ok'} · room left ${bar.spare}px · ${bar.text}`);
    await shot(page, 'g10_longest_name_1024', { x: 0, y: 0, width: 1024, height: 100 });
    await context.close();
  });

  // ---- G11: a scene that cannot be loaded ---------------------------------------------------------------------------
  await scenario('G11 a scene that fails', async () => {
    const seedReviews = JSON.parse(goodReviews);
    const context = await newContext(browser, 1536, 700, { seed: [[REVIEW_KEY, JSON.stringify(seedReviews)]] });
    await context.route('**/scenes/scene-0061/frames.json', (route) => route.abort());
    const page = await openPage(context, 5000);
    await selectCar(page);
    await enter(page);
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(500);
    for (let i = 0; i < 4; i += 1) { await page.keyboard.press('n'); await page.waitForTimeout(900); }
    const state = await page.evaluate(() => ({ editor: !!document.querySelector('section[aria-label="Top view"]'), scene: [...document.querySelectorAll('section[aria-label="Frames"] button')].map((b) => b.innerText).find((t) => /scene-\d+/.test(t)) }));
    check('G11 · one scene’s file cannot be loaded: editing and N in the other scenes work, the editor never lands on the missing scene, no page error', state.editor && /scene-0916/.test(state.scene) && page.__errors.length === 0, `${state.scene.replace(/\s+/g, ' ').slice(0, 30)} · ${page.__errors.join(' | ').slice(0, 120)}`);
    await leave(page);
    await page.getByRole('button', { name: /^Export/ }).click();
    const note = await page.evaluate(() => [...document.querySelectorAll('[role="menu"][aria-label="Export reviews"] p')].map((p) => p.innerText).join(' / '));
    check('G11 · … the export menu says the file covers 9 of 10 scenes', /9 of 10 scenes/.test(note), note);
    await context.close();
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\ng: ${results.length - failed} / ${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
  fs.writeFileSync(path.join(OUT, 'g.result.json'), JSON.stringify(results, null, 1));
})();
