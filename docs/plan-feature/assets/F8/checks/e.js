// F8 step E: the export (review@3 — verdicts AND box edits) and, in practice mode, how close
// an edit came to the real label. Real app, production build on :3100.
// usage: node e.js <repoRoot> <outDir>
const repo = process.argv[2];
const OUT = process.argv[3];
const fs = require('fs');
const path = require('path');
const { chromium } = require(repo + '/node_modules/playwright');
const URL = process.env.CHECK_URL || 'http://localhost:3100';
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'exports'), { recursive: true });
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
  editor: 'section[aria-label="Top view"]',
};
const EDIT_KEY = 'ai-detection-viewer.box-edits';
const REVIEW_KEY = 'ai-detection-viewer.review';
const FRAME9 = '5b7cb170eee6468aa1fdbd3abcf63c5a';
const CAR = '52770232202d4ad1a98ed07d5b4c20b9';

async function open(browser, width = 1536, height = 700, { failEdits } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', acceptDownloads: true });
  if (failEdits) {
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
const enterEditor = async (page) => { await page.keyboard.press('e'); await page.waitForTimeout(900); };
const leaveEditor = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(700); };
const changeText = async (page) => (await page.locator('[data-part="change"]').innerText()).replace(/\s+/g, ' ').replace('Changed from the label: ', '');
const storedEdits = (page, scope = 'nuscenes') => page.evaluate(([key, s]) => { const v = localStorage.getItem(key); return v ? JSON.parse(v).state.edits[s] : {}; }, [EDIT_KEY, scope]);
const rawStorage = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
const openMenu = async (page) => {
  await page.getByRole('button', { name: /^Export/ }).click();
  await page.waitForTimeout(200);
  return page.evaluate(() => {
    const menu = document.querySelector('[role="menu"][aria-label="Export reviews"]');
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    return { text: menu.querySelector('p').innerText.replace(/\s+/g, ' '), notes: [...menu.querySelectorAll('p')].slice(1).map((p) => p.innerText), disabled: items.map((b) => b.disabled), labels: items.map((b) => b.innerText.replace(/\s+/g, ' ')) };
  });
};
const closeMenu = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(150); };
let downloads = 0;
/** Download through the menu and return the file's text and name. */
async function download(page, type) {
  await page.getByRole('button', { name: /^Export/ }).click();
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: type === 'json' ? /Download JSON/ : /Download CSV/ }).click(),
  ]);
  downloads += 1;
  const target = path.join(OUT, 'exports', `${downloads}_${file.suggestedFilename()}`);
  await file.saveAs(target);
  await page.waitForTimeout(200);
  return { name: file.suggestedFilename(), text: fs.readFileSync(target, 'utf8'), path: target };
}
const rawScene = async (page, scene) => (await page.request.get(`${URL}/sample-data/nuscenes/scenes/${scene}/frames.json`)).json();
const yawOf = ([w, x, y, z]) => Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
const waitAllScenes = (page) => page.waitForFunction(() => !/scenes that are loaded/.test(document.body.innerText), null, { timeout: 60000 }).catch(() => undefined);
const topBar = (page) => page.evaluate(() => {
  const slot = document.querySelector('main').parentElement.children[0];
  const bar = slot.firstElementChild;
  let bottom = 0;
  for (const el of bar.querySelectorAll('*')) { const b = el.getBoundingClientRect(); if (b.width > 0) bottom = Math.max(bottom, b.bottom); }
  const groups = [...bar.children].map((g) => g.getBoundingClientRect());
  return { wraps: bottom > slot.getBoundingClientRect().bottom + 0.5, spare: groups.length === 2 ? Math.round(groups[1].left - groups[0].right) : null };
});

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  // =====================================================================
  // 1. the export on the real annotations
  // =====================================================================
  {
    const { context, page } = await open(browser);
    await page.waitForTimeout(4000); // the other scenes arrive in the background
    let menu = await openMenu(page);
    check('E · nothing reviewed, nothing edited: the menu says "Nothing reviewed yet" and offers no download', menu.text === 'Nothing reviewed yet' && menu.disabled.every(Boolean), `${menu.text} · ${JSON.stringify(menu.disabled)}`);
    await closeMenu(page);

    // ---- an edit without a verdict ---------------------------------------------------
    await selectBox(page, 9, '527702');
    await enterEditor(page);
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(900);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    const typeField = async (name, text) => { const i = page.locator(`${SEL.details} input[data-field="${name}"]`); await i.click(); await i.fill(text); await i.press('Enter'); await page.waitForTimeout(300); };
    await typeField('length', '4.80');
    await typeField('heading', '165');
    await typeField('lift', '0.20');
    const shown = await changeText(page);
    await page.locator(`${SEL.editor} [data-part="scale"]`).click({ force: true }).catch(() => undefined);
    await leaveEditor(page);
    const reviewsBefore = await rawStorage(page, REVIEW_KEY);
    const editsBefore = await rawStorage(page, EDIT_KEY);
    menu = await openMenu(page);
    check('E · one box edited, none reviewed: the menu says "Nothing reviewed yet · 1 box edited"; the downloads are offered, Reset is not', menu.text === 'Nothing reviewed yet · 1 box edited' && menu.disabled.join() === 'false,false,true', `${menu.text} · ${JSON.stringify(menu.disabled)}`);
    await shot(page, 'e1_menu_edit_only', { x: 1536 - 420, y: 0, width: 420, height: 240 });
    await closeMenu(page);
    await waitAllScenes(page);

    const first = await download(page, 'json');
    const data = JSON.parse(first.text);
    check('E · the file is review@3 and its name is review_nuscenes_<date>-<time>.json', data.format === 'ai-detection-viewer/review@3' && /^review_nuscenes_\d{8}-\d{4}\.json$/.test(first.name), `${data.format} · ${first.name}`);
    check('E · it covers all 10 scenes and is not a practice file', data.scenes.length === 10 && data.practice === false, `${data.scenes.length} scenes`);
    check('E · summary: 18,538 boxes, 0 reviewed, 1 edited', data.summary.totalBoxes === 18538 && data.summary.reviewed === 0 && data.summary.edited === 1, JSON.stringify(data.summary));
    const r = data.reviews[0];
    check('E · one row: the edited box, with NO verdict (verdict null, no reasons, no review time)', data.reviews.length === 1 && r.objectId === CAR && r.frameId === FRAME9 && r.scene === 'scene-0916' && r.frameIndex === 9 && r.verdict === null && r.reasons.length === 0 && r.note === '' && r.reviewedAt === null && r.edit !== null, JSON.stringify({ ...r, edit: '…' }));
    // the numbers of the file against the words on screen
    const c = r.edit.change;
    const words = [
      `moved ${c.movedMetres.toFixed(2)} m`,
      `${c.liftMetres > 0 ? 'raised' : 'lowered'} ${Math.abs(c.liftMetres).toFixed(2)} m`,
      `length ${c.sizeDelta[1] >= 0 ? '+' : '−'}${Math.abs(c.sizeDelta[1]).toFixed(2)} m`,
      `turned ${c.turnedDegrees >= 0 ? '+' : '−'}${Math.abs(c.turnedDegrees).toFixed(1)}°`,
    ].join(' · ');
    check('E · "change" in the file is what the screen says, number for number', words === shown, `file: ${words} | screen: ${shown}`);
    // the original against the dataset file itself
    const raw = await rawScene(page, 'scene-0916');
    const ann = raw.frames.find((f) => f.token === FRAME9).annotations.find((a) => a.instanceToken === CAR);
    const o = r.edit.original;
    const worst = Math.max(...[0, 1, 2].map((i) => Math.abs(o.translation[i] - ann.translation[i])), ...[0, 1, 2].map((i) => Math.abs(o.size[i] - ann.size[i])));
    check('E · "original" in the file is the annotation in the nuScenes sample file (translation, size: within 0.000001 m; yaw within 0.000001 rad)', worst < 1e-6 && Math.abs(o.yaw - yawOf(ann.rotation)) < 1e-6, `largest difference ${worst.toExponential(1)} m, yaw ${Math.abs(o.yaw - yawOf(ann.rotation)).toExponential(1)} rad`);
    const stored = (await storedEdits(page))[`${FRAME9}/${CAR}`];
    const e = r.edit.edited;
    check('E · "edited" in the file is the stored edit (six decimals), with the quaternion [w, 0, 0, z] of its yaw', [0, 1, 2].every((i) => near(e.translation[i], stored.translation[i], 1e-6) && near(e.size[i], stored.size[i], 1e-6)) && near(e.yaw, stored.yaw, 1e-6) && near(e.rotation[0], Math.cos(stored.yaw / 2), 1e-6) && e.rotation[1] === 0 && e.rotation[2] === 0 && near(e.rotation[3], Math.sin(stored.yaw / 2), 1e-6) && r.edit.editedAt === stored.editedAt, JSON.stringify(e));
    check('E · no number in the file has more than six decimals', !/\d\.\d{7,}/.test(first.text));
    check('E · the word "correct" / "fixed" / "ground truth" is nowhere in the file', !/correct|fixed|ground.?truth/i.test(first.text));

    // ---- a verdict on the edited box, and one on another box ---------------------------
    await page.keyboard.press('r');
    await page.keyboard.press('3');
    await page.waitForTimeout(300);
    await page.locator(`${SEL.list} li`).nth(2).click();
    await page.waitForTimeout(400);
    await page.keyboard.press('a');
    await page.waitForTimeout(400);
    menu = await openMenu(page);
    check('E · two reviewed, one edited: "2 reviewed boxes in all scenes · 1 box edited · saved in this browser"', menu.text === '2 reviewed boxes in all scenes · 1 box edited · saved in this browser' && menu.disabled.join() === 'false,false,false', menu.text);
    await closeMenu(page);
    const second = JSON.parse((await download(page, 'json')).text);
    const edited = second.reviews.find((x) => x.objectId === CAR);
    const plain = second.reviews.find((x) => x.objectId !== CAR);
    check('E · two rows: the edited box now has its verdict AND its edit; the other has a verdict and edit null', second.reviews.length === 2 && edited.verdict === 'rejected' && edited.reasons.join() === 'wrong_position' && edited.edit !== null && plain.verdict === 'approved' && plain.edit === null && second.summary.reviewed === 2 && second.summary.edited === 1, JSON.stringify(second.summary));
    check('E · rows are in frame order, then the frame’s box order', second.reviews.every((x) => x.frameIndex === 9), second.reviews.map((x) => x.objectId.slice(0, 6)).join(','));

    // ---- CSV ---------------------------------------------------------------------------
    const csvFile = await download(page, 'csv');
    const lines = csvFile.text.replace(/^﻿/, '').trimEnd().split('\r\n');
    const header = lines[0].split(',');
    const cells = (id) => { const l = lines.find((x) => x.includes(id)).split(','); return Object.fromEntries(header.map((h, i) => [h, l[i]])); };
    check('E · CSV: starts with the byte-order mark, one header + 2 rows, every line with the same number of cells (25)', csvFile.text.charCodeAt(0) === 0xfeff && lines.length === 3 && lines.every((l) => l.split(',').length === 25), `${lines.length} lines, ${header.length} columns`);
    check('E · CSV: the columns are the review@2 ones, then the edit columns', lines[0] === 'scene,frameIndex,frameId,objectId,annotationToken,class,verdict,reasons,note,reviewedAt,edited,editedAt,moved_m,lift_m,d_width_m,d_length_m,d_height_m,turned_deg,edited_x_m,edited_y_m,edited_z_m,edited_width_m,edited_length_m,edited_height_m,edited_yaw_rad', lines[0]);
    const ce = cells(CAR);
    const cp = cells(plain.objectId);
    check('E · CSV: the edited row says true and carries the same numbers as the JSON; the other says false with empty cells', ce.edited === 'true' && Number(ce.moved_m) === edited.edit.change.movedMetres && Number(ce.d_length_m) === edited.edit.change.sizeDelta[1] && Number(ce.turned_deg) === edited.edit.change.turnedDegrees && Number(ce.edited_x_m) === edited.edit.edited.translation[0] && Number(ce.edited_yaw_rad) === edited.edit.edited.yaw && cp.edited === 'false' && cp.moved_m === '' && cp.edited_yaw_rad === '', JSON.stringify(ce).slice(0, 200));

    // ---- downloading changes nothing that is stored ---------------------------------------
    check('E · the edits as stored are what they were before the downloads', (await rawStorage(page, EDIT_KEY)) === editsBefore);

    // ---- an edit in another scene ------------------------------------------------------------
    await page.locator(`${SEL.frames} button`, { hasText: /scene-/ }).first().click();
    await page.waitForTimeout(300);
    await page.getByRole('option', { name: /scene-0061/ }).first().click().catch(async () => { await page.getByText('scene-0061').first().click(); });
    await page.waitForTimeout(3000);
    await gotoFrame(page, 3);
    await page.locator(`${SEL.list} li`).first().click();
    await page.waitForTimeout(500);
    await enterEditor(page);
    await page.keyboard.press('Shift+ArrowDown');
    await page.waitForTimeout(400);
    await leaveEditor(page);
    const third = JSON.parse((await download(page, 'json')).text);
    check('E · an edit in another scene: 3 rows, scene-0061 first (catalog order), its frame counted within its scene (3)', third.reviews.length === 3 && third.reviews[0].scene === 'scene-0061' && third.reviews[0].frameIndex === 3 && third.reviews[0].verdict === null && near(third.reviews[0].edit.change.movedMetres, 0.5, 1e-3) && third.summary.edited === 2, JSON.stringify(third.reviews.map((x) => [x.scene, x.frameIndex, x.verdict, x.edit ? x.edit.change.movedMetres : null])));
    fs.copyFileSync(path.join(OUT, 'exports', fs.readdirSync(path.join(OUT, 'exports')).sort((a, b) => Number(a.split('_')[0]) - Number(b.split('_')[0])).pop()), path.join(OUT, 'e_review_export_example.json'));

    // ---- reset reviews keeps the edits ----------------------------------------------------------
    await page.getByRole('button', { name: /^Export/ }).click();
    await page.getByRole('menuitem', { name: /Reset reviews/ }).click();
    await page.waitForTimeout(200);
    const armed = await page.evaluate(() => document.querySelector('[role="menu"][aria-label="Export reviews"]').innerText.replace(/\s+/g, ' '));
    check('E · "Reset reviews…" armed: it says the box edits are kept', /Click again to delete all 2/.test(armed) && /box edits are kept/.test(armed), armed.slice(-90));
    const fits = await page.evaluate(() => { const m = document.querySelector('[role="menu"][aria-label="Export reviews"]').getBoundingClientRect(); return [...document.querySelectorAll('[role="menu"][aria-label="Export reviews"] *')].every((el) => { const r = el.getBoundingClientRect(); return r.width === 0 || (r.left >= m.left - 0.5 && r.right <= m.right + 0.5); }); });
    check('E · … and every text of the armed menu is inside the menu (by position)', fits);
    await shot(page, 'e2_menu_reset_armed', { x: 1536 - 420, y: 0, width: 420, height: 260 });
    await page.getByRole('menuitem', { name: /Click again to delete/ }).click();
    await page.waitForTimeout(400);
    const afterReset = JSON.parse((await rawStorage(page, REVIEW_KEY)) || '{"state":{"reviews":{"nuscenes":{}}}}').state.reviews.nuscenes;
    check('E · after the reset: no reviews, both edits still stored', Object.keys(afterReset).length === 0 && Object.keys(await storedEdits(page)).length === 2);
    const fourth = JSON.parse((await download(page, 'json')).text);
    check('E · the file then holds the two edited boxes, both without a verdict', fourth.reviews.length === 2 && fourth.reviews.every((x) => x.verdict === null && x.edit) && fourth.summary.reviewed === 0 && fourth.summary.edited === 2);

    // ---- a reverted edit is not in the file --------------------------------------------------------
    await enterEditor(page);
    await page.locator('button[aria-label="Revert to label"]').click();
    await page.waitForTimeout(400);
    await leaveEditor(page);
    const fifth = JSON.parse((await download(page, 'json')).text);
    check('E · after Revert to label the box is not in the file any more', fifth.reviews.length === 1 && fifth.reviews[0].scene === 'scene-0916' && fifth.summary.edited === 1);
    void reviewsBefore;
    check('E · no page errors (export)', page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  // =====================================================================
  // 2. practice mode: the wording, and how close an edit came to the real label
  // =====================================================================
  for (const [w, h] of [[1536, 700], [1024, 768], [1440, 900]]) {
    const { context, page } = await open(browser, w, h);
    const main = w === 1536;
    await page.getByRole('button', { name: /practice/i }).first().click();
    await page.waitForTimeout(2600);
    const reveal = async () => { const b = page.getByRole('button', { name: 'Reveal answers' }); if (await b.count()) { await b.click(); await page.waitForTimeout(250); } };
    const closeness = () => page.evaluate(() => {
      const box = document.querySelector('[data-part="closeness"]');
      if (!box) return null;
      return { text: box.innerText.replace(/\s+/g, ' '), rows: [...box.querySelectorAll('tr[data-closeness]')].map((tr) => ({ id: tr.dataset.closeness, cells: [...tr.children].map((td) => td.innerText.replace(/\s+/g, ' ').trim()), tones: [...tr.querySelectorAll('td span[class*="text-"]')].map((s) => (s.className.match(/text-(emerald|rose|zinc)-300/) || [])[1]).filter(Boolean) })) };
    });
    if (main) check('E · practice: before "Reveal answers" the closeness block is not on the page', (await closeness()) === null);
    await reveal();
    const chips = await page.evaluate(() => [...document.querySelectorAll('section[aria-label="Details"] button[title$="— click to select"]')].map((b) => ({ text: b.innerText.replace(/\s+/g, ' '), title: b.title })));
    const first = await closeness();
    if (main) check('E · practice: after Reveal the block is there and says no box of this frame has been edited', first !== null && /Your edits · distance to the real label/i.test(first.text) && /No box of this frame has been edited/.test(first.text) && first.rows.length === 0, first ? first.text : 'missing');
    const position = chips.find((c) => /position/.test(c.text));
    if (!position) { check(`E · ${w}×${h}: (a planted position error in frame 1)`, false, JSON.stringify(chips)); await context.close(); continue; }
    const plantedMove = Number(position.title.match(/moved (\d+\.\d) m/)[1]);

    // ---- edit the planted box ---------------------------------------------------------
    await page.locator(`${SEL.details} button[title$="— click to select"]`, { hasText: position.text.split(' ')[0] }).click();
    await page.waitForTimeout(500);
    await enterEditor(page);
    const editorText = async () => page.evaluate(() => [document.querySelector('main').parentElement.children[1].innerText, document.querySelector('section[aria-label="Details"]').innerText, document.querySelector('section[aria-label="Top view"]').innerText].join(' | ').replace(/\s+/g, ' '));
    const before = await editorText();
    if (main) check('E · practice: the editor calls the box it starts from "practice label", never "nuScenes label"', /nothing — the box is the practice label/.test(before) && /on top of the practice label/.test(before) && !/nuScenes label/.test(before) && /in the original/.test(before), before.slice(0, 260));
    await page.keyboard.press('Shift+ArrowRight');
    await page.waitForTimeout(400);
    const after = await editorText();
    if (main) check('E · practice: once changed, the dashed outline is named "practice label" in the legend', /- - - practice label/.test(after) && !/nuScenes label/.test(after), after.slice(-200));
    // the counts row of the panel: its two halves must not overlap (the practice wording is longer)
    const countsRow = await page.evaluate(() => { const el = document.querySelector('section[aria-label="Details"] [data-part="points-in-view"]').closest('div'); const kids = [...el.children].map((k) => k.getBoundingClientRect()); const box = el.getBoundingClientRect(); return { gap: Math.round(kids[1].left - kids[0].right), inside: kids[0].left >= box.left && kids[1].right <= box.right + 0.5, text: el.innerText.replace(/\s+/g, ' ') }; });
    check(`E · ${w}×${h}: practice: the panel’s two point counts ("… in the original" / "In view …") do not touch`, countsRow.gap >= 8 && countsRow.inside, `${countsRow.gap}px between them · ${countsRow.text}`);
    if (main) await shot(page, 'e3_practice_editor');
    await leaveEditor(page);
    if (main) check('E · practice: after an edit, back in the panel, the answers are hidden again', (await closeness()) === null && (await page.getByRole('button', { name: 'Reveal answers' }).count()) === 1);
    await reveal();

    // expected numbers from the data: the stored edit against the annotation in the dataset file
    const practiceEdits = await storedEdits(page, 'nuscenes-practice');
    const key = Object.keys(practiceEdits)[0];
    const [frameId, objectId] = key.split('/');
    const raw = await rawScene(page, 'scene-0916');
    const ann = raw.frames.find((f) => f.token === frameId).annotations.find((a) => a.instanceToken === objectId);
    const edit = practiceEdits[key];
    const expected = Math.hypot(edit.translation[0] - ann.translation[0], edit.translation[1] - ann.translation[1], edit.translation[2] - ann.translation[2]);
    let table = await closeness();
    const mine = table.rows.find((r) => r.id === objectId);
    const centre = mine ? mine.cells[1].match(/^(\d+\.\d\d) → (\d+\.\d\d)$/) : null;
    check(`E · ${w}×${h}: practice: the row of the edited box — "position", centre as planted (${plantedMove.toFixed(1)} m in the answer key) → with the edit (${expected.toFixed(2)} m from the dataset file)`, mine && /position/.test(mine.cells[0]) && centre && Number(centre[1]).toFixed(1) === plantedMove.toFixed(1) && centre[2] === expected.toFixed(2) && mine.cells[2] === '0.00 → 0.00', mine ? JSON.stringify(mine.cells) : 'no row');
    const tone = Number(centre[2]) < Number(centre[1]) ? 'emerald' : Number(centre[2]) > Number(centre[1]) ? 'rose' : 'zinc';
    check(`E · ${w}×${h}: practice: the edited value is coloured by its direction (closer = green, further = rose, same = grey)`, mine.tones[0] === tone && mine.tones[1] === 'zinc', `${mine.tones.join(',')} (expected ${tone} first)`);
    check(`E · ${w}×${h}: practice: the edit is stored under the practice scope only — nothing under the real annotations`, Object.keys(await storedEdits(page, 'nuscenes')).length === 0 && Object.keys(practiceEdits).length === 1);

    // ---- a box nothing was planted on ----------------------------------------------------
    const plantedIds = chips.map((c) => c.text.split(' ')[0]);
    const untouched = await page.evaluate((ids) => { const li = [...document.querySelectorAll('section[aria-label="Objects"] li')].find((x) => !ids.includes(x.querySelector('span.font-mono').title.slice(0, 6))); return li.querySelector('span.font-mono').title; }, plantedIds);
    await row(page, untouched.slice(0, 8)).click();
    await page.waitForTimeout(400);
    await enterEditor(page);
    await page.keyboard.press('Shift+ArrowLeft');
    await page.waitForTimeout(400);
    await leaveEditor(page);
    await reveal();
    table = await closeness();
    const other = table.rows.find((r) => r.id === untouched);
    check(`E · ${w}×${h}: practice: a box nothing was planted on, moved 0.50 m — "not planted", 0.00 → 0.50, in rose`, other && /not planted/.test(other.cells[0]) && other.cells[1] === '0.00 → 0.50' && other.tones[0] === 'rose' && table.rows.length === 2, other ? JSON.stringify(other) : 'no row');

    // ---- by position: the table inside the card, cells not overlapping; then the widest numbers ----
    const layout = () => page.evaluate(() => {
      const box = document.querySelector('[data-part="closeness"]');
      const card = box.closest('section').getBoundingClientRect();
      const bad = [];
      for (const tr of box.querySelectorAll('tr')) {
        const cells = [...tr.children].map((c) => c.getBoundingClientRect());
        cells.forEach((c, i) => {
          if (c.left < card.left - 0.5 || c.right > card.right + 0.5) bad.push(`cell ${i} outside the card`);
          if (i > 0 && c.left < cells[i - 1].right - 0.5) bad.push(`cell ${i} over cell ${i - 1}`);
          const el = tr.children[i];
          if (el.scrollWidth > el.clientWidth + 1) bad.push(`cell ${i} cut`);
        });
      }
      const table = box.querySelector('table');
      const panel = document.querySelector('section[aria-label="Details"]');
      return { bad: [...new Set(bad)], table: Math.round(table.getBoundingClientRect().width), card: Math.round(card.width), panelScrollsSideways: panel.scrollWidth > panel.clientWidth + 1 };
    });
    const real = await layout();
    await page.evaluate(() => {
      for (const tr of document.querySelectorAll('[data-part="closeness"] tr[data-closeness]')) {
        const cells = tr.querySelectorAll('td');
        cells[0].querySelector('span').textContent = 'not planted';
        cells[1].innerHTML = '12.34 → <span>10.12</span>';
        cells[2].innerHTML = '12.34 → <span>10.12</span>';
        cells[3].innerHTML = '179.9 → <span>179.9</span>';
      }
    });
    const widest = await layout();
    check(`E · ${w}×${h}: practice: the closeness table is inside the card, no cell over another or cut — also with the widest numbers ("12.34 → 10.12", "179.9 → 179.9")`, real.bad.length === 0 && widest.bad.length === 0 && !real.panelScrollsSideways && !widest.panelScrollsSideways, `${[...real.bad, ...widest.bad].join('; ') || 'ok'} · table ${real.table}px (widest ${widest.table}px) in a ${real.card}px card`);
    await page.getByRole('button', { name: 'Hide answers' }).click();
    await reveal();
    await page.locator('[data-part="closeness"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(page, `e4_practice_closeness_${w}x${h}`);

    if (main) {
      const marks = await page.evaluate(() => ({ tag: document.querySelector('section[aria-label="3D view"]').innerText.replace(/\s+/g, ' ').match(/LIDAR[^D]*?\(PRACTICE\)[^A-Z]*\d* ?EDITED|LiDAR measured[^\n]*/i), rows: document.querySelectorAll('section[aria-label="Objects"] [data-edited]').length, count: (document.querySelector('header [data-part="edited-count"]') || { innerText: null }).innerText }));
      check('E · practice: the marks are there too (2 list rows, top bar "2 edited", the 3D tag says practice and "2 edited")', marks.rows === 2 && marks.count === '2 edited' && /practice/i.test(String(marks.tag)) && /2 edited/i.test(String(marks.tag)), JSON.stringify(marks));

      // ---- the practice export ---------------------------------------------------------
      const menu = await openMenu(page);
      check('E · practice: the menu counts the practice edits and says the file covers the practice set only', /2 boxes edited/.test(menu.text) && menu.notes.some((n) => /practice set of the scene on screen only/.test(n)), `${menu.text} · ${menu.notes.join(' / ')}`);
      await closeMenu(page);
      const file = await download(page, 'json');
      const data = JSON.parse(file.text);
      const mineRow = data.reviews.find((r) => r.objectId === objectId);
      const o = mineRow.edit.original;
      const off = Math.hypot(o.translation[0] - ann.translation[0], o.translation[1] - ann.translation[1], o.translation[2] - ann.translation[2]);
      check('E · practice: the file is flagged practice, named review_nuscenes-practice_…, covers one scene, 2 edited', data.practice === true && /^review_nuscenes-practice_/.test(file.name) && data.scenes.join() === 'scene-0916' && data.summary.edited === 2 && data.reviews.length === 2, `${file.name} · ${JSON.stringify(data.summary)}`);
      check('E · practice: "original" in that file is the PRACTICE box (the planted error), not the nuScenes annotation', off.toFixed(1) === plantedMove.toFixed(1), `original is ${off.toFixed(2)} m from the nuScenes annotation; planted: moved ${plantedMove.toFixed(1)} m`);

      // ---- leaving practice ---------------------------------------------------------------
      await page.getByRole('button', { name: /practice/i }).first().click();
      await page.waitForTimeout(2600);
      const out = await page.evaluate(() => ({ rows: document.querySelectorAll('section[aria-label="Objects"] [data-edited]').length, count: document.querySelector('header [data-part="edited-count"]'), tag: /edited/i.test(document.querySelector('section[aria-label="3D view"]').innerText), card: !!document.querySelector('[data-part="closeness"]') }));
      check('E · practice off: no mark, no count, no closeness block — the practice edits are not laid over the real boxes', out.rows === 0 && out.count === null && !out.tag && !out.card, JSON.stringify(out));
      const menu2 = await openMenu(page);
      check('E · practice off: the export menu is back to "Nothing reviewed yet" (practice edits are not in the real file)', menu2.text === 'Nothing reviewed yet' && menu2.disabled.every(Boolean), menu2.text);
      await closeMenu(page);
      await page.getByRole('button', { name: /practice/i }).first().click();
      await page.waitForTimeout(2600);
      const back = await page.evaluate(() => document.querySelectorAll('section[aria-label="Objects"] [data-edited]').length);
      check('E · practice on again: the two practice edits are back', back === 2, `${back}`);
    }
    check(`E · ${w}×${h}: no page errors (practice)`, page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  // =====================================================================
  // 3. practice mode: the top bar stays on one line (its badge is about 92 px wider)
  // =====================================================================
  for (const failEdits of [false, true]) {
    const { context, page } = await open(browser, 1536, 800, { failEdits });
    await page.getByRole('button', { name: /practice/i }).first().click();
    await page.waitForTimeout(2600);
    await page.locator(`${SEL.list} li`).first().click();
    await page.waitForTimeout(400);
    await page.keyboard.press('r');
    const WIDTHS = [1024, 1100, 1200, 1279, 1280, 1300, 1320, 1340, 1360, 1380, 1399, 1400, 1420, 1439, 1440, 1460, 1500, 1535, 1536];
    const sweep = async (label, widen, countFrom) => {
      const lines = [];
      const problems = [];
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 800 });
        await page.waitForTimeout(200);
        const was = widen ? await page.evaluate(() => {
          const box = document.querySelector('header [title^="Reviewed boxes"]');
          const n = box.querySelector('span span');
          const e = box.querySelector('[data-part="edited-count"]');
          const old = [n.textContent, e ? e.textContent : null];
          n.textContent = '2424';
          if (e) e.textContent = '156 edited';
          return old;
        }) : null;
        const r = await topBar(page);
        const shownCount = await page.evaluate(() => { const e = document.querySelector('header [data-part="edited-count"]'); return !!e && e.getBoundingClientRect().width > 0; });
        if (was) await page.evaluate((old) => { const box = document.querySelector('header [title^="Reviewed boxes"]'); box.querySelector('span span').textContent = old[0]; const e = box.querySelector('[data-part="edited-count"]'); if (e) e.textContent = old[1]; }, was);
        if (r.wraps) problems.push(`${w} wraps`);
        if (countFrom !== null && shownCount !== (w >= countFrom)) problems.push(`${w}: "N edited" ${shownCount ? 'shown' : 'hidden'}`);
        lines.push(`${w}:${r.wraps ? 'WRAPS' : r.spare}`);
      }
      check(`E · practice: top bar, ${WIDTHS.length} widths from 1024 to 1536 px, ${label}: always one line`, problems.length === 0, `${problems.length ? `PROBLEM: ${problems.join(', ')} · ` : ''}room left (px) ${lines.join(' ')}`);
    };
    if (!failEdits) {
      await sweep('1 rejected, no edit', false, null);
      await sweep('no edit, widest text ("2424")', true, null);
    }
    await page.setViewportSize({ width: 1536, height: 800 });
    await enterEditor(page);
    await page.keyboard.press('Shift+ArrowUp');
    await page.waitForTimeout(400);
    await leaveEditor(page);
    const state = await page.evaluate(() => ({ notSaved: /Not saved/i.test(document.querySelector('header').innerText), count: (document.querySelector('header [data-part="edited-count"]') || { innerText: null }).innerText }));
    check(`E · (setup) practice, one box edited${failEdits ? ', the browser refusing to store it: "1 edited" and "Not saved" are in the top bar' : ': "1 edited" is in the top bar'}`, state.notSaved === failEdits && state.count === '1 edited', JSON.stringify(state));
    const tail = failEdits ? ' + "Not saved"' : '';
    await sweep(`1 edited${tail} ("N edited" shown from 1536 px)`, false, 1536);
    await sweep(`widest texts ("2424", "156 edited")${tail}`, true, 1536);
    for (const w of failEdits ? [1280, 1536] : [1440]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(250);
      await shot(page, `e5_practice_top_bar_${failEdits ? 'not_saved_' : ''}${w}`, { x: 0, y: 0, width: w, height: 110 });
    }
    check(`E · no page errors (practice top bar${tail})`, page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\ne: ${results.length - failed} / ${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
  fs.writeFileSync(path.join(OUT, 'e.result.json'), JSON.stringify(results, null, 1));
})();
