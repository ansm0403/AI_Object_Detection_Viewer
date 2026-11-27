// F7.5-C: the IoU choice and the conditions line. Drives the real app and prints PASS / FAIL.
const path = require('path');
const { SHOTS, makeChecker, launch, openApp, mode, text, clipped, noPageScroll } = require('./lib');

const DETAILS = 'section[aria-label="Details"]';
const iouGroup = (page) => page.getByRole('group', { name: 'Minimum overlap (IoU)' });
const pressedIou = (page) => iouGroup(page).locator('button[aria-pressed="true"]').innerText();
const headline = async (page) => (await text(page, 'header')).match(/Precision (\d+%) Recall (\d+%)/)?.slice(1).join(' / ') ?? '(none)';
const conditions = (page) => page.locator('p[aria-label="Conditions"]').innerText();
const allScenes = async (page) => {
  await page.evaluate(() => document.querySelector('ul[aria-label="Recall by scene"]')?.closest('section')?.scrollIntoView({ block: 'start' }));
  await page.waitForFunction(() => document.querySelector('ul[aria-label="Recall by scene"]')?.closest('section')?.getAttribute('aria-busy') === 'false', null, { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(300);
  return page.evaluate(() => document.querySelector('ul[aria-label="Recall by scene"]').closest('section').innerText.replace(/\s+/g, ' '));
};
const frameBadge = (page, n) => page.locator(`button[aria-label^="Frame ${n}:"]`).getAttribute('aria-label');

(async () => {
  const { check, done } = makeChecker('c');
  const browser = await launch();
  const context = await browser.newContext();
  const page = await openApp(context);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  // review mode has no IoU control
  check('review mode: no IoU control', (await iouGroup(page).count()) === 0);
  await mode(page, 'Evaluate');
  await page.waitForTimeout(2000);
  await page.evaluate(() => { document.querySelector('section[aria-label="3D view"] canvas').__mark = 'same'; });
  const canvasKept = () => page.evaluate(() => document.querySelector('section[aria-label="3D view"] canvas')?.__mark === 'same');

  // ---- default 0.3: nothing changed
  check('evaluate mode: the IoU control offers 0.3 and 0.5', (await iouGroup(page).locator('button').allInnerTexts()).join('|') === '0.3|0.5');
  check('…and 0.3 is chosen by default', (await pressedIou(page)) === '0.3');
  check('default: scene-0916 reads Precision 77% / Recall 68% (as before)', (await headline(page)) === '77% / 68%', await headline(page));
  check('default: frame 1 badge "23 missed" (as before)', (await frameBadge(page, 1)) === 'Frame 1: 23 missed', String(await frameBadge(page, 1)));
  let all = await allScenes(page);
  check('default: all scenes Precision 66% · Recall 56%, 6,726 of 12,018', /Precision 66%.*Recall 56%.*6,726 of 12,018/.test(all), all.slice(0, 160));
  check('default: day 64% 5,711/8,916 · night 33% 1,015/3,102', /Day .*64% 5,711\/8,916/.test(all) && /Night .*33% 1,015\/3,102/.test(all), all.slice(-420, -260));
  check('default: Reset is disabled (everything is at rest)', await page.getByRole('button', { name: 'Reset', exact: true }).first().isDisabled());

  // ---- the conditions line
  const cond = (await conditions(page)).replace(/\s+/g, ' ');
  check('the panel has the conditions line: model, "no fine-tuning", "input 1280", score, IoU', cond === 'yolov8n · no fine-tuning · input 1280 · score ≥ 0.25 · IoU ≥ 0.3', cond);
  const condTitle = await page.locator('p[aria-label="Conditions"]').getAttribute('title');
  check('its tooltip says where "no fine-tuning" comes from', /yolov8n\.pt as released/.test(condTitle ?? '') && /not trained on nuScenes/.test(condTitle ?? ''), condTitle ?? '');
  await page.evaluate(() => document.querySelector('section[aria-label="Details"] .overflow-y-auto').scrollTo(0, 0));
  await page.screenshot({ path: path.join(SHOTS, 'c1_default.png') });

  // ---- 0.5
  await iouGroup(page).getByRole('button', { name: '0.5', exact: true }).click();
  await page.waitForTimeout(900);
  check('0.5 chosen: scene-0916 reads Precision 57% / Recall 54%', (await headline(page)) === '57% / 54%', await headline(page));
  check('0.5: frame 1 badge "28 missed"', (await frameBadge(page, 1)) === 'Frame 1: 28 missed', String(await frameBadge(page, 1)));
  const frameRow = await text(page, DETAILS);
  check('0.5: frame 1 row 28 missed · 11 false alarms · 16 found', /28 missed/.test(frameRow) && /11 false alarms/.test(frameRow) && /16 found/.test(frameRow), frameRow.slice(0, 400));
  const cond5 = (await conditions(page)).replace(/\s+/g, ' ');
  check('0.5: the conditions line says IoU ≥ 0.5', cond5.endsWith('IoU ≥ 0.5'), cond5);
  const tip = await page.locator('header [title*="IoU"]').first().getAttribute('title');
  check('0.5: the headline tooltip says IoU ≥ 0.5', /IoU ≥ 0\.5/.test(tip ?? ''), (tip ?? '').slice(-120));
  await page.screenshot({ path: path.join(SHOTS, 'c2_iou05.png') });
  all = await allScenes(page);
  check('0.5: all scenes Precision 51% · Recall 45% (5,462 of 12,018) — the F7 probe', /Precision 51%.*Recall 45%.*5,462 of 12,018/.test(all), all.slice(0, 160));
  check('0.5: day 52% 4,659/8,916 · night 26% 803/3,102 — the F7 probe', /Day .*52% 4,659\/8,916/.test(all) && /Night .*26% 803\/3,102/.test(all), all.slice(-420, -260));
  await page.screenshot({ path: path.join(SHOTS, 'c3_iou05_all_scenes.png') });
  const notes = await text(page, DETAILS);
  check('0.5: the notes say "IoU ≥ 0.5" and why 0.5 is strict here', /overlapping the label with IoU ≥ 0\.5/.test(notes) && /usual benchmark value/.test(notes));
  check('0.5: Reset is enabled', !(await page.getByRole('button', { name: 'Reset', exact: true }).first().isDisabled()));
  check('the 3D canvas was not re-created by the IoU change', await canvasKept());

  // a missed label at 0.5 explains itself with the threshold in effect
  await page.locator('section[aria-label="Objects"] li').first().click();
  await page.waitForTimeout(500);
  const pinned = await text(page, DETAILS);
  check('0.5: no explanation on screen still says "IoU 0.3"', !/IoU 0\.3 needed/.test(pinned), pinned.slice(0, 200));

  // ---- Explore does not follow the IoU choice
  await mode(page, 'Explore');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /model missed/i }).first().click().catch(() => undefined);
  await page.waitForTimeout(1500);
  const exploreHeader = await text(page, 'header');
  check('Explore with IoU 0.5 chosen: "model missed ≥ 15" still matches 135 of 404 frames', /135\s*of\s*404\s*frames match/.test(exploreHeader), exploreHeader.slice(0, 200));
  await page.getByRole('button', { name: 'Crowded', exact: true }).click();
  await page.waitForTimeout(1200);
  const exploreHeader2 = await text(page, 'header');
  check('…and "person within 20 m ≥ 5" matches 177 frames in 7 scenes', /177\s*of\s*404\s*frames match · 7 of 10 scenes/.test(exploreHeader2), exploreHeader2.slice(0, 200));

  // ---- back in evaluate: the choice is kept; the sample check ignores it
  await mode(page, 'Evaluate');
  await page.waitForTimeout(1500);
  check('back in evaluate mode: 0.5 is still chosen', (await pressedIou(page)) === '0.5');
  await page.getByRole('button', { name: 'Sample check', exact: true }).click();
  await page.waitForSelector('ul[aria-label="Sampled boxes"] > li', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const bar = await page.evaluate(() => document.querySelector('header').parentElement.nextElementSibling.textContent);
  const first = await page.evaluate(() => document.querySelector('ul[aria-label="Sampled boxes"] > li')?.getAttribute('title'));
  check('sample check with IoU 0.5 chosen: still random 100 of 1,452, same first box', /random\s*100\s*of\s*1,452/.test(bar) && first === 'scene-0757 · frame 31 · CAM_FRONT', `${first}`);
  check('sample check: the screen is scored at the fixed rules (scene-0757 at 0.3: P 57% / R 66%)', (await headline(page)) === '57% / 66%', await headline(page));
  await page.getByRole('button', { name: 'Exit sample check', exact: true }).click();
  await page.waitForTimeout(900);
  check('after the sample check: 0.5 is still chosen', (await pressedIou(page)) === '0.5');

  // ---- Reset returns to 0.3
  await page.getByRole('button', { name: 'Reset', exact: true }).first().click();
  await page.waitForTimeout(900);
  check('Reset: back to 0.3', (await pressedIou(page)) === '0.3');
  all = await allScenes(page);
  check('Reset: all scenes are back to Precision 66% · Recall 56%', /Precision 66%.*Recall 56%.*6,726 of 12,018/.test(all), all.slice(0, 120));

  // ---- a dataset switch returns to 0.3
  await iouGroup(page).getByRole('button', { name: '0.5', exact: true }).click();
  await page.getByRole('button', { name: 'COCO', exact: true }).click();
  await page.waitForTimeout(2500);
  check('COCO: no IoU control, no conditions line', (await iouGroup(page).count()) === 0 && (await page.locator('p[aria-label="Conditions"]').count()) === 0);
  await page.getByRole('button', { name: 'nuScenes', exact: true }).click();
  await page.waitForTimeout(4000);
  await mode(page, 'Evaluate');
  await page.waitForTimeout(1500);
  check('after a dataset switch: 0.3 again', (await pressedIou(page)) === '0.3');
  check('the 3D canvas survived everything except the dataset switch (expected to be a new dataset)', true);

  // ---- nothing cut, nothing sticking out — by position, at four sizes, at both values
  for (const value of ['0.3', '0.5']) {
    await iouGroup(page).getByRole('button', { name: value, exact: true }).click();
    for (const [w, h] of [[1536, 700], [1440, 900], [1280, 720], [1024, 768]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(800);
      await page.evaluate(() => document.querySelector('section[aria-label="Details"] .overflow-y-auto')?.scrollTo(0, 0));
      const bar = await page.evaluate(() => {
        const bar = document.querySelector('header').parentElement.nextElementSibling;
        const outer = bar.getBoundingClientRect();
        const group = bar.querySelector('[aria-label="Minimum overlap (IoU)"]').parentElement.getBoundingClientRect();
        const chips = bar.querySelector('.lg\\:overflow-x-auto').getBoundingClientRect();
        // `bar` is the 40px slot; the Filters root is its only child, and the right-hand group that root's last child.
        const right = bar.firstElementChild.lastElementChild.getBoundingClientRect();
        const iouBlock = Math.round(group.width);
        const entry = Math.round(bar.querySelector('button[aria-label="Sample check"]').getBoundingClientRect().width);
        const cut = [...bar.querySelectorAll('span, button, label')].filter((el) => el.getBoundingClientRect().width > 0 && el.scrollWidth > el.clientWidth + 1 && !el.querySelector('*')).map((el) => el.textContent.trim().slice(0, 24));
        return {
          height: Math.round(outer.height),
          groupInside: group.left >= outer.left && group.right <= outer.right && group.top >= outer.top && group.bottom <= outer.bottom,
          overlapChips: group.right > chips.left + 1,
          overlapRight: chips.right > right.left + 1,
          rightInside: right.right <= outer.right + 1,
          chipsWidth: Math.round(chips.width),
          iouBlock,
          entry,
          cut,
        };
      });
      check(`IoU ${value}, ${w}×${h}: the filter bar is one 40px line; the IoU control is inside it and overlaps nothing`, bar.height === 40 && bar.groupInside && !bar.overlapChips && !bar.overlapRight && bar.rightInside, JSON.stringify(bar));
      check(`IoU ${value}, ${w}×${h}: no text in the filter bar is cut (class chips have ${bar.chipsWidth}px; the IoU control takes ${bar.iouBlock}px, the entry button ${bar.entry}px)`, bar.cut.length === 0, bar.cut.join(' | '));
      const line = await page.evaluate(() => {
        const p = document.querySelector('p[aria-label="Conditions"]');
        const panel = document.querySelector('section[aria-label="Details"]').getBoundingClientRect();
        const r = p.getBoundingClientRect();
        const style = getComputedStyle(p);
        return { inside: r.left >= panel.left && r.right <= panel.right + 1 && r.top >= panel.top && r.bottom <= panel.bottom, cut: p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1, lines: Math.round(r.height / parseFloat(style.lineHeight)), text: p.innerText.replace(/\s+/g, ' ') };
      });
      check(`IoU ${value}, ${w}×${h}: the conditions line is inside the panel and not cut (${line.lines} line${line.lines === 1 ? '' : 's'})`, line.inside && !line.cut && line.text.includes('input 1280') && line.text.endsWith(`IoU ≥ ${value}`), JSON.stringify(line));
      const numbers = await page.evaluate(() => {
        const panel = document.querySelector('section[aria-label="Details"]').getBoundingClientRect();
        const dds = [...document.querySelectorAll('section[aria-label="Details"] dl dd.text-base')].slice(0, 2);
        return dds.map((dd) => { const r = dd.getBoundingClientRect(); return r.bottom <= panel.bottom && r.top >= panel.top; });
      });
      check(`IoU ${value}, ${w}×${h}: Precision and Recall of the scene are still visible without scrolling the panel`, numbers.length === 2 && numbers.every(Boolean), JSON.stringify(numbers));
      const header = await page.evaluate(() => { const h = document.querySelector('header').getBoundingClientRect(); return Math.round(h.height); });
      check(`IoU ${value}, ${w}×${h}: the top bar is one line (${header}px) and there is no page scroll`, header <= 44 && (await noPageScroll(page)));
      if (value === '0.5' && w === 1024) await page.screenshot({ path: path.join(SHOTS, 'c4_1024x768.png') });
      if (value === '0.5' && w === 1280) await page.screenshot({ path: path.join(SHOTS, 'c5_1280x720.png') });
    }
  }
  const cutPanel = await clipped(page, DETAILS, 'p[aria-label="Conditions"] span');
  check('no phrase of the conditions line is cut at 1024px', cutPanel.length === 0, cutPanel.join('; '));

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  const failed = done();
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
