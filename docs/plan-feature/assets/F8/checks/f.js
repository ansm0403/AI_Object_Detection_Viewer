// F8 step F: walking through the REJECTED boxes from inside the editor (N / P, ‹ ›) — across
// frames and scenes. Real app, production build on :3100.
// usage: node f.js <repoRoot> <outDir>
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
  details: 'section[aria-label="Details"]',
  frames: 'section[aria-label="Frames"]',
  thumbs: 'section[aria-label="Camera thumbnails"]',
  editor: 'section[aria-label="Top view"]',
};
const EDIT_KEY = 'ai-detection-viewer.box-edits';
const REVIEW_KEY = 'ai-detection-viewer.review';

async function open(browser, width = 1536, height = 700, { seed, failEdits } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  if (seed) await context.addInitScript((pairs) => { for (const [k, v] of pairs) if (v !== null && localStorage.getItem(k) === null) localStorage.setItem(k, v); }, seed);
  if (failEdits) {
    await context.addInitScript((key) => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function setItem(k, v) { if (k === key) throw new DOMException('full', 'QuotaExceededError'); return original.call(this, k, v); };
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
const gotoScene = async (page, name) => {
  await page.locator(`${SEL.frames} button`, { hasText: /scene-/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('option', { name: new RegExp(name) }).first().click().catch(async () => { await page.getByText(name).first().click(); });
  await page.waitForTimeout(3000);
};
const row = (page, idPrefix) => page.locator(`${SEL.list} li`, { has: page.locator(`span.font-mono[title^="${idPrefix}"]`) }).first();
/** Click a list row and return the full id of its box. */
const selectRow = async (page, index) => {
  const li = page.locator(`${SEL.list} li`).nth(index);
  await li.click();
  await page.waitForTimeout(400);
  const id = await li.locator('span.font-mono').getAttribute('title');
  classOf[id] = await li.locator('span[title]').first().getAttribute('title');
  return id;
};
const classOf = {};
const enterEditor = async (page) => { await page.keyboard.press('e'); await page.waitForTimeout(900); };
const leaveEditor = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(700); };
const storedEdits = (page, scope = 'nuscenes') => page.evaluate(([key, s]) => { const v = localStorage.getItem(key); return v ? JSON.parse(v).state.edits[s] : {}; }, [EDIT_KEY, scope]);
const rawStorage = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
/** What the editor is on, read from the screen. */
const where = (page) => page.evaluate(() => {
  const bar = document.querySelector('main').parentElement.children[1];
  const walk = bar.querySelector('[data-part="rejected-walk"]');
  const scene = [...document.querySelectorAll('section[aria-label="Frames"] button')].map((b) => b.innerText).find((t) => /scene-\d+/.test(t));
  const text = bar.innerText.replace(/\s+/g, ' ');
  const box = document.querySelector('section[aria-label="Top view"] [data-part="box"]');
  const ed = document.querySelector('section[aria-label="Top view"]');
  const btn = (name) => { const b = bar.querySelector(`button[aria-label="${name}"]`); return b ? !b.disabled : null; };
  return {
    editor: !!ed,
    scene: scene ? scene.match(/scene-\d+/)[0] : null,
    frame: Number((text.match(/frame (\d+)/) || [])[1] || 0),
    id: (bar.querySelector('span.font-mono') || { title: null }).title,
    walk: walk ? walk.innerText.replace(/\s+/g, ' ') : null,
    next: btn('Next rejected box'),
    prev: btn('Previous rejected box'),
    undo: btn('Undo'),
    revert: btn('Revert to label'),
    locked: (document.querySelector('section[aria-label="Top view"] [data-part="locked"]') || { innerText: null }).innerText,
    handles: document.querySelectorAll('section[aria-label="Top view"] [data-handle]').length,
    boxOnScreen: box && ed ? (() => { const b = box.getBoundingClientRect(); const e = ed.getBoundingClientRect(); return b.left >= e.left && b.right <= e.right && b.top >= e.top && b.bottom <= e.bottom && Math.min(b.width, b.height) >= 12; })() : false,
    cameraSees: !!document.querySelector('section[aria-label="Camera thumbnails"] button[aria-pressed="true"][aria-label*="sees the selected box"]'),
  };
});
const short = (w) => `${w.scene} f${w.frame} ${String(w.id).slice(0, 6)} [${w.walk}]`;
const press = async (page, key, wait = 1200) => { await page.keyboard.press(key); await page.waitForTimeout(wait); };
const waitScene = (page, name) => page.waitForFunction((n) => [...document.querySelectorAll('section[aria-label="Frames"] button')].some((b) => b.innerText.includes(n)), name, { timeout: 30000 }).catch(() => undefined);

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let seed = null;
  const ids = {};

  // =====================================================================
  // 1. nothing rejected; then four rejected boxes in two scenes
  // =====================================================================
  {
    const { context, page } = await open(browser);
    await page.waitForTimeout(3500); // the other scenes arrive in the background
    await page.evaluate(() => { document.querySelector('section[aria-label="3D view"] canvas').__mark = 'same'; });
    await gotoFrame(page, 9);
    await row(page, '527702').click();
    await page.waitForTimeout(400);
    await enterEditor(page);
    let w = await where(page);
    check('F · nothing rejected: the bar has no "Rejected" group, and N / P do nothing', w.walk === null && w.next === null && w.frame === 9, short(w));
    await press(page, 'n', 500);
    await press(page, 'p', 500);
    w = await where(page);
    check('F · … still on the same box, the editor open', w.editor && w.frame === 9 && String(w.id).startsWith('527702'), short(w));
    await leaveEditor(page);

    // reject: scene-0916 frame 9 (a person and the car 527702), frame 12 (one box), scene-0061 frame 3 (one box)
    const personRow = page.locator(`${SEL.list} li`).filter({ has: page.locator('span[title="person"]') }).first();
    const firstClass = (await personRow.innerText()).replace(/\s+/g, ' ');
    const carRowIndex = await page.evaluate(() => [...document.querySelectorAll('section[aria-label="Objects"] li')].findIndex((li) => li.querySelector('span.font-mono').title.startsWith('527702')));
    const personRowIndex = await page.evaluate(() => [...document.querySelectorAll('section[aria-label="Objects"] li')].findIndex((li) => li.querySelector('span[title="person"]')));
    await personRow.click();
    await page.waitForTimeout(400);
    ids.person = await personRow.locator('span.font-mono').getAttribute('title');
    await page.keyboard.press('r');
    await page.waitForTimeout(250);
    await row(page, '527702').click();
    await page.waitForTimeout(300);
    ids.car = await row(page, '527702').locator('span.font-mono').getAttribute('title');
    await page.keyboard.press('r');
    await page.waitForTimeout(250);
    await gotoFrame(page, 12);
    ids.f12 = await selectRow(page, 4);
    await page.keyboard.press('r');
    await page.waitForTimeout(250);
    // an approved and an unsure box: they must not be part of the walk
    await selectRow(page, 6);
    await page.keyboard.press('u');
    await page.waitForTimeout(250);
    await gotoScene(page, 'scene-0061');
    await gotoFrame(page, 3);
    ids.other = await selectRow(page, 1);
    await page.keyboard.press('r');
    await page.waitForTimeout(300);
    seed = [[REVIEW_KEY, await rawStorage(page, REVIEW_KEY)]];
    const rejectedCount = Object.values(JSON.parse(seed[0][1]).state.reviews.nuscenes).filter((r) => r.verdict === 'rejected').length;
    check('F · (setup) four boxes rejected: scene-0061 frame 3, scene-0916 frame 9 (two) and frame 12', rejectedCount === 4 && /^person/.test(firstClass) && personRowIndex < carRowIndex, `${rejectedCount} rejected · the person is row ${personRowIndex + 1} (${firstClass.slice(0, 26)}), the car row ${carRowIndex + 1}`);

    // ---- the walk: scene order, frame order, box order ----------------------------------
    await enterEditor(page);
    w = await where(page);
    check('F · in the editor on the scene-0061 box: "Rejected 1 / 4" (scene-0061 comes first in the catalog), both arrows enabled', w.walk === 'Rejected 1 / 4' && w.next === true && w.prev === true && w.id === ids.other, short(w));
    await shot(page, 'f1_walk_first');
    await press(page, 'n', 400);
    await waitScene(page, 'scene-0916');
    await page.waitForTimeout(2500);
    w = await where(page);
    check('F · N: the next one is in ANOTHER scene — scene-0916 frame 9, the person: "Rejected 2 / 4", the editor still open', w.editor && w.scene === 'scene-0916' && w.frame === 9 && w.id === ids.person && w.walk === 'Rejected 2 / 4', short(w));
    check('F · … the top view is on the new box (box on screen, handles offered, not locked) and the photo is one that sees it', w.boxOnScreen && w.handles > 0 && w.locked === null && w.cameraSees, JSON.stringify({ boxOnScreen: w.boxOnScreen, handles: w.handles, locked: w.locked, cameraSees: w.cameraSees }));
    check('F · … the 3D canvas was not re-created by the scene change', await page.evaluate(() => document.querySelector('section[aria-label="3D view"] canvas').__mark === 'same'));
    await shot(page, 'f2_walk_other_scene');
    await press(page, 'n');
    w = await where(page);
    check('F · N: the next one in the same frame — the car: "Rejected 3 / 4"', w.frame === 9 && w.id === ids.car && w.walk === 'Rejected 3 / 4', short(w));
    await press(page, 'n');
    w = await where(page);
    check('F · N: the next frame that has one — frame 12: "Rejected 4 / 4" (the unsure box of that frame is not part of the walk)', w.frame === 12 && w.id === ids.f12 && w.walk === 'Rejected 4 / 4', short(w));
    await press(page, 'n', 400);
    await waitScene(page, 'scene-0061');
    await page.waitForTimeout(2500);
    w = await where(page);
    check('F · N on the last one wraps around to the first (scene-0061 frame 3)', w.scene === 'scene-0061' && w.frame === 3 && w.id === ids.other && w.walk === 'Rejected 1 / 4', short(w));
    await press(page, 'p', 400);
    await waitScene(page, 'scene-0916');
    await page.waitForTimeout(2500);
    w = await where(page);
    check('F · P on the first one wraps around to the last (scene-0916 frame 12)', w.scene === 'scene-0916' && w.frame === 12 && w.id === ids.f12 && w.walk === 'Rejected 4 / 4', short(w));
    await press(page, 'p');
    await press(page, 'p');
    w = await where(page);
    check('F · P twice: back over the car to the person of frame 9', w.frame === 9 && w.id === ids.person && w.walk === 'Rejected 2 / 4', short(w));
    // the buttons do the same as the keys
    await page.locator('button[aria-label="Next rejected box"]').click();
    await page.waitForTimeout(1200);
    w = await where(page);
    const afterClick = short(w);
    await page.locator('button[aria-label="Previous rejected box"]').click();
    await page.waitForTimeout(1200);
    const w2 = await where(page);
    check('F · the › and ‹ buttons do what N and P do', w.id === ids.car && w2.id === ids.person, `${afterClick} → ${short(w2)}`);

    // ---- keys right after a step do not reach a box nobody looked at -------------------------
    await page.keyboard.press('n');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowUp');
    await page.waitForTimeout(700);
    w = await where(page);
    check('F · arrows pressed right after N (within 0.4 s) move neither the box that was left nor the one arrived at', w.id === ids.car && Object.keys(await storedEdits(page)).length === 0, short(w));
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(400);
    const afterWait = await storedEdits(page);
    check('F · after that moment the arrow moves the box on screen (the car), and only it', Object.keys(afterWait).length === 1 && Object.keys(afterWait)[0].endsWith(ids.car), Object.keys(afterWait).map((k) => k.slice(-32, -26)).join(','));

    // ---- a held key steps once ---------------------------------------------------------------
    for (let i = 0; i < 6; i += 1) { await page.keyboard.down('n'); await page.waitForTimeout(40); }
    await page.keyboard.up('n');
    await page.waitForTimeout(1300);
    w = await where(page);
    check('F · holding N (6 key repeats) goes ONE box further, not six', w.frame === 12 && w.id === ids.f12, short(w));

    // ---- the undo history belongs to the visit of a box ---------------------------------------
    await press(page, 'p');
    w = await where(page);
    check('F · back on the car: its edit is still there (Revert enabled), its undo steps are not (Undo disabled)', w.id === ids.car && w.revert === true && w.undo === false && Object.keys(await storedEdits(page)).length === 1, JSON.stringify({ undo: w.undo, revert: w.revert }));

    // ---- N while typing a number is not a step -------------------------------------------------
    const field = page.locator(`${SEL.details} input[data-field="length"]`);
    await field.click();
    await page.keyboard.press('n');
    await page.keyboard.press('p');
    await page.waitForTimeout(500);
    w = await where(page);
    check('F · N / P typed into a number field do not leave the box', w.id === ids.car && w.frame === 9, short(w));
    await field.press('Escape');
    await page.locator(`${SEL.editor} [data-part="scale"]`).click({ force: true }).catch(() => undefined);

    // ---- a step while the box is being dragged ---------------------------------------------------
    const before = JSON.stringify(await storedEdits(page));
    const b = await page.locator(`${SEL.editor} [data-part="box"]`).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 30, b.y + b.height / 2 - 14, { steps: 5 });
    await page.waitForTimeout(150);
    await page.keyboard.press('n');
    await page.waitForTimeout(600);
    const mid = await where(page);
    await page.mouse.up();
    await page.waitForTimeout(500);
    w = await where(page);
    const after = await storedEdits(page);
    check('F · N pressed WHILE dragging does not step; on release the drag is stored on the box that was dragged', mid.id === ids.car && mid.next === false && w.id === ids.car && Object.keys(after).length === 1 && JSON.stringify(after) !== before, `${short(mid)} → ${short(w)}`);

    // ---- from a box that is not rejected ------------------------------------------------------------
    await leaveEditor(page);
    await gotoFrame(page, 10);
    await selectRow(page, 3);
    await enterEditor(page);
    w = await where(page);
    check('F · on a box that is not rejected (frame 10): "Rejected – / 4"', w.walk === 'Rejected – / 4' && w.next === true && w.prev === true, short(w));
    await shot(page, 'f3_walk_not_on_one');
    await press(page, 'n');
    w = await where(page);
    check('F · … N goes to the nearest one after it (frame 12)', w.frame === 12 && w.id === ids.f12, short(w));
    await leaveEditor(page);
    await gotoFrame(page, 10);
    await selectRow(page, 3);
    await enterEditor(page);
    await press(page, 'p');
    w = await where(page);
    check('F · … P goes to the nearest one before it (frame 9, the car — the last rejected box of that frame)', w.frame === 9 && w.id === ids.car, short(w));

    // ---- un-rejecting a box takes it out of the walk -------------------------------------------------
    await leaveEditor(page);
    await page.keyboard.press('a'); // the car: approved now
    await page.waitForTimeout(500);
    await row(page, '527702').click();
    await page.waitForTimeout(300);
    await enterEditor(page);
    w = await where(page);
    check('F · the car approved instead: "Rejected – / 3" — the walk follows the verdicts as they are', w.walk === 'Rejected – / 3', short(w));
    await leaveEditor(page);
    await page.keyboard.press('r');
    await page.waitForTimeout(300);

    // ---- boxes hidden by the filters are skipped ---------------------------------------------------------
    await page.getByRole('button', { name: 'car', exact: true }).first().click();
    await page.waitForTimeout(500);
    await enterEditor(page);
    w = await where(page);
    // which of the four are cars (the classes were read from the list rows when they were rejected)
    const cars = [ids.other, ids.car, ids.f12].filter((id) => id === ids.car || classOf[id] === 'car');
    const total = Number((String(w.walk).match(/\/ (\d+)/) || [])[1]);
    const seen = [];
    for (let i = 0; i < cars.length; i += 1) {
      await press(page, 'p', 400);
      await page.waitForTimeout(2600);
      const at = await where(page);
      seen.push(at);
    }
    check(`F · with only the class "car" shown, the rejected person is not counted and not visited (the walk has ${cars.length} boxes; P ${cars.length} times comes back to the car without stopping on the person)`, total === cars.length && seen.every((at) => at.id !== ids.person && at.locked === null && at.editor) && seen[seen.length - 1].id === ids.car, `${short(w)} → ${seen.map(short).join(' → ')}`);
    check('F · the stored reviews were not changed by walking (4 rejected, 1 unsure)', (() => { const all = Object.values(JSON.parse(seed[0][1]).state.reviews.nuscenes); return all.filter((r) => r.verdict === 'rejected').length === 4; })());
    check('F · no page errors (walk)', page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  // =====================================================================
  // 2. one rejected box only; practice has its own
  // =====================================================================
  {
    const { context, page } = await open(browser);
    await gotoFrame(page, 9);
    await row(page, '527702').click();
    await page.waitForTimeout(300);
    await page.keyboard.press('r');
    await page.waitForTimeout(300);
    await enterEditor(page);
    let w = await where(page);
    check('F · one rejected box, and the editor is on it: "Rejected 1 / 1", both arrows disabled', w.walk === 'Rejected 1 / 1' && w.next === false && w.prev === false, short(w));
    await press(page, 'n', 500);
    w = await where(page);
    check('F · … N does nothing then', w.frame === 9 && String(w.id).startsWith('527702'), short(w));
    await leaveEditor(page);
    await gotoFrame(page, 20);
    await selectRow(page, 0);
    await enterEditor(page);
    w = await where(page);
    await press(page, 'n');
    const there = await where(page);
    check('F · from another frame the one rejected box is reachable ("Rejected – / 1" → N → frame 9)', w.walk === 'Rejected – / 1' && w.next === true && there.frame === 9 && String(there.id).startsWith('527702') && there.walk === 'Rejected 1 / 1', `${short(w)} → ${short(there)}`);
    await leaveEditor(page);

    // practice mode: its own verdicts
    await page.getByRole('button', { name: /practice/i }).first().click();
    await page.waitForTimeout(2600);
    await selectRow(page, 2);
    await enterEditor(page);
    w = await where(page);
    check('F · practice: the rejected box of the real annotations is NOT in the practice walk (no "Rejected" group)', w.walk === null, short(w));
    await leaveEditor(page);
    await page.keyboard.press('r');
    await page.waitForTimeout(300);
    await enterEditor(page);
    w = await where(page);
    check('F · practice: after rejecting a practice box: "Rejected 1 / 1"', w.walk === 'Rejected 1 / 1', short(w));
    check('F · no page errors (one box / practice)', page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  // =====================================================================
  // 3. the bar stays on one line with the group (four window sizes, both views, widest texts)
  // =====================================================================
  for (const failEdits of [false, true]) {
    for (const [w, h] of [[1024, 768], [1280, 720], [1400, 800], [1440, 900], [1536, 700]]) {
      const { context, page } = await open(browser, w, h, { seed, failEdits });
      await gotoFrame(page, 9);
      await row(page, '527702').click();
      await page.waitForTimeout(300);
      await enterEditor(page);
      if (failEdits) { await page.waitForTimeout(300); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400); }
      const measure = () => page.evaluate(() => {
        const slot = document.querySelector('main').parentElement.children[1];
        const bar = slot.firstElementChild;
        const box = bar.getBoundingClientRect();
        const bad = [];
        const kids = [...bar.children].filter((k) => k.getBoundingClientRect().width > 0);
        kids.forEach((k, i) => {
          const r = k.getBoundingClientRect();
          if (r.left < box.left - 0.5 || r.right > box.right + 0.5) bad.push(`part ${i} outside the bar`);
          if (r.bottom > slot.getBoundingClientRect().bottom + 0.5) bad.push(`part ${i} below the bar`);
          if (i > 0 && r.left < kids[i - 1].getBoundingClientRect().right - 0.5) bad.push(`part ${i} over part ${i - 1}`);
        });
        const group = bar.lastElementChild;
        const gk = [...group.children].filter((k) => k.getBoundingClientRect().width > 0).map((k) => k.getBoundingClientRect());
        gk.forEach((r, i) => { if (i > 0 && r.left < gk[i - 1].right - 0.5) bad.push(`button ${i} over ${i - 1}`); });
        const spare = Math.round(group.getBoundingClientRect().left - kids[kids.length - 2].getBoundingClientRect().right);
        const d = document.documentElement;
        return { bad: [...new Set(bad)], spare, notSaved: /Not saved/i.test(bar.innerText), pageScroll: d.scrollWidth > d.clientWidth || d.scrollHeight > d.clientHeight, walk: (bar.querySelector('[data-part="rejected-walk"]') || { innerText: '' }).innerText.replace(/\s+/g, ' ') };
      });
      const real = await measure();
      if (!failEdits && (w === 1024 || w === 1536)) await shot(page, `f4_bar_${w}`, { x: 0, y: 0, width: w, height: 100 });
      if (failEdits && w === 1400) await shot(page, 'f4_bar_not_saved_1400', { x: 0, y: 0, width: w, height: 100 });
      await page.evaluate(() => { const el = document.querySelector('[data-part="rejected-walk"]'); el.lastChild.textContent = ' 1000 / 1000'; });
      const widest = await measure();
      await page.keyboard.press('v');
      await page.waitForTimeout(1300);
      const split = await measure();
      check(`F · ${w}×${h}${failEdits ? ' + "Not saved"' : ''}: the edit bar with the "Rejected" group is one line, nothing overlapping — also with "Rejected 1000 / 1000", and in both views`, real.bad.length === 0 && widest.bad.length === 0 && split.bad.length === 0 && !real.pageScroll && real.notSaved === failEdits && /Rejected 3 \/ 4/.test(real.walk), `${[...real.bad, ...widest.bad, ...split.bad].join('; ') || 'ok'} · room left ${real.spare}px (widest ${widest.spare}px)`);
      check(`F · ${w}×${h}${failEdits ? ' + "Not saved"' : ''}: no page errors`, page.__errors.length === 0, page.__errors.join(' | '));
      await context.close();
    }
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nf: ${results.length - failed} / ${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
  fs.writeFileSync(path.join(OUT, 'f.result.json'), JSON.stringify(results, null, 1));
})();
