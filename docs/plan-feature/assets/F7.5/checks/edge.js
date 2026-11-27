// F7.5 edge cases: conditions the step checks never tried. Run BEFORE fixing anything.
const path = require('path');
const { URL, SHOTS, makeChecker, launch, openApp, mode, text, noPageScroll } = require('./lib');

const LIST = 'ul[aria-label="Sampled boxes"]';
const DETAILS = 'section[aria-label="Details"]';
const DIALOG = '[role="dialog"][aria-label="Evaluation report"]';
const KEY = 'ai-detection-viewer.review';
const sampleButton = (page) => page.getByRole('button', { name: 'Sample check', exact: true });
const verdictOfRow = (page, n) => page.evaluate(({ LIST, n }) => document.querySelectorAll(`${LIST} > li`)[n - 1]?.querySelector('[role="img"]')?.getAttribute('aria-label') ?? null, { LIST, n });
const selectedIndex = (page) => page.evaluate((LIST) => [...document.querySelectorAll(`${LIST} > li`)].findIndex((li) => li.getAttribute('aria-current') === 'true') + 1, LIST);
const waitBox = (page, n) => page.waitForFunction((n) => document.querySelector('section[aria-label="Details"]').innerText.includes(`box ${n} of`), n, { timeout: 25000 }).catch(() => undefined);
const stored = (page) => page.evaluate((KEY) => JSON.parse(localStorage.getItem(KEY) ?? 'null')?.state?.reviews ?? null, KEY);
const enterSample = async (page) => { await mode(page, 'Evaluate'); await page.waitForTimeout(1200); await sampleButton(page).click(); };
const horizontalOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

(async () => {
  const { check, done } = makeChecker('edge');
  const browser = await launch();

  // ---------------------------------------------------------------- E1: scenes arrive slowly
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1536, height: 700 });
    await page.route('**/scenes/*/frames.json', async (route) => {
      if (route.request().url().includes('scene-0916')) return route.continue();
      await new Promise((r) => setTimeout(r, 6000));
      return route.continue();
    });
    await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
    await page.waitForSelector('section[aria-label="3D view"] canvas', { timeout: 60000 });
    await page.waitForTimeout(1500);
    await enterSample(page);
    await page.waitForTimeout(600);
    const waiting = await text(page, DETAILS);
    const listText = await text(page, 'section[aria-label="Objects"]');
    check('E1 slow scenes: the panel says it is preparing the sample and how many scenes are in', /Preparing the sample/.test(waiting) && /\d+ of 10 are loaded/.test(waiting), waiting.slice(0, 160));
    check('E1: the list shows the same message, not an empty list', /\d+ of 10 are loaded/.test(listText), listText.slice(0, 160));
    check('E1: Export is disabled while there is no sample', await page.getByRole('button', { name: 'Export', exact: true }).isDisabled());
    await page.screenshot({ path: path.join(SHOTS, 'edge1_loading.png') });
    await page.waitForSelector(`${LIST} > li`, { timeout: 60000 });
    await waitBox(page, 1);
    check('E1: once every scene is in, the sample appears and box 1 opens by itself', (await page.locator(`${LIST} > li`).count()) === 100 && (await selectedIndex(page)) === 1);
    await context.close();
  }

  // ---------------------------------------------------------------- E2: one scene fails / E3: one scene has no predictions
  for (const [name, pattern, expected] of [
    ['E2 a scene fails to load', '**/scenes/scene-0655/frames.json', /scene-0655 could not be loaded/],
    ['E3 a scene has no predictions', '**/scenes/scene-0655/predictions.json', /scene-0655 has no model predictions/],
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.setViewportSize({ width: 1536, height: 700 });
    await page.route(pattern, (route) => route.fulfill({ status: 500, body: 'no' }));
    await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
    await page.waitForSelector('section[aria-label="3D view"] canvas', { timeout: 60000 });
    await page.waitForTimeout(5000);
    await enterSample(page);
    await page.waitForTimeout(1500);
    const panel = await text(page, DETAILS);
    check(`${name}: the sample is NOT drawn from the other nine scenes — the panel says why`, /The sample cannot be drawn/.test(panel) && expected.test(panel), panel.slice(0, 260));
    check(`${name}: no sampled boxes are listed, Export is disabled`, (await page.locator(`${LIST} > li`).count()) === 0 && (await page.getByRole('button', { name: 'Export', exact: true }).isDisabled()));
    const cut = await page.evaluate((DETAILS) => { const panel = document.querySelector(DETAILS).getBoundingClientRect(); return [...document.querySelectorAll(`${DETAILS} p`)].filter((p) => { const r = p.getBoundingClientRect(); return r.right > panel.right + 1 || r.bottom > panel.bottom + 1 || p.scrollWidth > p.clientWidth + 1; }).map((p) => p.textContent.slice(0, 40)); }, DETAILS);
    check(`${name}: the reason is fully inside the panel (not cut)`, cut.length === 0, cut.join(' | '));
    if (name.startsWith('E2')) await page.screenshot({ path: path.join(SHOTS, 'edge2_scene_failed.png') });
    await page.getByRole('button', { name: 'Exit sample check', exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Report', exact: true }).click();
    await page.waitForSelector(DIALOG, { timeout: 15000 });
    await page.waitForTimeout(800);
    const report = (await page.locator(DIALOG).innerText()).replace(/\s+/g, ' ');
    check(`${name}: the report opens and its false-alarm block gives the same reason instead of a number`, expected.test(report) && !/1,452/.test(report), report.match(/False alarms.{0,200}/i)?.[0] ?? report.slice(0, 200));
    if (name.startsWith('E3')) check('E3: the report lists the scene as not evaluated', /Not evaluated \(no predictions\): scene-0655/.test(report));
    if (name.startsWith('E2')) check('E2: the report says the numbers are not complete (a scene is missing)', /9 of 10 scenes loaded/.test(report) || /still loading/.test(report), report.slice(0, 200));
    await context.close();
  }

  // ---------------------------------------------------------------- E4…: one normal context
  const context = await browser.newContext();
  const page = await openApp(context);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await enterSample(page);
  await page.waitForSelector(`${LIST} > li`, { timeout: 30000 });
  await waitBox(page, 1);
  await page.waitForTimeout(800);

  // E4: A then R with no pause, the next box being in another scene
  await page.keyboard.press('a');
  await page.keyboard.press('r');
  await waitBox(page, 2);
  await page.waitForTimeout(1500);
  check('E4 A then R at once (next box is in another scene): box 1 keeps "Real object", R did not overwrite it', (await verdictOfRow(page, 1)) === 'Real object, label missing', String(await verdictOfRow(page, 1)));
  const afterFast = await verdictOfRow(page, 2);
  check('E4: the R that arrived before box 2 was on screen was not applied to box 2 unseen', afterFast === 'Not judged', String(afterFast));
  check('E4: still on box 2', (await selectedIndex(page)) === 2, String(await selectedIndex(page)));

  // E5: Korean input method — the physical key decides
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ㄱ', code: 'KeyR', bubbles: true })));
  await waitBox(page, 3);
  await page.waitForTimeout(1200);
  check('E5 Korean input (key "ㄱ", physical R): judged "Model is wrong" and moved on', (await verdictOfRow(page, 2)) === 'Model is wrong', String(await verdictOfRow(page, 2)));

  // E6: a mouse click on a verdict button must not leave a button that Space re-fires
  await page.getByRole('group', { name: 'Verdict' }).getByRole('button').nth(2).click();
  await waitBox(page, 4);
  await page.waitForTimeout(1500);
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  check('E6 mouse click on "Unclear", then Space / Enter: box 3 is unclear and box 4 was NOT judged by the lingering button', (await verdictOfRow(page, 3)) === 'Unclear' && (await verdictOfRow(page, 4)) === 'Not judged' && (await selectedIndex(page)) === 4, `${await verdictOfRow(page, 3)} / ${await verdictOfRow(page, 4)} / at ${await selectedIndex(page)}`);

  // E7: selecting something that is not a sampled box
  await page.locator('section[aria-label="3D view"] canvas').click({ position: { x: 420, y: 300 } });
  await page.waitForTimeout(600);
  const before = JSON.stringify(await stored(page));
  await page.keyboard.press('a');
  await page.waitForTimeout(500);
  const panel7 = await text(page, DETAILS);
  const sel7 = await selectedIndex(page);
  check('E7 a 3D box (or nothing) selected instead of a sampled box: A writes nothing anywhere', JSON.stringify(await stored(page)) === before);
  check('E7: the panel says no sampled box is selected and the buttons are disabled (or the sampled box is still selected)', sel7 !== 0 || (/No sampled box is selected/.test(panel7) && (await page.evaluate(() => [...document.querySelectorAll('[aria-label="Verdict"] button')].every((b) => b.disabled)))), panel7.slice(0, 120));
  await page.keyboard.press('j');
  await page.waitForTimeout(1500);
  check('E7: J resumes at the first box without a verdict (4), not at box 1', (await selectedIndex(page)) === 4, String(await selectedIndex(page)));

  // E8: shrink the sample under the current box
  await page.getByRole('group', { name: 'Sample size' }).getByRole('button', { name: '200', exact: true }).click();
  await page.waitForTimeout(600);
  await page.locator(`${LIST} > li`).nth(149).click();
  await waitBox(page, 150);
  await page.waitForTimeout(1200);
  await page.keyboard.press('u');
  await page.waitForTimeout(1500);
  await page.locator(`${LIST} > li`).nth(149).click();
  await waitBox(page, 150);
  await page.getByRole('group', { name: 'Sample size' }).getByRole('button', { name: '100', exact: true }).click();
  await page.waitForTimeout(700);
  const panel8 = await text(page, DETAILS);
  check('E8 size 200 → 100 while box 150 is on screen: 100 rows, no crash, the panel does not claim box 150 of 100', (await page.locator(`${LIST} > li`).count()) === 100 && !/box 150 of 100/.test(panel8), panel8.slice(0, 140));
  check('E8: the verdict given to box 150 is not counted in the sample of 100', /3 of 100 judged/.test(panel8), panel8.match(/\d+ of 100 judged[^.]*/)?.[0] ?? panel8.slice(0, 200));

  // E9: reload — the size that holds every verdict comes back
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('section[aria-label="3D view"] canvas');
  await page.waitForTimeout(2500);
  await enterSample(page);
  await page.waitForSelector(`${LIST} > li`, { timeout: 30000 });
  await page.waitForTimeout(1500);
  check('E9 reload with a verdict on box 150: the sample opens at 200 so that verdict is not hidden', (await page.locator(`${LIST} > li`).count()) === 200 && /4 of 200 judged/.test(await text(page, DETAILS)), (await text(page, DETAILS)).match(/\d+ of \d+ judged/)?.[0]);

  // E10: two tabs
  const other = await context.newPage();
  await other.setViewportSize({ width: 1536, height: 700 });
  await other.goto(URL, { waitUntil: 'networkidle' });
  await other.waitForSelector('section[aria-label="3D view"] canvas');
  await other.waitForTimeout(2500);
  await enterSample(other);
  await other.waitForSelector(`${LIST} > li`, { timeout: 30000 });
  await other.waitForTimeout(1500);
  const at = await selectedIndex(other);
  await other.keyboard.press('a');
  await other.waitForTimeout(2500);
  await page.waitForTimeout(800);
  check(`E10 two tabs: a verdict given in tab B (box ${at}) shows in tab A without a reload`, (await verdictOfRow(page, at)) === 'Real object, label missing', String(await verdictOfRow(page, at)));
  await page.keyboard.press('j'); // tab A is still on the box tab B just judged: step off it first
  await page.waitForTimeout(2000);
  await page.keyboard.press('u');
  await page.waitForTimeout(2500);
  const all = await stored(page);
  check('E10: tab A then saves its own verdict without losing tab B\'s', Object.keys(all['nuscenes-false-alarms']).length === 6, String(Object.keys(all['nuscenes-false-alarms']).length));
  await other.close();

  // E11: leave by other doors while the check / the report is open
  await page.getByRole('button', { name: 'COCO', exact: true }).click();
  await page.waitForTimeout(2500);
  check('E11 dataset switch during the sample check: COCO shows its normal screen (confidence slider, no sample bar)', (await page.locator('input[type="range"]').count()) === 1 && !/Sample check/i.test(await page.evaluate(() => document.querySelector('header').parentElement.nextElementSibling.textContent)));
  await page.getByRole('button', { name: 'nuScenes', exact: true }).click();
  await page.waitForTimeout(4000);
  await mode(page, 'Evaluate');
  await page.waitForTimeout(1200);
  check('E11: back on nuScenes / Evaluate the sample check is off (it does not reopen by itself)', (await page.locator(`${LIST}`).count()) === 0 && (await sampleButton(page).count()) === 1);
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.waitForSelector(DIALOG);
  await page.locator('button[aria-label^="Scene: "]').click();
  await page.waitForTimeout(500);
  check('E11: with the report open the scene picker still opens (the report does not cover the timeline)', (await page.getByText('scene-1094').count()) > 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // E12: the score slider below the file's minimum, IoU 0.5 — the longest conditions line
  if ((await page.locator(DIALOG).count()) > 0) await page.keyboard.press('Escape');
  await page.getByRole('group', { name: 'Minimum overlap (IoU)' }).getByRole('button', { name: '0.5', exact: true }).click();
  await page.locator('input[type="range"]').focus();
  for (let i = 0; i < 30; i += 1) await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(900);
  for (const [w, h] of [[1536, 700], [1024, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(800);
    const line = await page.evaluate(() => { const p = document.querySelector('p[aria-label="Conditions"]'); const panel = document.querySelector('section[aria-label="Details"]').getBoundingClientRect(); const r = p.getBoundingClientRect(); return { text: p.innerText.replace(/\s+/g, ' '), inside: r.left >= panel.left && r.right <= panel.right + 1 && r.bottom <= panel.bottom, cut: p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1, height: Math.round(r.height) }; });
    check(`E12 slider at 0 + IoU 0.5 at ${w}×${h}: the line says "score ≥ 0.05 (file minimum) · IoU ≥ 0.5", inside the panel, not cut (${line.height}px tall)`, /score ≥ 0\.05 \(file minimum\) · IoU ≥ 0\.5$/.test(line.text) && line.inside && !line.cut, JSON.stringify(line));
    const numbers = await page.evaluate(() => { const panel = document.querySelector('section[aria-label="Details"]').getBoundingClientRect(); return [...document.querySelectorAll('section[aria-label="Details"] dl dd.text-base')].slice(0, 2).every((dd) => dd.getBoundingClientRect().bottom <= panel.bottom); });
    check(`E12 at ${w}×${h}: Precision and Recall are still visible without scrolling the panel`, numbers);
  }
  await page.setViewportSize({ width: 1536, height: 700 });
  await page.getByRole('button', { name: 'Reset', exact: true }).first().click();
  await page.waitForTimeout(700);

  // E13: the shortest supported window, and a phone
  for (const [w, h] of [[1536, 640], [1024, 640]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Report', exact: true }).click();
    await page.waitForSelector(DIALOG);
    await page.waitForTimeout(600);
    const fit = await page.evaluate((DIALOG) => { const d = document.querySelector(DIALOG).getBoundingClientRect(); const f = document.querySelector('section[aria-label="Frames"]').getBoundingClientRect(); const head = document.querySelector(DIALOG + ' h2').getBoundingClientRect(); return { above: d.bottom <= f.top + 1, head: head.height > 0 && head.top >= d.top, h: Math.round(d.height) }; }, DIALOG);
    check(`E13 ${w}×${h} (minimum height): the report (${fit.h}px) stays above the timeline, scrolls inside; no page scroll`, fit.above && fit.head && (await noPageScroll(page)), JSON.stringify(fit));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  check('E13 390×844 (phone, stacked): evaluate mode has no horizontal overflow', !(await horizontalOverflow(page)));
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.waitForSelector(DIALOG);
  await page.waitForTimeout(700);
  // Tables may scroll sideways inside their own block; what must not happen is a cell whose text is cut.
  const phone = await page.evaluate((DIALOG) => { const d = document.querySelector(DIALOG).getBoundingClientRect(); const cut = [...document.querySelectorAll(`${DIALOG} th, ${DIALOG} td, ${DIALOG} p, ${DIALOG} h2, ${DIALOG} h2 span, ${DIALOG} h3, ${DIALOG} button, ${DIALOG} span.rounded-full`)].filter((el) => el.getBoundingClientRect().width > 0 && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim().slice(0, 28)); const outside = [...document.querySelectorAll(`${DIALOG} p, ${DIALOG} h3`)].filter((el) => el.getBoundingClientRect().right > d.right + 1).map((el) => el.textContent.trim().slice(0, 28)); return { top: Math.round(d.top), width: Math.round(d.width), cut: [...cut, ...outside] }; }, DIALOG);
  check(`E13 390×844: the report is at the top of the page (${phone.width}px wide), nothing overflows sideways, no cell is cut`, !(await horizontalOverflow(page)) && phone.cut.length === 0, JSON.stringify(phone));
  await page.screenshot({ path: path.join(SHOTS, 'edge13_390_report.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await sampleButton(page).click();
  await page.waitForSelector(`${LIST} > li`, { timeout: 30000 });
  await page.waitForTimeout(2000);
  check('E13 390×844: the sample check has no horizontal overflow', !(await horizontalOverflow(page)));
  const phoneButtons = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Verdict"] button')].map((b) => ({ cut: b.scrollWidth > b.clientWidth + 1, w: Math.round(b.getBoundingClientRect().width) })));
  check('E13 390×844: the three verdict buttons are not cut', phoneButtons.length === 3 && phoneButtons.every((b) => !b.cut), JSON.stringify(phoneButtons));
  await page.screenshot({ path: path.join(SHOTS, 'edge13_390_sample.png'), fullPage: false });
  await page.getByRole('button', { name: 'Exit sample check', exact: true }).click();
  await page.setViewportSize({ width: 1536, height: 700 });
  await page.waitForTimeout(900);

  // E14: every row of the largest sample, narrowest window — nothing cut
  await sampleButton(page).click();
  await page.waitForSelector(`${LIST} > li`, { timeout: 30000 });
  await page.getByRole('group', { name: 'Sample size' }).getByRole('button', { name: '300', exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(1200);
  const rowsCut = await page.evaluate((LIST) => { const out = []; document.querySelectorAll(`${LIST} > li`).forEach((li, i) => { for (const span of li.children) { if (span.scrollWidth > span.clientWidth + 1) out.push(`${i + 1}: ${span.textContent.trim()}`); } }); return out; }, LIST);
  check(`E14 300 rows at 1024px: no column of any row is cut`, rowsCut.length === 0, rowsCut.slice(0, 5).join(' | '));
  await page.setViewportSize({ width: 1536, height: 700 });
  await page.getByRole('group', { name: 'Sample size' }).getByRole('button', { name: '200', exact: true }).click();
  await page.getByRole('button', { name: 'Exit sample check', exact: true }).click();
  await page.waitForTimeout(600);

  check('no page errors in the normal context', errors.length === 0, errors.slice(0, 3).join(' | '));
  await context.close();

  // ---------------------------------------------------------------- E15: storage refuses writes
  {
    const context2 = await browser.newContext();
    await context2.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('QuotaExceededError'); }; });
    const page2 = await openApp(context2);
    const errs = [];
    page2.on('pageerror', (e) => errs.push(String(e)));
    await enterSample(page2);
    await page2.waitForSelector(`${LIST} > li`, { timeout: 30000 });
    await waitBox(page2, 1);
    await page2.waitForTimeout(800);
    await page2.keyboard.press('a');
    await waitBox(page2, 2);
    await page2.waitForTimeout(1200);
    const panel = await text(page2, DETAILS);
    check('E15 storage full: the verdict still works for this visit and nothing throws', (await verdictOfRow(page2, 1)) === 'Real object, label missing' && errs.length === 0, errs.join(' | '));
    const warn = await page2.evaluate((DETAILS) => { const p = [...document.querySelectorAll(`${DETAILS} p`)].find((el) => /Saving to this browser is failing/.test(el.textContent)); if (!p) return null; const r = p.getBoundingClientRect(); const panel = document.querySelector(DETAILS).getBoundingClientRect(); return { visible: r.height > 0 && r.bottom <= panel.bottom && r.right <= panel.right + 1, cut: p.scrollWidth > p.clientWidth + 1 }; }, DETAILS);
    check('E15: the panel warns that verdicts will be lost on reload — and the warning is visible, not cut or below the fold', warn !== null && warn.visible && !warn.cut, JSON.stringify(warn) + ' ' + panel.slice(0, 80));
    await page2.screenshot({ path: path.join(SHOTS, 'edge15_storage_failed.png') });
    await context2.close();
  }

  // ---------------------------------------------------------------- E16: stored data from before / damaged
  {
    const context3 = await browser.newContext();
    await context3.addInitScript((KEY) => {
      if (localStorage.getItem(KEY)) return;
      const rec = (frameId, objectId, verdict) => ({ frameId, objectId, verdict, reasons: [], note: '', reviewedAt: '2026-11-20T00:00:00.000Z' });
      localStorage.setItem(KEY, JSON.stringify({ version: 1, state: { reviews: {
        nuscenes: { 'f/a': rec('f', 'a', 'approved') },
        'nuscenes-practice': {},
        'nuscenes-false-alarms': {
          ok: rec('bad8a002637046178fe0f8216e5bc355', 'pred:bad8a002637046178fe0f8216e5bc355:CAM_FRONT:8', 'rejected'),
          stale: rec('nope', 'pred:nope:CAM_FRONT:0', 'approved'),
          broken: { frameId: 'x', verdict: 'maybe' },
          notAnObject: 5,
        },
      } } }));
    }, KEY);
    const page3 = await openApp(context3);
    const errs = [];
    page3.on('pageerror', (e) => errs.push(String(e)));
    await enterSample(page3);
    await page3.waitForSelector(`${LIST} > li`, { timeout: 30000 });
    await page3.waitForTimeout(1500);
    const panel = await text(page3, DETAILS);
    check('E16 stored data with a valid, a stale and two broken sample records: loads without an error', errs.length === 0, errs.join(' | '));
    check('E16: the valid record shows on box 1; the stale one (a box not in the sample) is not counted', (await verdictOfRow(page3, 1)) === 'Model is wrong' && /1 of 100 judged/.test(panel), `${await verdictOfRow(page3, 1)} / ${panel.match(/\d+ of 100 judged/)?.[0]}`);
    check('E16: it opened on the first unjudged box (2), not on the judged one', (await selectedIndex(page3)) === 2, String(await selectedIndex(page3)));
    await page3.getByRole('button', { name: 'Exit sample check', exact: true }).click();
    await context3.close();
  }
  {
    // data saved BEFORE this feature: only the two label scopes
    const context4 = await browser.newContext();
    await context4.addInitScript((KEY) => {
      if (localStorage.getItem(KEY)) return;
      localStorage.setItem(KEY, JSON.stringify({ version: 1, state: { reviews: { nuscenes: { 'f/a': { frameId: 'f', objectId: 'a', verdict: 'approved', reasons: [], note: '', reviewedAt: '' } }, 'nuscenes-practice': {} } } }));
    }, KEY);
    const page4 = await openApp(context4);
    await enterSample(page4);
    await page4.waitForSelector(`${LIST} > li`, { timeout: 30000 });
    await waitBox(page4, 1);
    await page4.waitForTimeout(800);
    await page4.keyboard.press('a');
    await waitBox(page4, 2);
    await page4.waitForTimeout(1500);
    const all = await stored(page4);
    check('E16 data saved before F7.5 (two scopes): a sample verdict is saved and the old label record is still there', Object.keys(all['nuscenes-false-alarms'] ?? {}).length === 1 && all.nuscenes?.['f/a']?.verdict === 'approved', JSON.stringify(Object.keys(all)));
    await context4.close();
  }

  const failed = done();
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
