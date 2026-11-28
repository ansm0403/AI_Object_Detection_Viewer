// F8 step F, second part: the "N rejected" count in the top bar is a button on the REVIEW
// screen — one click goes to the next rejected box, without opening the editor.
// Real app, production build on :3100.   usage: node f2.js <repoRoot> <outDir>
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
const REVIEW_KEY = 'ai-detection-viewer.review';

async function open(browser, width = 1536, height = 700, seed) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
  if (seed) await context.addInitScript((pairs) => { for (const [k, v] of pairs) if (v !== null && localStorage.getItem(k) === null) localStorage.setItem(k, v); }, seed);
  const page = await context.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForSelector('section[aria-label="3D view"] canvas', { timeout: 60000 });
  await page.waitForTimeout(2500);
  return { context, page };
}
const gotoFrame = async (page, n) => { await page.locator(`${FRAMES} button[aria-label^="Frame ${n}"]`).first().click(); await page.waitForTimeout(900); };
const gotoScene = async (page, name) => {
  await page.locator(`${FRAMES} button`, { hasText: /scene-/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('option', { name: new RegExp(name) }).first().click().catch(async () => { await page.getByText(name).first().click(); });
  await page.waitForTimeout(3000);
};
const rejectRow = async (page, locator) => { await locator.click(); await page.waitForTimeout(350); const id = await locator.locator('span.font-mono').getAttribute('title'); await page.keyboard.press('r'); await page.waitForTimeout(250); return id; };
const where = (page) => page.evaluate(() => {
  const scene = [...document.querySelectorAll('section[aria-label="Frames"] button')].map((b) => b.innerText).find((t) => /scene-\d+/.test(t));
  const frame = document.querySelector('header').innerText.match(/Frame (\d+)\s*\/\s*\d+/);
  const button = document.querySelector('header [data-part="next-rejected"]');
  const text = [...document.querySelectorAll('header [title^="Reviewed boxes"] *')].map((el) => el.innerText).find((t) => /^\d+ rejected$/.test(t || ''));
  return {
    scene: scene ? scene.match(/scene-\d+/)[0] : null,
    frame: frame ? Number(frame[1]) : null,
    id: (document.querySelector('section[aria-label="Objects"] li[data-selected="true"] span.font-mono') || { title: null }).title,
    editor: !!document.querySelector('section[aria-label="Top view"]'),
    button: button ? button.innerText : null,
    title: button ? button.title : null,
    editorId: (document.querySelector('main').parentElement.children[1].querySelector('span.font-mono') || { title: null }).title,
    buttonShown: !!button && button.getBoundingClientRect().width > 0,
    text: text || null,
    focusOnButton: document.activeElement === button,
    verdictShown: /Rejected/.test(document.querySelector('section[aria-label="Details"]').innerText),
  };
});
const short = (w) => `${w.scene} f${w.frame} ${String(w.id).slice(0, 6)}`;
const clickCount = async (page, wait = 1300) => { await page.locator('header [data-part="next-rejected"]').click(); await page.waitForTimeout(wait); };
const waitScene = (page, name) => page.waitForFunction((n) => [...document.querySelectorAll('section[aria-label="Frames"] button')].some((b) => b.innerText.includes(n)), name, { timeout: 30000 }).catch(() => undefined);

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ids = {};
  let seed = null;
  {
    const { context, page } = await open(browser);
    await page.waitForTimeout(3500);
    await page.evaluate(() => { document.querySelector('section[aria-label="3D view"] canvas').__mark = 'same'; });
    let w = await where(page);
    check('F2 · nothing rejected: "0 rejected" is plain text, not a button', w.button === null && w.text === '0 rejected', JSON.stringify(w));

    await gotoFrame(page, 9);
    ids.person = await rejectRow(page, page.locator(`${LIST} li`).filter({ has: page.locator('span[title="person"]') }).first());
    ids.car = await rejectRow(page, page.locator(`${LIST} li`, { has: page.locator('span.font-mono[title^="527702"]') }).first());
    await gotoFrame(page, 12);
    ids.f12 = await rejectRow(page, page.locator(`${LIST} li`).nth(4));
    await gotoScene(page, 'scene-0061');
    await gotoFrame(page, 3);
    ids.other = await rejectRow(page, page.locator(`${LIST} li`).nth(1));
    seed = [[REVIEW_KEY, await page.evaluate((k) => localStorage.getItem(k), REVIEW_KEY)]];
    w = await where(page);
    check('F2 · four rejected (one in this scene, scene-0061): the count "1 rejected" is now a button, and its tooltip says "1 rejected in this scene, 4 in all scenes"', w.button === '1 rejected' && w.buttonShown && /^1 rejected in this scene, 4 in all scenes\. Click: go to the next rejected box/.test(w.title), JSON.stringify({ button: w.button, shown: w.buttonShown, title: String(w.title).slice(0, 60) }));
    await shot(page, 'f5_count_is_a_button', { x: 0, y: 0, width: 1536, height: 110 });

    // ---- the walk from the review screen ---------------------------------------------
    await clickCount(page, 400);
    await waitScene(page, 'scene-0916');
    await page.waitForTimeout(2500);
    w = await where(page);
    check('F2 · one click from the scene-0061 box: scene-0916 frame 9, the person — selected, on the REVIEW screen (no editor), its verdict in the panel', w.scene === 'scene-0916' && w.frame === 9 && w.id === ids.person && !w.editor && w.verdictShown, short(w));
    check('F2 · … the click did not leave the focus on the count (Space / Enter would jump again)', !w.focusOnButton);
    check('F2 · … the 3D canvas was not re-created', await page.evaluate(() => document.querySelector('section[aria-label="3D view"] canvas').__mark === 'same'));
    await shot(page, 'f5_after_one_click');
    await clickCount(page);
    const second = await where(page);
    await clickCount(page);
    const third = await where(page);
    await clickCount(page, 400);
    await waitScene(page, 'scene-0061');
    await page.waitForTimeout(2500);
    const fourth = await where(page);
    check('F2 · further clicks: the car (frame 9), frame 12, and around to scene-0061 again — the order of N in the editor', second.id === ids.car && third.frame === 12 && third.id === ids.f12 && fourth.scene === 'scene-0061' && fourth.id === ids.other, `${short(second)} → ${short(third)} → ${short(fourth)}`);

    // ---- with nothing selected ------------------------------------------------------------
    await gotoScene(page, 'scene-0916');
    await gotoFrame(page, 10);
    w = await where(page);
    await clickCount(page);
    const from10 = await where(page);
    check('F2 · from frame 10 with nothing selected: the click goes to the nearest rejected box after it (frame 12)', w.id === null && from10.frame === 12 && from10.id === ids.f12, `${short(w)} → ${short(from10)}`);

    // ---- a verdict key after the jump works on the box that is on screen ---------------------
    await page.keyboard.press('3');
    await page.waitForTimeout(300);
    const reasons = await page.evaluate(([k, key]) => JSON.parse(localStorage.getItem(k)).state.reviews.nuscenes[key].reasons, [REVIEW_KEY, Object.keys(JSON.parse(seed[0][1]).state.reviews.nuscenes).find((x) => x.endsWith(ids.f12))]);
    check('F2 · after the jump the review keys work on that box (3 adds "wrong position" to the frame-12 box)', reasons.join() === 'wrong_position', reasons.join());

    // ---- inside the editor the count does what N does ---------------------------------------------
    await page.keyboard.press('e');
    await page.waitForTimeout(900);
    await clickCount(page, 400);
    await waitScene(page, 'scene-0061');
    await page.waitForTimeout(2500);
    w = await where(page);
    check('F2 · in the editor a click on the count does what N does (around to scene-0061), the editor stays open', w.editor && w.scene === 'scene-0061' && w.editorId === ids.other, `${w.scene} ${String(w.editorId).slice(0, 6)}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);

    // ---- every rejected box hidden by the filters: nothing to go to ---------------------------------
    const chips = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter((t) => ['bus', 'bicycle', 'motorcycle', 'truck'].includes(t)));
    await page.getByRole('button', { name: chips[0], exact: true }).first().click();
    await page.waitForTimeout(600);
    w = await where(page);
    check(`F2 · with only "${chips[0]}" shown (none of the rejected boxes): the count is still "1 rejected" but plain text — there is nothing the click could go to`, w.button === null && w.text === '1 rejected', JSON.stringify({ button: w.button, text: w.text }));
    // a scene with no rejected box of its own, the filter off again: the count is "0 rejected" and still leads to the others
    await page.getByRole('button', { name: chips[0], exact: true }).first().click();
    await page.waitForTimeout(400);
    await gotoScene(page, 'scene-0103');
    w = await where(page);
    const zero = { button: w.button, title: String(w.title).slice(0, 44) };
    await clickCount(page, 400);
    await waitScene(page, 'scene-0916');
    await page.waitForTimeout(2500);
    w = await where(page);
    check('F2 · in a scene with none of its own (scene-0103) the count reads "0 rejected" and is still a button ("0 rejected in this scene, 4 in all scenes"); a click goes to the next scene that has one', zero.button === '0 rejected' && /^0 rejected in this scene, 4 in all scenes/.test(zero.title) && w.scene === 'scene-0916' && w.id === ids.person, `${JSON.stringify(zero)} → ${short(w)}`);
    check('F2 · no page errors', page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  // ---- the width of the bar is what it was: a button, the same text --------------------------------
  {
    const { context, page } = await open(browser, 1536, 800, seed);
    const out = [];
    let wraps = 0;
    for (const w of [1024, 1279, 1280, 1300, 1320, 1400, 1440, 1536]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(220);
      const r = await page.evaluate(() => {
        const slot = document.querySelector('main').parentElement.children[0];
        const bar = slot.firstElementChild;
        let bottom = 0;
        for (const el of bar.querySelectorAll('*')) { const b = el.getBoundingClientRect(); if (b.width > 0) bottom = Math.max(bottom, b.bottom); }
        const groups = [...bar.children].map((g) => g.getBoundingClientRect());
        const button = document.querySelector('header [data-part="next-rejected"]');
        const neighbour = button ? button.nextElementSibling : null;
        return { wraps: bottom > slot.getBoundingClientRect().bottom + 0.5, spare: Math.round(groups[1].left - groups[0].right), shown: !!button && button.getBoundingClientRect().width > 0, sameLine: button && neighbour && button.getBoundingClientRect().width > 0 ? Math.abs(button.getBoundingClientRect().top - neighbour.getBoundingClientRect().top) < 2 && Math.abs(button.getBoundingClientRect().height - neighbour.getBoundingClientRect().height) < 2 : true };
      });
      if (r.wraps || !r.sameLine || r.shown !== (w >= 1280)) wraps += 1;
      out.push(`${w}:${r.wraps ? 'WRAPS' : r.spare}${r.shown ? '' : '(hidden)'}`);
    }
    // step D measured, with ONE rejected box as plain text: 1024:141 1279:396 1280:56 1300:76 1320:96 1400:176 1440:216 1536:312 (no edit)
    check('F2 · top bar with the count as a button, 8 widths: one line, the button on the text line and as tall as its neighbour, shown from 1280 px', wraps === 0, `room left (px) ${out.join(' ')}`);
    check('F2 · the room left is what step D measured with the count as plain text (one digit: "4 rejected" vs "1 rejected") — 56 px at 1280, 312 px at 1536', out.includes('1280:56') && out.includes('1536:312') && out.includes('1024:141(hidden)'), out.join(' '));
    await context.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nf2: ${results.length - failed} / ${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
  fs.writeFileSync(path.join(OUT, 'f2.result.json'), JSON.stringify(results, null, 1));
})();
