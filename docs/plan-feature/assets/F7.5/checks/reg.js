// F7.5 regression: the F4 / F5 / F6 / F7 flows that share code F7.5 touched
// (Filters slots, useActiveCamera, WorkspaceShell, the review scopes, handleOpenHit, the shortcut handler).
const fs = require('fs');
const path = require('path');
const { OUT, makeChecker, launch, openApp, mode, text, noPageScroll } = require('./lib');

const KEY = 'ai-detection-viewer.review';
const LIST = 'section[aria-label="Objects"]';
const DETAILS = 'section[aria-label="Details"]';
const stored = (page) => page.evaluate((KEY) => JSON.parse(localStorage.getItem(KEY) ?? 'null')?.state?.reviews ?? { nuscenes: {}, 'nuscenes-practice': {}, 'nuscenes-false-alarms': {} }, KEY);
const records = async (page, scope = 'nuscenes') => Object.values((await stored(page))[scope] ?? {});
const header = (page) => text(page, 'header');
const scene = (page) => page.locator('button[aria-label^="Scene: "]').getAttribute('aria-label');
const camera = (page) => page.locator('[aria-label="Cameras"] button[aria-pressed="true"]').getAttribute('aria-label');

(async () => {
  const { check, done } = makeChecker('reg');
  const browser = await launch();
  const context = await browser.newContext({ acceptDownloads: true });
  let page = await openApp(context);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluate(() => { document.querySelector('section[aria-label="3D view"] canvas').__mark = 'same'; });
  const canvasKept = () => page.evaluate(() => document.querySelector('section[aria-label="3D view"] canvas')?.__mark === 'same');

  // ---------------------------------------------------------------- F3 / F7: the frame
  check('review mode (default): 41 frame cells in the scrubber, no page scroll, scene-0916', (await page.locator('button[aria-label^="Frame "]').count()) === 41 && (await noPageScroll(page)) && (await scene(page)).includes('scene-0916'));
  check('review mode: the filter bar has the distance slider and no IoU control or "Sample check" (those are evaluate-only)', (await page.locator('input[type="range"]').count()) === 1 && (await page.getByRole('group', { name: 'Minimum overlap (IoU)' }).count()) === 0 && (await page.getByRole('button', { name: 'Sample check', exact: true }).count()) === 0);

  // ---------------------------------------------------------------- F4: review
  await page.locator(`${LIST} li`).first().click();
  await page.waitForTimeout(500);
  await page.keyboard.press('a');
  await page.waitForTimeout(400);
  let recs = await records(page);
  check('F4: A approves the selected box (label scope) and moves to the next unreviewed one', recs.length === 1 && recs[0].verdict === 'approved' && !recs[0].objectId.startsWith('pred:'), JSON.stringify(recs.map((r) => r.verdict)));
  await page.keyboard.press('r');
  await page.waitForTimeout(300);
  await page.keyboard.press('1');
  await page.waitForTimeout(300);
  recs = await records(page);
  const rejected = recs.find((r) => r.verdict === 'rejected');
  check('F4: R rejects and stays; 1 toggles the first reason', recs.length === 2 && rejected && rejected.reasons.length === 1, JSON.stringify(rejected));
  await page.locator('[aria-label="Review note"]').click();
  await page.keyboard.type('aru jk');
  await page.waitForTimeout(400);
  recs = await records(page);
  check('F4: typing "aru jk" in the note is text, not shortcuts', recs.length === 2 && recs.find((r) => r.verdict === 'rejected')?.note === 'aru jk', JSON.stringify(recs.map((r) => [r.verdict, r.note])));
  await page.locator('[aria-label="Review note"]').blur(); // leave the text field without clicking anything
  await page.waitForTimeout(200);
  check('F4: the sample-check scope holds nothing after a label review', (await records(page, 'nuscenes-false-alarms')).length === 0);
  check('F4: the top bar shows the progress "Reviewed 2 / …"', /Reviewed\s*2\s*\//.test(await header(page)), (await header(page)).slice(0, 200));
  await page.getByRole('button', { name: /^Export/ }).click(); // the button reads "Export ▼"; "Export reviews" is the menu's label
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /Download JSON/ }).click()]);
  const file = path.join(OUT, 'review-export.json');
  await download.saveAs(file);
  const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('F4 / F7: the label-review export (review@3 since F8) has 2 rows naming their scene — no sample records in it', exported.format === 'ai-detection-viewer/review@3' && exported.reviews.length === 2 && exported.reviews.every((r) => r.scene === 'scene-0916' && !String(r.objectId).startsWith('pred:')), `${exported.format} ${exported.reviews.length}`);
  await page.keyboard.press('n');
  await page.waitForTimeout(700);
  check('F4: N goes to the next frame with unreviewed boxes', /Frame 2\/41/.test(await header(page)), (await header(page)).slice(0, 120));

  // ---------------------------------------------------------------- F6: six cameras
  const before = await camera(page);
  await page.keyboard.press(']');
  await page.waitForTimeout(400);
  const after = await camera(page);
  check('F6: ] shows the next camera', before !== after, `${before} → ${after}`);
  await page.locator('[aria-label="Cameras"] button[aria-label^="CAM_FRONT_LEFT"]').click(); // a camera that does not see it
  await page.waitForTimeout(400);
  const picked = await page.evaluate((LIST) => {
    // the camera tag is its own element in the row: "BR" (or "BR+" when a second camera sees the box too)
    const rows = [...document.querySelectorAll(`${LIST} li`)].filter((li) => !li.className.includes('ring-1'));
    const row = rows.find((li) => [...li.querySelectorAll('span')].some((span) => /^BR\+?$/.test(span.textContent.trim())));
    if (!row) return null;
    row.click();
    return row.textContent.trim().slice(0, 40);
  }, LIST);
  await page.waitForTimeout(700);
  check('F6: selecting a box that the back-right camera sees switches the photo to it', picked !== null && (await camera(page)).startsWith('CAM_BACK_RIGHT'), `${picked} → ${await camera(page)}`);

  // ---------------------------------------------------------------- F4-F: practice
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.waitForTimeout(2500);
  check('F4-F: practice mode says the labels are modified', /Practice/.test(await header(page)) && !/MEASURED|Measured/.test((await header(page)).replace('Practice', '')), (await header(page)).slice(0, 160));
  await page.getByRole('button', { name: 'Evaluate', exact: true }).click({ force: true });
  await page.waitForTimeout(600);
  check('F5: Evaluate is blocked while practising (no evaluate controls appear)', (await page.getByRole('group', { name: 'Minimum overlap (IoU)' }).count()) === 0 && (await page.getByRole('button', { name: 'Report', exact: true }).count()) === 0);
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.waitForTimeout(2500);

  // ---------------------------------------------------------------- F5 / F6: evaluate
  await page.locator('button[aria-label^="Frame 1:"], button[aria-label^="Frame 1 "]').first().click().catch(() => undefined);
  await mode(page, 'Evaluate');
  await page.waitForTimeout(1800);
  const evalHeader = await header(page);
  check('F5: evaluate mode shows the model and Precision 77% / Recall 68% for scene-0916', /yolov8n/.test(evalHeader) && /Precision 77%/.test(evalHeader) && /Recall 68%/.test(evalHeader), evalHeader.slice(-80));
  await page.locator('button[aria-label^="False alarm:"]').click();
  await page.waitForTimeout(400);
  const onlyFalseAlarms = await page.evaluate((LIST) => [...document.querySelectorAll(`${LIST} li`)].map((li) => li.textContent).every((t) => /model/.test(t) || /—/.test(t)), LIST);
  const rowCount = await page.locator(`${LIST} li`).count();
  check('F5: the outcome chip filters the list to false alarms', rowCount > 0 && onlyFalseAlarms, String(rowCount));
  await page.locator(`${LIST} li`).first().click();
  await page.waitForTimeout(600);
  const pinned = await text(page, DETAILS);
  check('F5: a false alarm can be selected (prediction id) and explains itself', /False alarm/i.test(pinned), pinned.slice(0, 140));
  const n = (await records(page)).length;
  await page.keyboard.press('a');
  await page.waitForTimeout(400);
  check('F5: A in evaluate mode (outside the sample check) writes no review of any kind', (await records(page)).length === n && (await records(page, 'nuscenes-false-alarms')).length === 0);
  await page.locator('button[aria-label^="False alarm:"]').click();
  await page.locator('input[type="range"]').focus();
  for (let i = 0; i < 25; i += 1) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  const strict = await header(page);
  check('F5: raising Min score to 0.50 raises precision and lowers recall', Number(strict.match(/Precision (\d+)%/)?.[1]) > 77 && Number(strict.match(/Recall (\d+)%/)?.[1]) < 68, strict.slice(-60));
  await page.getByRole('button', { name: 'Reset', exact: true }).first().click();
  await page.waitForTimeout(600);
  check('F5: Reset returns the score to 0.25 (77% / 68%)', /Precision 77%/.test(await header(page)) && (await page.locator('input[type="range"]').inputValue()) === '0.25');
  await mode(page, 'Review');
  await page.waitForTimeout(700);
  const dist = await page.locator('input[type="range"]').count();
  check('F5: back in review the distance filter is there and untouched by the evaluate Reset', dist === 1);

  // ---------------------------------------------------------------- F7: explore, scenes
  await mode(page, 'Explore');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Crowded', exact: true }).click();
  await page.waitForTimeout(1200);
  check('F7: "Crowded" matches 177 of 404 frames in 7 of 10 scenes', /177\s*of\s*404\s*frames match · 7 of 10 scenes/.test(await header(page)), (await header(page)).slice(0, 200));
  // The list is ordered by scene; its last hit is in the last scene that has one (not the scene on screen).
  const sceneBefore = await scene(page);
  const total = await page.locator(`${LIST} li`).count();
  const lastRow = page.locator(`${LIST} li`).last();
  const lastText = (await lastRow.innerText()).replace(/\s+/g, ' ');
  const lastFrame = lastText.match(/#(\d+)/)?.[1];
  await lastRow.click();
  await page.waitForFunction((b) => document.querySelector('button[aria-label^="Scene: "]').getAttribute('aria-label') !== b, sceneBefore, { timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  const hitScene = (await scene(page)).match(/scene-\d{4}/)?.[0];
  const currentIndex = () => page.evaluate((LIST) => [...document.querySelectorAll(`${LIST} li`)].findIndex((li) => li.getAttribute('aria-current') === 'true' || li.querySelector('[aria-current="true"]') !== null), LIST); // the marker is on the row's button
  const current = await currentIndex();
  check(`F7: opening the last search hit ("${lastText.slice(0, 24)}") loads another scene (${hitScene}) and lands on the hit's frame (${lastFrame})`, (await scene(page)) !== sceneBefore && current === total - 1 && new RegExp(`Frame ${lastFrame}/`).test(await header(page)), `row ${current + 1} of ${total}; ${(await header(page)).match(/Frame \d+\/\d+/)?.[0]}`);
  check('F7: opening a search hit selects NO object (the shared open-frame path only selects when asked)', (await page.evaluate(() => document.querySelectorAll('section[aria-label="Camera image"] [data-selected="true"]').length)) === 0 && !/pred:/.test(JSON.stringify(await stored(page))));
  await page.keyboard.press('k');
  await page.waitForTimeout(1500);
  const stepped = await currentIndex();
  check('F7: K steps to the previous hit', stepped === total - 2, `row ${stepped + 1} of ${total}`);
  check('the 3D canvas was not re-created through review, practice, evaluate, explore and scene changes', await canvasKept());
  await mode(page, 'Review');
  await page.waitForTimeout(600);
  await page.locator('button[aria-label="Next scene"]').click();
  await page.waitForTimeout(2500);
  check('F7: the scene picker\'s › changes the scene and keeps the canvas', await canvasKept());

  // ---------------------------------------------------------------- persistence, COCO
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('section[aria-label="3D view"] canvas');
  await page.waitForTimeout(2500);
  check('F4: the two label verdicts survive a reload', (await records(page)).length === 2 && /Reviewed\s*2\s*\//.test(await header(page)));
  await page.getByRole('button', { name: 'COCO', exact: true }).click();
  await page.waitForTimeout(3000);
  const coco = await header(page);
  check('COCO: no modes, the confidence slider, the Estimated badge — as before', (await page.getByRole('group', { name: 'Mode' }).count()) === 0 && (await page.locator('input[type="range"]').count()) === 1 && /Estimated/i.test(coco), coco.slice(0, 120));
  check('COCO: no page scroll', await noPageScroll(page));

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  const failed = done();
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
