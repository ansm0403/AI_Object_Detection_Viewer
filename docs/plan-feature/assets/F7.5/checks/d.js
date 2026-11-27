// F7.5-D: the evaluation report (drives, day / night by distance, false alarms). PASS / FAIL on the real app.
const path = require('path');
const { SHOTS, makeChecker, launch, openApp, mode, text, noPageScroll } = require('./lib');

const DIALOG = '[role="dialog"][aria-label="Evaluation report"]';
const report = (page) => page.locator(DIALOG);
const reportText = async (page) => (await report(page).innerText()).replace(/\s+/g, ' ').trim();
const rowsOf = (page, label) => page.evaluate(({ DIALOG, label }) => [...document.querySelectorAll(`${DIALOG} section[aria-label="${label}"] tbody tr`)].map((tr) => [...tr.children].map((c) => c.innerText.replace(/\s+/g, ' ').trim()).filter((t) => t !== '').join(' | ')), { DIALOG, label });
const openReport = async (page) => { await page.getByRole('button', { name: 'Report', exact: true }).click(); await page.waitForSelector(DIALOG, { timeout: 15000 }); await page.waitForFunction((DIALOG) => !document.querySelector(DIALOG + ' [aria-busy="true"]'), DIALOG, { timeout: 15000 }).catch(() => undefined); await page.waitForTimeout(500); };

const DRIVES = [
  '2018-07-24 singapore-onenorth | 1 | 86 | 46.2% | 759/1,644',
  '2018-08-01 boston-seaport | 1 | 106 | 71.9% | 1,200/1,670',
  '2018-08-27 boston-seaport | 1 | 100 | 76.2% | 1,010/1,326',
  '2018-08-28 boston-seaport | 1 | 35 | 55.7% | 643/1,155',
  '2018-08-30 boston-seaport | 1 | 23 | 65.8% | 314/477',
  '2018-10-02 singapore-queenstown | 1 | 43 | 66.6% | 421/632',
  '2018-10-08 singapore-queenstown | 1 | 90 | 67.8% | 1,364/2,012',
  '2018-11-21 · night singapore-hollandvillage | 3 | 171 | 32.7% | 1,015/3,102',
];
const BANDS = [
  '0–10 m | 76% | 55% | 1,108 / 280',
  '10–20 m | 79% | 30% | 2,209 / 769',
  '20–30 m | 69% | 38% | 2,121 / 836',
  '30–40 m | 62% | 29% | 1,226 / 478',
  '40–50 m | 49% | 20% | 799 / 239',
  '50–60 m | 38% | 39% | 636 / 179',
  '60–70 m | 42% | 26% | 378 / 93',
  '70–80 m | 26% | 29% | 244 / 95',
  '80–90 m | 37% | 2% | 115 / 56',
  '90 m + | 19% | 4% | 80 / 77',
];

(async () => {
  const { check, done } = makeChecker('d');
  const browser = await launch();
  const context = await browser.newContext();
  const page = await openApp(context);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  check('review mode: no Report button', (await page.getByRole('button', { name: 'Report', exact: true }).count()) === 0);
  await mode(page, 'Explore');
  await page.waitForTimeout(800);
  check('explore mode: no Report button', (await page.getByRole('button', { name: 'Report', exact: true }).count()) === 0);
  await mode(page, 'Evaluate');
  await page.waitForTimeout(2500);
  await page.evaluate(() => { document.querySelector('section[aria-label="3D view"] canvas').__mark = 'same'; });
  const canvasKept = () => page.evaluate(() => document.querySelector('section[aria-label="3D view"] canvas')?.__mark === 'same');
  check('evaluate mode: the top bar has a Report button', (await page.getByRole('button', { name: 'Report', exact: true }).count()) === 1);

  await openReport(page);
  // ---- where it is
  const geometry = await page.evaluate((DIALOG) => {
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    const d = r(DIALOG), list = r('section[aria-label="Objects"]'), view = r('section[aria-label="3D view"]'), cam = r('section[aria-label="Camera image"]'), frames = r('section[aria-label="Frames"]');
    const near = (a, b) => Math.abs(a - b) <= 1;
    return { covers: near(d.left, list.left) && near(d.top, list.top) && near(d.right, view.right) && near(d.bottom, view.bottom), clearOfCamera: d.right <= cam.left, clearOfTimeline: d.bottom <= frames.top, size: `${Math.round(d.width)}×${Math.round(d.height)}` };
  }, DIALOG);
  check(`the report covers exactly the list and the 3D view (${geometry.size}) and leaves the photo, the panel and the timeline visible`, geometry.covers && geometry.clearOfCamera && geometry.clearOfTimeline, JSON.stringify(geometry));
  check('the 3D view is still mounted underneath (same canvas)', await canvasKept());

  // ---- conditions first
  const chips = await page.locator(`${DIALOG} [aria-label="Measured with"] span.rounded-full`).allInnerTexts();
  check('conditions: yolov8n · no fine-tuning · input 1280 · score ≥ 0.25 · IoU ≥ 0.3 · labels are projected 3D boxes', JSON.stringify(chips) === JSON.stringify(['yolov8n', 'no fine-tuning', 'input 1280', 'score ≥ 0.25', 'IoU ≥ 0.3', 'labels = 3D boxes projected into the photo (approximate)']), JSON.stringify(chips));
  const order = await page.evaluate((DIALOG) => { const c = document.querySelector(`${DIALOG} [aria-label="Measured with"]`).getBoundingClientRect(); const t = document.querySelector(`${DIALOG} section[aria-label="Total"]`).getBoundingClientRect(); return c.bottom <= t.top; }, DIALOG);
  check('the conditions sit above the numbers', order);

  // ---- totals
  let all = await reportText(page);
  check('title: all 10 scenes · 404 frames · 2,424 photos', /all 10 scenes · 404 frames · 2,424 photos/.test(all), all.slice(0, 120));
  check('total: Precision 65.7% (6,726 of 10,240), Recall 56.0% (6,726 of 12,018)', /Precision 65\.7% 6,726 of 10,240 model boxes matched a label/.test(all) && /Recall 56\.0% 6,726 of 12,018 labels were found/.test(all));
  check('total: "654 distinct objects … in 8 drives" and "not “the model’s performance”"', /12,018 labels are 654 distinct objects/.test(all) && /in 8 drives/.test(all) && /not “the model’s performance”/.test(all));

  // ---- drives
  const drives = await rowsOf(page, 'Recall by drive');
  check('drive table: 8 rows with the measured numbers, oldest first, the night drive last with 3 scenes', JSON.stringify(drives) === JSON.stringify(DRIVES), JSON.stringify(drives));
  check('drive table: "Day: 7 drives, 64.1% (5,711 / 8,916). Night: 1 drive (3 scenes), 32.7% (1,015 / 3,102) — one evening in one place."', /Day: 7 drives, 64\.1% \( ?5,711 \/ 8,916\)\. Night: 1 drive \(3 scenes\), 32\.7% \(1,015 \/ 3,102\) — one evening in one place\./.test(all), all.match(/Day: 7.{0,140}/)?.[0]);

  // ---- distance
  const bands = await rowsOf(page, 'Day and night at the same distance');
  check('distance table: 10 rows (day %, night %, labels day / night)', JSON.stringify(bands) === JSON.stringify(BANDS), JSON.stringify(bands));
  check('distance table carries "night = 1 drive"', /night = 1 drive/.test(await page.locator(`${DIALOG} section[aria-label="Day and night at the same distance"]`).innerText()));
  check('distance: "night recall is 33.9% instead of 32.7% (day: 64.1%) … accounts for 1.2 of the 31.4 points"', /night recall is 33\.9% instead of 32\.7% \(day: 64\.1%\): the distance mix accounts for 1\.2 of the 31\.4 points/.test(all), all.match(/Re-weighted.{0,200}/)?.[0]);
  check('distance: "What the rest is due to is not established by this: all 3 night scenes are one drive."', /What the rest is due to is not established by this: all 3 night scenes are one drive\./.test(all));
  const faded = await page.evaluate((DIALOG) => [...document.querySelectorAll(`${DIALOG} section[aria-label="Day and night at the same distance"] tbody tr`)].map((tr) => tr.className.includes('opacity-50')), DIALOG);
  check('distance: no band is faded (each has ≥ 50 labels in both groups, the far ones added up)', faded.every((f) => !f), JSON.stringify(faded));

  // ---- false alarms
  const fa = (await page.locator(`${DIALOG} section[aria-label="False alarms with no label nearby"]`).innerText()).replace(/\s+/g, ' ');
  check('false alarms: "1,452 of 3,514 (41%) have no label of any class nearby", counted at the fixed rules', /1,452 of 3,514 \(41%\) have no label of any class nearby/.test(fa) && /score ≥ 0\.25, IoU ≥ 0\.3/.test(fa), fa);
  check('false alarms: "Not checked yet" and a button into the sample check', /Not checked yet/.test(fa) && /Check a sample of 100/.test(fa));
  await page.screenshot({ path: path.join(SHOTS, 'd1_report.png') });

  // ---- by position: nothing cut, nothing outside, everything visible
  for (const [w, h] of [[1536, 700], [1440, 900], [1280, 720], [1024, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(900);
    const layout = await page.evaluate((DIALOG) => {
      const dialog = document.querySelector(DIALOG);
      const outer = dialog.getBoundingClientRect();
      const body = dialog.querySelector('.overflow-y-auto');
      const cut = [], outside = [];
      for (const el of dialog.querySelectorAll('th, td, p, h2, h3, button, span.rounded-full, th span.truncate, dd, dt')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        const label = (el.textContent || '').trim().slice(0, 34);
        if (el.scrollWidth > el.clientWidth + 1) cut.push(label);
        if (r.left < outer.left - 1 || r.right > outer.right + 1) outside.push(label);
      }
      const last = (label) => { const rows = dialog.querySelectorAll(`section[aria-label="${label}"] tbody tr`); return rows[rows.length - 1].getBoundingClientRect().bottom; };
      const overlaps = (() => { const tds = [...dialog.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.getBoundingClientRect())); return tds.some((cells) => cells.some((c, i) => i > 0 && c.left < cells[i - 1].right - 1)); })();
      return { cut, outside, overlaps, scrolls: body.scrollHeight > body.clientHeight + 1, lastDrive: Math.round(last('Recall by drive')), lastBand: Math.round(last('Day and night at the same distance')), bottom: Math.round(outer.bottom), size: `${Math.round(outer.width)}×${Math.round(outer.height)}` };
    }, DIALOG);
    check(`${w}×${h} (report ${layout.size}): no text is cut`, layout.cut.length === 0, layout.cut.slice(0, 4).join(' | '));
    check(`${w}×${h}: nothing sticks out of the report and no table cells overlap`, layout.outside.length === 0 && !layout.overlaps, layout.outside.slice(0, 4).join(' | '));
    if (w >= 1440) { // three columns at 1536, two with the totals on top at 1440
      check(`${w}×${h}: both tables are fully visible without scrolling the report`, layout.lastDrive <= layout.bottom && layout.lastBand <= layout.bottom, JSON.stringify(layout));
    } else {
      // narrower: the blocks stack and the report scrolls inside itself
      await page.evaluate((DIALOG) => { const b = document.querySelector(DIALOG + ' .overflow-y-auto'); b.scrollTop = b.scrollHeight; }, DIALOG);
      await page.waitForTimeout(200);
      const reach = await page.evaluate((DIALOG) => { const d = document.querySelector(DIALOG).getBoundingClientRect(); const rows = document.querySelectorAll(`${DIALOG} section[aria-label="Day and night at the same distance"] tbody tr`); const r = rows[rows.length - 1].getBoundingClientRect(); return r.bottom <= d.bottom + 1 && r.top >= d.top; }, DIALOG);
      check(`${w}×${h}: the report scrolls inside itself and its last table row can be reached`, layout.scrolls ? reach : true, JSON.stringify(layout));
      await page.screenshot({ path: path.join(SHOTS, `d_${w}_bottom.png`) });
      await page.evaluate((DIALOG) => { document.querySelector(DIALOG + ' .overflow-y-auto').scrollTop = 0; }, DIALOG);
    }
    const bar = await page.evaluate(() => Math.round(document.querySelector('header').getBoundingClientRect().height));
    check(`${w}×${h}: the top bar (with the Report button) is one line (${bar}px); no page scroll`, bar <= 44 && (await noPageScroll(page)));
    if (w === 1280) await page.screenshot({ path: path.join(SHOTS, 'd4_1280x720.png') });
    if (w === 1024) await page.screenshot({ path: path.join(SHOTS, 'd5_1024x768.png') });
  }
  await page.setViewportSize({ width: 1536, height: 700 });
  await page.waitForTimeout(900);

  // ---- the report follows the IoU choice; the false-alarm block does not
  await page.getByRole('group', { name: 'Minimum overlap (IoU)' }).getByRole('button', { name: '0.5', exact: true }).click();
  await page.waitForFunction((DIALOG) => /51\.1%/.test(document.querySelector(DIALOG).innerText), DIALOG, { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  all = await reportText(page);
  check('IoU 0.5 with the report open: Precision 51.1%, Recall 45.4%, chip "IoU ≥ 0.5"', /Precision 51\.1%/.test(all) && /Recall 45\.4%/.test(all) && /IoU ≥ 0\.5 labels =/.test(all), all.slice(0, 260));
  check('IoU 0.5: day 52.3% (4,659 / 8,916), night 25.9% (803 / 3,102)', /Day: 7 drives, 52\.3% \( ?4,659 \/ 8,916\)/.test(all) && /25\.9% \(803 \/ 3,102\)/.test(all));
  check('IoU 0.5: the false-alarm block still reads 1,452 of 3,514 at its fixed rules', /1,452 of 3,514 \(41%\)/.test(all) && /score ≥ 0\.25, IoU ≥ 0\.3 — the sample check.s fixed rules/.test(all));
  await page.screenshot({ path: path.join(SHOTS, 'd2_report_iou05.png') });
  await page.getByRole('button', { name: 'Reset', exact: true }).first().click();
  await page.waitForFunction((DIALOG) => /65\.7%/.test(document.querySelector(DIALOG).innerText), DIALOG, { timeout: 15000 }).catch(() => undefined);

  // ---- keys do not act on what is hidden; Esc closes
  const before = await text(page, 'header');
  await page.keyboard.press('j');
  await page.keyboard.press('a');
  await page.waitForTimeout(400);
  check('with the report open, J / A do nothing underneath', (await text(page, 'header')) === before);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('Esc closes the report', (await report(page).count()) === 0);
  check('the 3D canvas was not re-created by opening / closing the report', await canvasKept());
  await page.keyboard.press('j');
  await page.waitForTimeout(400);
  check('after closing, J works again (a result is selected)', (await page.locator('section[aria-label="Objects"] li.ring-1').count()) === 1);

  // ---- the panel's link opens it too
  await page.evaluate(() => document.querySelector('ul[aria-label="Recall by scene"]').closest('section').scrollIntoView({ block: 'end' }));
  await page.getByRole('button', { name: /open the report/ }).click();
  await page.waitForSelector(DIALOG, { timeout: 10000 });
  check('the "All scenes" block of the panel opens the report as well', (await report(page).count()) === 1);

  // ---- from the report into the sample check and back
  await report(page).getByRole('button', { name: /Check a sample of 100/ }).click();
  await page.waitForSelector('ul[aria-label="Sampled boxes"] > li', { timeout: 30000 });
  await page.waitForTimeout(1500);
  check('"Check a sample" closes the report and opens the sample check on box 1', (await report(page).count()) === 0 && (await text(page, 'section[aria-label="Details"]')).includes('box 1 of 100'));
  check('during the sample check there is no Report button', (await page.getByRole('button', { name: 'Report', exact: true }).count()) === 0);
  await page.keyboard.press('a');
  await page.waitForFunction(() => document.querySelector('section[aria-label="Details"]').innerText.includes('box 2 of 100'), null, { timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  await page.keyboard.press('r');
  await page.waitForFunction(() => document.querySelector('section[aria-label="Details"]').innerText.includes('box 3 of 100'), null, { timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Exit sample check', exact: true }).click();
  await page.waitForTimeout(700);
  await openReport(page);
  const fa2 = (await page.locator(`${DIALOG} section[aria-label="False alarms with no label nearby"]`).innerText()).replace(/\s+/g, ' ');
  check('after two verdicts the report says "Sample check: 2 of 100 judged — not final" and words the estimate as a sample', /Sample check: 2 of 100 judged — not final/.test(fa2) && /1 of 2 sampled boxes → about \d+–\d+% of all 1,452/.test(fa2) && /Model wrong: 1, unclear: 0/.test(fa2), fa2);
  check('…and that precision was not re-scored; the button now continues the check', /nothing was re-scored/.test(fa2) && /Continue the sample check/.test(fa2));
  await page.screenshot({ path: path.join(SHOTS, 'd3_report_after_verdicts.png') });

  // ---- leaving the mode closes it
  await mode(page, 'Review');
  await page.waitForTimeout(700);
  check('switching to Review closes the report', (await report(page).count()) === 0);
  await mode(page, 'Evaluate');
  await page.waitForTimeout(900);
  check('…and it stays closed when coming back to Evaluate', (await report(page).count()) === 0);
  check('the 3D canvas was never re-created in this run', await canvasKept());

  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  const failed = done();
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
