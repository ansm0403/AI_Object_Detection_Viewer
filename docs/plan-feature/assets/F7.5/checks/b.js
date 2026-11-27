// F7.5-B: the sample check. Drives the real app and prints PASS / FAIL.
const fs = require('fs');
const path = require('path');
const { OUT, SHOTS, makeChecker, launch, openApp, mode, text, clipped, noPageScroll } = require('./lib');

const FIRST_FIVE = [
  ['scene-0757', 31, 'CAM_FRONT'],
  ['scene-0655', 26, 'CAM_FRONT_RIGHT'],
  ['scene-0916', 9, 'CAM_FRONT_RIGHT'],
  ['scene-0061', 34, 'CAM_FRONT_RIGHT'],
  ['scene-0061', 39, 'CAM_FRONT_RIGHT'],
];
const SHORT = { CAM_FRONT: 'F', CAM_FRONT_RIGHT: 'FR' };
const LIST = 'ul[aria-label="Sampled boxes"]';

const rows = (page) => page.locator(`${LIST} > li`);
const rowTitles = (page, n) => page.evaluate(({ LIST, n }) => [...document.querySelectorAll(`${LIST} > li`)].slice(0, n).map((li) => li.getAttribute('title')), { LIST, n });
const selectedRow = (page) => page.evaluate((LIST) => {
  const all = [...document.querySelectorAll(`${LIST} > li`)];
  const index = all.findIndex((li) => li.getAttribute('aria-current') === 'true');
  return index === -1 ? null : { index: index + 1, title: all[index].getAttribute('title') };
}, LIST);
const verdictOfRow = (page, n) => page.evaluate(({ LIST, n }) => document.querySelectorAll(`${LIST} > li`)[n - 1]?.querySelector('[role="img"]')?.getAttribute('aria-label') ?? null, { LIST, n });
const where = (page) => page.evaluate(() => ({
  scene: document.querySelector('button[aria-label^="Scene: "]')?.getAttribute('aria-label') ?? '',
  header: document.querySelector('header')?.textContent ?? '',
  camera: document.querySelector('[aria-label="Cameras"] button[aria-pressed="true"]')?.getAttribute('aria-label') ?? '',
}));
const expectAt = async (check, page, label, n) => {
  const [scene, frame, camera] = FIRST_FIVE[n - 1];
  await page.waitForFunction(({ LIST, title }) => document.querySelector(`${LIST} > li[aria-current="true"]`)?.getAttribute('title') === title, { LIST, title: `${scene} · frame ${frame} · ${camera}` }, { timeout: 20000 }).catch(() => undefined);
  await page.waitForFunction((scene) => (document.querySelector('button[aria-label^="Scene: "]')?.getAttribute('aria-label') ?? '').includes(scene), scene, { timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  const sel = await selectedRow(page);
  const at = await where(page);
  check(`${label}: row ${n} is selected`, sel?.index === n, JSON.stringify(sel));
  check(`${label}: the scene on screen is ${scene}`, at.scene.includes(scene), at.scene);
  check(`${label}: the frame is ${frame}`, new RegExp(`Frame ${frame}/`).test(at.header), at.header.slice(0, 120));
  check(`${label}: the photo is ${camera}`, at.camera.startsWith(camera) && !at.camera.startsWith(`${camera}_`), at.camera);
  const panel = await text(page, 'section[aria-label="Details"]');
  check(`${label}: the panel names the box (box ${n} of …, ${scene}, frame ${frame}, ${SHORT[camera]})`, panel.includes(`box ${n} of`) && panel.includes(scene) && panel.includes(`frame ${frame}`) && panel.includes('The model says'), panel.slice(0, 150));
  // the selected model box is drawn in the photo (its caption carries "model")
  const caption = await page.locator('section[aria-label="Camera image"]').innerText();
  check(`${label}: the model box is drawn in the photo`, /model/i.test(caption), caption.replace(/\s+/g, ' ').slice(0, 80));
};

(async () => {
  const { check, done } = makeChecker('b');
  const browser = await launch();
  const context = await browser.newContext({ acceptDownloads: true });
  let page = await openApp(context);
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  await mode(page, 'Evaluate');
  await page.waitForTimeout(1500);
  await page.evaluate(() => { document.querySelector('section[aria-label="3D view"] canvas').__mark = 'same'; });
  const canvasKept = () => page.evaluate(() => document.querySelector('section[aria-label="3D view"] canvas')?.__mark === 'same');

  const entry = page.getByRole('button', { name: 'Sample check', exact: true });
  check('evaluate mode has a "Sample check" button', (await entry.count()) === 1);
  const before = await text(page, 'header');
  await entry.click();
  await page.waitForSelector(`${LIST} > li`, { timeout: 30000 });
  await page.waitForTimeout(800);

  // ---- the sample
  check('the sample lists 100 boxes', (await rows(page).count()) === 100, String(await rows(page).count()));
  const bar = await page.evaluate(() => document.querySelector('header')?.parentElement?.nextElementSibling?.textContent ?? '');
  check('the bar says "random 100 of 1,452"', /random\s*100\s*of\s*1,452/.test(bar), bar.slice(0, 120));
  check('the bar has no score slider (the sample is fixed)', (await page.locator('input[type="range"]').count()) === 0);
  const titles = await rowTitles(page, 5);
  check('the first five boxes are the locked ones, in order', JSON.stringify(titles) === JSON.stringify(FIRST_FIVE.map(([s, f, c]) => `${s} · frame ${f} · ${c}`)), JSON.stringify(titles));
  await expectAt(check, page, 'on entering', 1);
  check('nothing is judged yet: "0 of 100 judged" and no estimate', /0 of 100 judged/.test(await text(page, 'section[aria-label="Details"]')) && /Nothing judged yet/.test(await text(page, 'section[aria-label="Details"]')));
  check('the 3D canvas was not re-created (entering + scene change)', await canvasKept());
  await page.screenshot({ path: path.join(SHOTS, 'b1_enter.png') });

  // ---- looking at the other cameras must not lose the box (Edge_F#7.5 Case 5)
  const DETAILS_ = 'section[aria-label="Details"]';
  // a thumbnail's label is the camera name, plus ", sees the selected box" when it carries the marker
  const thumb = (name) => page.locator(`[aria-label="Cameras"] button[aria-label="${name}"], [aria-label="Cameras"] button[aria-label^="${name},"]`);
  const camState = () => page.evaluate(() => {
    const cam = document.querySelector('section[aria-label="Camera image"]');
    return {
      camera: document.querySelector('[aria-label="Cameras"] button[aria-pressed="true"]')?.getAttribute('aria-label') ?? '',
      caption: [...cam.querySelectorAll('svg text')].map((t) => t.textContent).join(' | '),
      viewBox: cam.querySelector('svg')?.getAttribute('viewBox') ?? '',
      panel: document.querySelector('section[aria-label="Details"]').innerText.replace(/\s+/g, ' '),
      enabled: [...document.querySelectorAll('[aria-label="Verdict"] button')].every((b) => !b.disabled),
      marked: [...document.querySelectorAll('[aria-label="Cameras"] button')].filter((b) => /sees the selected box/.test(b.getAttribute('aria-label'))).map((b) => b.getAttribute('aria-label').split(',')[0]),
    };
  });
  let cs = await camState();
  check('the thumbnail of the box\'s camera (and only that one) carries the marker', JSON.stringify(cs.marked) === JSON.stringify(['CAM_FRONT']), JSON.stringify(cs.marked));
  check('on the box\'s own photo: zoomed, caption "model · car 0.37"', /model · car 0\.37/.test(cs.caption) && cs.viewBox !== '0 0 1600 900', `${cs.caption} / ${cs.viewBox}`);
  await thumb('CAM_FRONT_RIGHT').click();
  await page.waitForTimeout(700);
  cs = await camState();
  check('another camera clicked: the photo changes, and box 1 is STILL the selected sample box', cs.camera.startsWith('CAM_FRONT_RIGHT') && cs.panel.includes('box 1 of 100') && !/No sampled box/.test(cs.panel), cs.panel.slice(0, 120));
  check('…the panel says where the box is and offers the way back; the verdict buttons stay enabled', /Showing FR — the box is in the F photo\./.test(cs.panel) && /Show the box/.test(cs.panel) && cs.enabled, cs.panel.slice(0, 200));
  check('…that photo is shown whole (nothing to zoom on) and has no yellow caption', cs.viewBox === '0 0 1600 900' && !/model · car 0\.37/.test(cs.caption), `${cs.viewBox} / ${cs.caption}`);
  const noteFits = await page.evaluate(() => { const panel = document.querySelector('section[aria-label="Details"]').getBoundingClientRect(); const buttons = [...document.querySelectorAll('[aria-label="Verdict"] button')]; const note = [...document.querySelectorAll('section[aria-label="Details"] p')].find((p) => /the box is in the/.test(p.textContent)); const r = note.getBoundingClientRect(); return { note: r.left >= panel.left && r.right <= panel.right + 1 && note.scrollWidth <= note.clientWidth + 1, buttons: buttons.every((b) => b.getBoundingClientRect().bottom <= panel.bottom) }; });
  check('…the note is inside the panel, not cut, and the verdict buttons are still visible without scrolling', noteFits.note && noteFits.buttons, JSON.stringify(noteFits));
  await page.screenshot({ path: path.join(SHOTS, 'b7_other_camera.png') });
  await page.getByRole('button', { name: 'Show the box', exact: true }).click();
  await page.waitForTimeout(700);
  cs = await camState();
  check('"Show the box" returns to the box\'s photo: zoomed, yellow caption back', cs.camera.startsWith('CAM_FRONT') && !cs.camera.startsWith('CAM_FRONT_') && /model · car 0\.37/.test(cs.caption) && cs.viewBox !== '0 0 1600 900', `${cs.camera} / ${cs.caption}`);
  await thumb('CAM_BACK').click();
  await page.waitForTimeout(600);
  await thumb('CAM_FRONT').click();
  await page.waitForTimeout(700);
  cs = await camState();
  check('clicking the box\'s thumbnail again also brings the yellow box back', /model · car 0\.37/.test(cs.caption) && cs.panel.includes('box 1 of 100'), cs.caption);
  await thumb('CAM_BACK_LEFT').click();
  await page.waitForTimeout(600);
  await rows(page).nth(0).click();
  await page.waitForTimeout(700);
  cs = await camState();
  check('clicking the box\'s row in the list returns to its photo as well', cs.camera.startsWith('CAM_FRONT') && !cs.camera.startsWith('CAM_FRONT_') && /model · car 0\.37/.test(cs.caption), `${cs.camera} / ${cs.caption}`);
  await page.keyboard.press(']');
  await page.waitForTimeout(600);
  cs = await camState();
  check('] steps to the next camera and keeps the box selected', !/model · car 0\.37/.test(cs.caption) && cs.panel.includes('box 1 of 100'), `${cs.camera}`);
  await page.keyboard.press('[');
  await page.waitForTimeout(600);
  cs = await camState();
  check('[ steps back: the yellow box is there again', /model · car 0\.37/.test(cs.caption), cs.caption);
  await page.locator('button[aria-label^="Frame 5:"]').click();
  await page.waitForTimeout(700);
  cs = await camState();
  check('another FRAME (not another camera) still deselects: the box is not in that frame', /No sampled box is selected/.test(cs.panel), cs.panel.slice(0, 80));
  await page.keyboard.press('j');
  await expectAt(check, page, 'J after that', 1);
  check('the 3D canvas was not re-created by looking around', await canvasKept());

  // ---- verdicts with the keyboard (the first one given while looking through another camera)
  await thumb('CAM_FRONT_LEFT').click();
  await page.waitForTimeout(700);
  await page.keyboard.press('a');
  await expectAt(check, page, 'after A', 2);
  check('A marked box 1 "Real object, label missing"', (await verdictOfRow(page, 1)) === 'Real object, label missing', String(await verdictOfRow(page, 1)));
  await page.keyboard.press('r');
  await expectAt(check, page, 'after R', 3);
  check('R marked box 2 "Model is wrong"', (await verdictOfRow(page, 2)) === 'Model is wrong', String(await verdictOfRow(page, 2)));
  await page.keyboard.press('u');
  await expectAt(check, page, 'after U', 4);
  check('U marked box 3 "Unclear"', (await verdictOfRow(page, 3)) === 'Unclear', String(await verdictOfRow(page, 3)));
  let panel = await text(page, 'section[aria-label="Details"]');
  check('progress reads "3 of 100 judged — not final"', panel.includes('3 of 100 judged — not final'), panel.slice(0, 260));
  check('the estimate is worded as a sample: "1 of 3 sampled boxes → about …% of all 1,452"', /1 of 3 sampled boxes → about \d+–\d+% of all 1,452/.test(panel), panel);
  check('…and says it is an estimate, not a count', /not a count of all 1,452 boxes/.test(panel));
  check('the 3D canvas was not re-created (three scene changes)', await canvasKept());
  await page.screenshot({ path: path.join(SHOTS, 'b2_three_verdicts.png') });

  // ---- stepping and clearing
  await page.keyboard.press('k');
  await expectAt(check, page, 'after K', 3);
  await page.keyboard.press('c');
  await page.waitForTimeout(400);
  check('C cleared the verdict of box 3', (await verdictOfRow(page, 3)) === 'Not judged', String(await verdictOfRow(page, 3)));
  check('…and the progress went back to 2', (await text(page, 'section[aria-label="Details"]')).includes('2 of 100 judged'));
  await page.keyboard.press('u');
  await expectAt(check, page, 'after U again', 4);
  await page.keyboard.press('j');
  await expectAt(check, page, 'after J', 5);
  await page.keyboard.press('k');
  await expectAt(check, page, 'after K', 4);

  // ---- a verdict with the mouse
  await rows(page).nth(0).click();
  await expectAt(check, page, 'after clicking row 1', 1);
  const pressed = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Verdict"] button')].map((b) => `${b.getAttribute('aria-pressed')}:${b.textContent.trim()}`));
  check('the panel shows box 1\'s verdict as the pressed button', pressed[0]?.startsWith('true') && pressed[1]?.startsWith('false'), JSON.stringify(pressed));

  // ---- text is not cut, nothing sticks out (by position, not by content)
  for (const [w, h] of [[1536, 700], [1440, 900], [1280, 720], [1024, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(900);
    const cutButtons = await clipped(page, 'section[aria-label="Details"]', '[aria-label="Verdict"] button');
    check(`${w}×${h}: the three verdict buttons are inside the panel`, cutButtons.length === 0, cutButtons.join('; '));
    const visible = await page.evaluate(() => {
      const panel = document.querySelector('section[aria-label="Details"]').getBoundingClientRect();
      return [...document.querySelectorAll('[aria-label="Verdict"] button')].every((b) => { const r = b.getBoundingClientRect(); return r.bottom <= panel.bottom && r.top >= panel.top; });
    });
    check(`${w}×${h}: the verdict buttons are visible without scrolling the panel`, visible);
    const barBad = await page.evaluate(() => {
      const bar = document.querySelector('header').parentElement.nextElementSibling;
      const outer = bar.getBoundingClientRect();
      const bad = [];
      for (const el of bar.querySelectorAll('button, span')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.right > outer.right + 1 || r.bottom > outer.bottom + 1 || r.top < outer.top - 1) bad.push((el.textContent || '').trim().slice(0, 30));
      }
      return { bad, height: Math.round(outer.height) };
    });
    check(`${w}×${h}: everything in the sample bar is inside the bar (height ${barBad.height}px)`, barBad.bad.length === 0, barBad.bad.join(' | '));
    const rowBad = await clipped(page, 'section[aria-label="Objects"]', `${LIST} > li:nth-child(-n+12) > span`);
    check(`${w}×${h}: list columns are not cut — including the class names (first 12 rows)`, rowBad.length === 0, rowBad.slice(0, 3).join('; '));
    const panelCut = await clipped(page, 'section[aria-label="Details"]', 'button, button span, p, h2 + span, h3 + span');
    check(`${w}×${h}: no text in the panel is cut or sticks out`, panelCut.length === 0, panelCut.slice(0, 3).join('; '));
    const estimateVisible = await page.evaluate(() => {
      const panel = document.querySelector('section[aria-label="Details"]').getBoundingClientRect();
      const sentence = document.querySelector('section[aria-label="Estimate"] p');
      if (!sentence) return 'no estimate sentence';
      const r = sentence.getBoundingClientRect();
      return r.bottom <= panel.bottom + 1 ? '' : `sentence bottom ${Math.round(r.bottom)} > panel bottom ${Math.round(panel.bottom)}`;
    });
    check(`${w}×${h}: the estimate sentence is visible without scrolling the panel`, estimateVisible === '', estimateVisible);
    const barText = await page.evaluate(() => {
      const bar = document.querySelector('header').parentElement.nextElementSibling;
      return [...bar.querySelectorAll('span, button')].filter((el) => el.getBoundingClientRect().width > 0 && el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim().slice(0, 30));
    });
    check(`${w}×${h}: no text in the sample bar is cut`, barText.length === 0, barText.join(' | '));
    check(`${w}×${h}: no page scroll`, await noPageScroll(page));
    if (w === 1280) await page.screenshot({ path: path.join(SHOTS, 'b5_1280x720.png') });
    if (w === 1024) await page.screenshot({ path: path.join(SHOTS, 'b6_1024x768.png') });
  }
  await page.setViewportSize({ width: 1536, height: 700 });
  await page.waitForTimeout(800);

  // ---- export
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()]);
  const file = path.join(OUT, 'export.json');
  await download.saveAs(file);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('export: file name is false-alarm-sample_<date>.json', /^false-alarm-sample_\d{8}-\d{4}\.json$/.test(download.suggestedFilename()), download.suggestedFilename());
  check('export: its own format, not review@2', data.format === 'ai-detection-viewer/false-alarm-sample@1', data.format);
  check('export: population 1,452, seed, 100 items', data.population.size === 1452 && data.sample.size === 100 && data.items.length === 100 && Number.isInteger(data.sample.seed));
  check('export: 3 judged — the same number the screen shows', data.summary.judged === 3 && (await text(page, 'section[aria-label="Details"]')).includes('3 of 100 judged'));
  check('export: verdicts in words', data.items[0].verdict === 'real-object' && data.items[1].verdict === 'model-wrong' && data.items[2].verdict === 'unclear' && data.items[3].verdict === null, JSON.stringify(data.items.slice(0, 4).map((i) => i.verdict)));
  check('export: the estimate carries a range', data.summary.estimates['real-object'].low < data.summary.estimates['real-object'].high);

  // ---- storage: its own scope, the label review untouched
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ai-detection-viewer.review')));
  const scopes = stored.state.reviews;
  check('saved under the scope "nuscenes-false-alarms" (3 records)', Object.keys(scopes['nuscenes-false-alarms'] ?? {}).length === 3, JSON.stringify(Object.keys(scopes)));
  check('the label-review scopes hold nothing', Object.keys(scopes.nuscenes ?? {}).length === 0 && Object.keys(scopes['nuscenes-practice'] ?? {}).length === 0);

  // ---- sample size 200 keeps the first hundred and the verdicts
  await page.getByRole('group', { name: 'Sample size' }).getByRole('button', { name: '200', exact: true }).click();
  await page.waitForTimeout(700);
  check('size 200: the list has 200 boxes', (await rows(page).count()) === 200, String(await rows(page).count()));
  check('size 200: it starts with the same five boxes', JSON.stringify(await rowTitles(page, 5)) === JSON.stringify(titles));
  check('size 200: the three verdicts are still there ("3 of 200 judged")', (await text(page, 'section[aria-label="Details"]')).includes('3 of 200 judged'));
  await page.screenshot({ path: path.join(SHOTS, 'b3_size_200.png') });
  await page.getByRole('group', { name: 'Sample size' }).getByRole('button', { name: '100', exact: true }).click();
  await page.waitForTimeout(500);

  // ---- leaving and the other modes
  await page.getByRole('button', { name: 'Exit sample check', exact: true }).click();
  await page.waitForTimeout(700);
  check('exit: the score slider and the result list are back', (await page.locator('input[type="range"]').count()) === 1 && /Results/i.test(await text(page, 'section[aria-label="Objects"]')));
  await mode(page, 'Review');
  await page.waitForTimeout(900);
  const reviewHeader = await text(page, 'header');
  check('review mode: the label review shows no reviewed boxes (sample verdicts are not label verdicts)', /\b0\s*\/\s*[\d,]+/.test(reviewHeader), reviewHeader.slice(0, 200));
  check('the 3D canvas was not re-created (whole run so far)', await canvasKept());

  // ---- the slider does not move the sample
  await mode(page, 'Evaluate');
  await page.waitForTimeout(900);
  await page.locator('input[type="range"]').focus();
  for (let i = 0; i < 40; i += 1) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  const sliderValue = await page.locator('input[type="range"]').inputValue();
  await page.getByRole('button', { name: 'Sample check', exact: true }).click();
  await page.waitForSelector(`${LIST} > li`, { timeout: 30000 });
  await expectAt(check, page, `with the slider at ${sliderValue}, re-entering`, 4);
  check(`with the slider at ${sliderValue}: still "random 100 of 1,452" and the same five boxes`, /random\s*100\s*of\s*1,452/.test(await page.evaluate(() => document.querySelector('header').parentElement.nextElementSibling.textContent)) && JSON.stringify(await rowTitles(page, 5)) === JSON.stringify(titles));
  await page.getByRole('button', { name: 'Exit sample check', exact: true }).click();
  await page.waitForTimeout(500);
  check('…and the slider is where it was left', (await page.locator('input[type="range"]').inputValue()) === sliderValue, sliderValue);

  // ---- reload: same sample, verdicts kept, resumes at the first unjudged box
  await page.close();
  page = await openApp(context);
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await mode(page, 'Evaluate');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Sample check', exact: true }).click();
  await page.waitForSelector(`${LIST} > li`, { timeout: 30000 });
  check('after a reload: the same five boxes in the same order', JSON.stringify(await rowTitles(page, 5)) === JSON.stringify(titles), JSON.stringify(await rowTitles(page, 5)));
  await expectAt(check, page, 'after a reload', 4);
  check('after a reload: the three verdicts are there', (await verdictOfRow(page, 1)) === 'Real object, label missing' && (await verdictOfRow(page, 2)) === 'Model is wrong' && (await verdictOfRow(page, 3)) === 'Unclear' && (await text(page, 'section[aria-label="Details"]')).includes('3 of 100 judged'));
  await page.screenshot({ path: path.join(SHOTS, 'b4_after_reload.png') });

  // ---- playback blocks a verdict
  await page.getByRole('button', { name: 'Play sequence' }).click({ force: true });
  await page.waitForTimeout(700);
  const disabled = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Verdict"] button')].every((b) => b.disabled));
  await page.keyboard.press('a');
  await page.waitForTimeout(300);
  check('while the sequence plays the verdict buttons are disabled and A does nothing', disabled && (await text(page, 'section[aria-label="Objects"]')).includes('97 to go'), `disabled=${disabled}`);
  await page.getByRole('button', { name: /Pause|Stop/ }).first().click({ force: true }).catch(() => undefined);

  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  const failed = done();
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
