// F8 step 0 + step B: the top bar at narrow widths, and the top-view editor's frame
// (enter / leave, the two views, what is drawn). Real app, production build on :3100.
// usage: node b.js <repoRoot> <outDir>
const repo = process.argv[2];
const OUT = process.argv[3];
const fs = require('fs');
const path = require('path');
const { chromium } = require(repo + '/node_modules/playwright');
const URL = process.env.CHECK_URL || 'http://localhost:3100';
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const shot = (page, name) => page.screenshot({ path: path.join(OUT, 'shots', name + '.png') });

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
const rectOf = (page, selector) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }, selector);
const noPageScroll = (page) =>
  page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollHeight <= d.clientHeight && d.scrollWidth <= d.clientWidth;
  });
/** Text that is cut (scrollWidth > clientWidth) or sticks out of `root`, truncating elements included. */
const clipped = (page, rootSelector) =>
  page.evaluate((rootSelector) => {
    const root = document.querySelector(rootSelector);
    if (!root) return [`no root ${rootSelector}`];
    const outer = root.getBoundingClientRect();
    const bad = [];
    for (const el of root.querySelectorAll('span, p, button, label, h2, input, kbd')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const label = ((el.value !== undefined ? el.value : el.textContent) || '').trim().slice(0, 40);
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') bad.push(`cut: "${label}" (${el.scrollWidth} > ${el.clientWidth})`);
      if (r.left < outer.left - 1 || r.right > outer.right + 1) bad.push(`outside: "${label}"`);
    }
    return bad;
  }, rootSelector);
/** The top bar: is every item inside its 44 px slot (i.e. one line)? */
const topBar = (page) =>
  page.evaluate(() => {
    const slot = document.querySelector('main').parentElement.children[0];
    const s = slot.getBoundingClientRect();
    let bottom = 0;
    for (const el of slot.querySelectorAll('*')) {
      const b = el.getBoundingClientRect();
      if (b.width > 0) bottom = Math.max(bottom, b.bottom);
    }
    const groups = [...slot.firstElementChild.children].map((g) => g.getBoundingClientRect());
    return {
      oneLine: bottom <= s.bottom + 0.5,
      spare: groups.length === 2 ? Math.round(groups[1].left - groups[0].right) : null,
      title: [...slot.querySelectorAll('span')].some((x) => x.textContent.trim() === 'AI Detection Viewer' && x.getBoundingClientRect().width > 0),
    };
  });

async function open(browser, width, height, { motion = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: motion ? 'no-preference' : 'reduce' });
  await context.addInitScript(() => {
    const target = new EventTarget();
    window.__THREE_DEVTOOLS__ = target;
    window.__renderers = [];
    target.addEventListener('observe', (e) => { if (e.detail && e.detail.isWebGLRenderer) window.__renderers.push(e.detail); });
  });
  const page = await context.newPage();
  page.__errors = [];
  page.on('pageerror', (e) => page.__errors.push(String(e)));
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForSelector(`${SEL.view3d} canvas`, { timeout: 60000 });
  await page.waitForTimeout(2500);
  return { context, page };
}
const selectBox = async (page, frameNo, idPrefix) => {
  await page.locator(`${SEL.frames} button[aria-label^="Frame ${frameNo}"]`).first().click();
  await page.waitForTimeout(900);
  await page.locator(`${SEL.list} li`, { has: page.locator(`span.font-mono[title^="${idPrefix}"]`) }).first().click();
  await page.waitForTimeout(500);
};
const drawCalls = (page) => page.evaluate(async () => {
  const renderer = window.__renderers[window.__renderers.length - 1];
  if (!renderer) return null;
  const seen = [];
  for (let i = 0; i < 20; i += 1) { await new Promise((r) => requestAnimationFrame(r)); seen.push(renderer.info.render.calls); }
  seen.sort((a, b) => a - b);
  return seen[Math.floor(seen.length / 2)];
});
/** Is the "Classes" label in the FILTER BAR (the details panel has a section of the same name)? */
const chipsInBar = (page) => page.evaluate(() => [...document.querySelector('main').parentElement.children[1].querySelectorAll('*')].some((el) => el.children.length === 0 && /^classes$/i.test(el.textContent.trim())));
const editorOpen = (page) => page.locator(SEL.editor).count().then((n) => n > 0);
const field = (page, name) => page.locator(`${SEL.details} input[data-field="${name}"]`).inputValue();

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  // ---------------------------------------------------------------- step 0
  for (const w of [1024, 1040, 1100, 1279, 1280, 1536]) {
    const { context, page } = await open(browser, w, 768);
    const review = await topBar(page);
    check(`0 · ${w}px review: the top bar is one line`, review.oneLine, `spare ${review.spare}px`);
    check(`0 · ${w}px: the app name is ${w >= 1280 ? 'shown' : 'hidden'}`, review.title === (w >= 1280));
    if (w === 1024) {
      // the widest case: every box reviewed + the "Not saved" warning
      await page.evaluate(() => {
        const box = document.querySelector('header [title^="Reviewed boxes"]');
        box.querySelector('span span').textContent = '2424';
        box.insertAdjacentHTML('beforeend', '<span class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset">Not saved</span>');
      });
      const worst = await topBar(page);
      check('0 · 1024px review, widest case (2424 reviewed + NOT SAVED): one line', worst.oneLine, `spare ${worst.spare}px`);
      await shot(page, '0_1024_review');
      await page.getByRole('button', { name: /practice/i }).first().click();
      await page.waitForTimeout(2200);
      check('0 · 1024px practice mode: one line', (await topBar(page)).oneLine);
      await page.getByRole('button', { name: /practice/i }).first().click();
      await page.waitForTimeout(1500);
      await page.getByRole('button', { name: 'Evaluate', exact: true }).click();
      await page.waitForTimeout(1500);
      check('0 · 1024px evaluate mode: one line', (await topBar(page)).oneLine);
      await page.getByRole('button', { name: 'Explore', exact: true }).click();
      await page.waitForTimeout(1500);
      check('0 · 1024px explore mode: one line', (await topBar(page)).oneLine);
      await page.getByRole('button', { name: /coco/i }).first().click();
      await page.waitForTimeout(3000);
      check('0 · 1024px COCO: one line', (await topBar(page)).oneLine);
    }
    check(`0 · ${w}px: no page scroll`, await noPageScroll(page));
    await context.close();
  }
  {
    // below the fixed layout the bar may wrap, so the name is shown again
    const { context, page } = await open(browser, 390, 844);
    check('0 · 390px (stacked layout): the app name is shown', (await topBar(page)).title);
    await context.close();
  }

  // ---------------------------------------------------------------- step B
  {
    const { context, page } = await open(browser, 1536, 700);
    await page.evaluate(() => { document.querySelector('section[aria-label="3D view"] canvas').__mark = 'same'; });
    const sameCanvas = () => page.evaluate(() => document.querySelector('section[aria-label="3D view"] canvas').__mark === 'same');

    // nothing selected: no way in
    check('B · no box selected: no "Edit box" button', (await page.getByRole('button', { name: /Edit box/ }).count()) === 0);
    await page.keyboard.press('e');
    await page.waitForTimeout(400);
    check('B · no box selected: E does not open the editor', !(await editorOpen(page)));

    await selectBox(page, 9, '527702');
    check('B · before editing: the class chips and the distance slider are in the filter bar', (await chipsInBar(page)) === true && (await page.locator('main').evaluate((m) => m.parentElement.children[1].querySelectorAll('input[type="range"]').length)) === 1);
    const before = { list: await rectOf(page, SEL.list), view3d: await rectOf(page, SEL.view3d), details: await rectOf(page, SEL.details), camera: await rectOf(page, SEL.camera) };
    const callsBefore = await drawCalls(page);
    const button = page.getByRole('button', { name: /Edit box/ });
    check('B · a selected box shows the "Edit box" button in the review panel', (await button.count()) === 1);
    // Only the status row the button was added to (the class names further down are truncated by design).
    const row = await page.evaluate(() => {
      const button = [...document.querySelectorAll('section[aria-label="Details"] button')].find((b) => /Edit box/.test(b.textContent));
      const line = button.parentElement.parentElement;
      const [left, right] = [...line.children].map((c) => c.getBoundingClientRect());
      const panel = document.querySelector('section[aria-label="Details"]').getBoundingClientRect();
      return { overlap: left.right > right.left + 0.5, overflow: line.scrollWidth > line.clientWidth + 1, inside: right.right <= panel.right && left.left >= panel.left, oneLine: line.getBoundingClientRect().height <= 24 };
    });
    check('B · the status row holds the button on one line: nothing overlaps, nothing is cut', !row.overlap && !row.overflow && row.inside && row.oneLine, JSON.stringify(row));
    await shot(page, 'b1_review_with_button');

    // ---- enter with the button: focus view
    await button.click();
    await page.waitForTimeout(1200);
    check('B · clicking "Edit box" opens the editor', await editorOpen(page));
    const focus = await rectOf(page, SEL.editor);
    check('B · focus view: the editor covers the list and the 3D view', focus && focus.x === before.list.x && focus.y === before.list.y && focus.w === before.view3d.x + before.view3d.w - before.list.x && focus.h === before.list.h, JSON.stringify(focus));
    check('B · focus view: the 3D cell underneath has not changed size', JSON.stringify(await rectOf(page, SEL.view3d)) === JSON.stringify(before.view3d));
    check('B · focus view: the camera cell and the panel are where they were', JSON.stringify(await rectOf(page, SEL.camera)) === JSON.stringify(before.camera) && JSON.stringify(await rectOf(page, SEL.details)) === JSON.stringify(before.details));
    check('B · the 3D canvas is the same canvas', await sameCanvas());
    check('B · while the editor is open the list under it is not drawn (no rows), and the covered 3D cell is not painted', (await page.locator(`${SEL.list} li`).count()) === 0 && (await page.evaluate(() => getComputedStyle(document.querySelector('section[aria-label="3D view"]')).visibility)) === 'hidden');
    check('B · the 3D name tag of the selected box does not show through the editor', await page.evaluate(() => {
      const editor = document.querySelector('section[aria-label="Top view"]').getBoundingClientRect();
      const x = editor.left + editor.width * 0.75;
      // every point of a 12 × 8 grid over the right half must hit the editor, not something of the 3D cell
      for (let i = 0; i < 12; i += 1) for (let j = 0; j < 8; j += 1) {
        const el = document.elementFromPoint(editor.left + editor.width * (0.5 + i / 24), editor.top + editor.height * ((j + 0.5) / 8));
        if (!el || !el.closest('section[aria-label="Top view"]')) return false;
      }
      return x > 0;
    }));

    // what is drawn
    const drawn = await page.evaluate(() => {
      const root = document.querySelector('section[aria-label="Top view"]');
      const svg = root.querySelector('svg');
      const canvas = root.querySelector('canvas');
      const box = svg.querySelector('[data-part="box"]');
      const pixels = (() => {
        const c = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let blue = 0, yellow = 0;
        for (let i = 0; i < c.length; i += 4) {
          if (c[i + 3] === 0) continue;
          if (c[i] > 200 && c[i + 1] > 180 && c[i + 2] < 120) yellow += 1; else blue += 1;
        }
        return { blue, yellow };
      })();
      return {
        others: svg.querySelectorAll('g[pointer-events="none"] polygon').length,
        box: !!box,
        handles: [...svg.querySelectorAll('[data-handle]')].map((h) => h.getAttribute('data-handle')).sort().join(','),
        front: !!svg.querySelector('[data-part="front"]'),
        label: !!svg.querySelector('[data-part="label"]'),
        car: !!svg.querySelector('[data-part="car"]'),
        boxInside: (() => { const b = box.getBoundingClientRect(); const r = root.getBoundingClientRect(); return b.left > r.left && b.right < r.right && b.top > r.top && b.bottom < r.bottom; })(),
        boxLongSide: Math.round(Math.max(box.getBoundingClientRect().width, box.getBoundingClientRect().height)),
        pixels,
      };
    });
    check('B · the box being edited is drawn, with its front edge', drawn.box && drawn.front);
    check('B · the other 71 boxes of the frame are drawn as outlines', drawn.others === 71, `${drawn.others}`);
    check('B · ten handles: 4 corners, 4 sides, the rotate knob, and the box itself to move', drawn.handles === 'back,back-left,back-right,front,front-left,front-right,left,move,right,rotate', drawn.handles);
    check('B · the box is fully inside the view and large enough to grab (longer side ≥ 100 px)', drawn.boxInside && drawn.boxLongSide >= 100, `${drawn.boxLongSide}px`);
    check('B · LiDAR points are painted, and some are inside the box (yellow)', drawn.pixels.blue > 200 && drawn.pixels.yellow > 0, JSON.stringify(drawn.pixels));
    check('B · no dashed label outline while the box is not edited', !drawn.label);
    check('B · the car marker is drawn', drawn.car);

    // the bar and the panel
    const barText = await page.evaluate(() => document.querySelector('main').parentElement.children[1].innerText.replace(/\s+/g, ' '));
    check('B · the edit bar names the box and the frame', /EDIT BOX/i.test(barText) && /car 527702/.test(barText) && /frame 9/.test(barText), barText);
    check('B · Undo, Redo and Revert are disabled (nothing was changed)', await page.evaluate(() => ['Undo', 'Redo', 'Revert to label'].every((n) => document.querySelector(`button[aria-label="${n}"]`).disabled)));
    check('B · the class chips and the distance slider are not shown while editing', (await chipsInBar(page)) === false && (await page.locator('main').evaluate((m) => m.parentElement.children[1].querySelectorAll('input[type="range"]').length)) === 0);
    const panel = await page.locator(SEL.details).innerText();
    check('B · the panel shows the five numbers of the box', (await field(page, 'length')) === '4.27' && (await field(page, 'width')) === '1.77' && (await field(page, 'height')) === '1.64' && (await field(page, 'heading')) === '171.5' && (await field(page, 'lift')) === '0.00',
      [await field(page, 'length'), await field(page, 'width'), await field(page, 'height'), await field(page, 'heading'), await field(page, 'lift')].join(' / '));
    check('B · the panel names the two point counts differently', /153 pts in the label/.test(panel.replace(/\s+/g, ' ')) && /In view \d+ pts inside the box/.test(panel.replace(/\s+/g, ' ')), panel.replace(/\s+/g, ' ').slice(0, 120));
    check('B · "Changed from the label: nothing"', /Changed from the label: nothing/.test(panel.replace(/\s+/g, ' ')));
    check('B · the panel says an edit does not set a verdict', /Not reviewed yet/.test(panel));
    check('B · the wording never says correct / fixed / ground truth', !/correct|fixed|ground truth/i.test(panel + barText));
    for (const [name, selector] of [['bar', 'main'], ['panel', SEL.details], ['editor', SEL.editor]]) {
      const bad = name === 'bar' ? await page.evaluate(() => { const bar = document.querySelector('main').parentElement.children[1].firstElementChild; return bar.scrollWidth > bar.clientWidth + 1 ? ['bar overflows'] : []; }) : await clipped(page, selector);
      check(`B · focus view 1536×700: nothing cut in the ${name}`, bad.length === 0, bad.join('; '));
    }
    check('B · the five numbers and the "Changed" line are visible without scrolling', await page.evaluate(() => {
      const panel = document.querySelector('section[aria-label="Details"]').getBoundingClientRect();
      return [...document.querySelectorAll('section[aria-label="Details"] input[data-field], section[aria-label="Details"] [data-part="change"]')].every((el) => el.getBoundingClientRect().bottom <= panel.bottom);
    }));
    check('B · focus view: no page scroll', await noPageScroll(page));
    await shot(page, 'b2_focus');

    // ---- V: split view
    await page.keyboard.press('v');
    await page.waitForTimeout(1500);
    const split = { editor: await rectOf(page, SEL.editor), view3d: await rectOf(page, SEL.view3d) };
    check('B · V: the 3D view is next to the top view, both the same width', Math.abs(split.editor.w - split.view3d.w) <= 1 && split.view3d.x > split.editor.x + split.editor.w - 1, JSON.stringify(split));
    check('B · split view: the 3D view is visible (not covered)', await page.evaluate(() => {
      const r = document.querySelector('section[aria-label="3D view"]').getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!el && !!el.closest('section[aria-label="3D view"]');
    }));
    check('B · split view: the 3D canvas is still the same canvas, resized', (await sameCanvas()) && (await page.evaluate(() => { const c = document.querySelector('section[aria-label="3D view"] canvas').getBoundingClientRect(); const s = document.querySelector('section[aria-label="3D view"]').getBoundingClientRect(); return Math.abs(c.width - s.width) <= 2; })));
    check('B · split view: the "3D view" button is pressed', (await page.locator('button[aria-label="3D view next to the top view"]').getAttribute('aria-pressed')) === 'true');
    check('B · split view: the box is still inside the top view', await page.evaluate(() => { const root = document.querySelector('section[aria-label="Top view"]').getBoundingClientRect(); const b = document.querySelector('section[aria-label="Top view"] [data-part="box"]').getBoundingClientRect(); return b.left > root.left && b.right < root.right && b.top > root.top && b.bottom < root.bottom; }));
    check('B · split view: no page scroll, nothing cut in the editor', (await noPageScroll(page)) && (await clipped(page, SEL.editor)).length === 0, (await clipped(page, SEL.editor)).join('; '));
    await shot(page, 'b3_split');

    // ---- look around: everything that can be pressed while editing
    for (const cam of ['CAM_FRONT', 'CAM_BACK_LEFT']) {
      await page.locator(`section[aria-label="Camera thumbnails"] button[aria-label^="${cam}"]`).first().click();
      await page.waitForTimeout(400);
    }
    check('B · clicking camera thumbnails keeps the editor open on the same box', (await editorOpen(page)) && /car 527702/.test(await page.evaluate(() => document.querySelector('main').parentElement.children[1].innerText)));
    await page.keyboard.press(']');
    await page.waitForTimeout(300);
    await page.keyboard.press('z');
    await page.waitForTimeout(300);
    check('B · ] and Z still work while editing (camera, photo zoom)', await editorOpen(page));
    await page.keyboard.press('a');
    await page.keyboard.press('r');
    await page.keyboard.press('j');
    await page.waitForTimeout(400);
    const reviewed = await page.evaluate(() => JSON.parse(localStorage.getItem('ai-detection-viewer.review') || '{"state":{"reviews":{"nuscenes":{}}}}').state.reviews.nuscenes);
    check('B · A / R / J do nothing while editing (no verdict written, same box)', Object.keys(reviewed).length === 0 && /car 527702/.test(await page.evaluate(() => document.querySelector('main').parentElement.children[1].innerText)));

    // another frame: the same object there
    await page.locator(`${SEL.frames} button[aria-label^="Frame 10"]`).first().click();
    await page.waitForTimeout(1200);
    check('B · another frame: the editor stays open on the same object, in that frame', (await editorOpen(page)) && /frame 10/.test(await page.evaluate(() => document.querySelector('main').parentElement.children[1].innerText)));
    await page.locator(`${SEL.frames} button[aria-label^="Frame 9"]`).first().click();
    await page.waitForTimeout(1200);

    // another box, by clicking the photo's own box list is hidden: use the 3D view (split)
    const picked = await page.evaluate(async () => {
      const r = document.querySelector('section[aria-label="3D view"]').getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    let other = null;
    for (let i = 1; i < 12 && !other; i += 1) {
      for (let j = 2; j < 8 && !other; j += 1) {
        await page.mouse.click(picked.x + (picked.w * i) / 12, picked.y + (picked.h * j) / 9);
        await page.waitForTimeout(120);
        const text = await page.evaluate(() => document.querySelector('main').parentElement.children[1].innerText.replace(/\s+/g, ' '));
        if (!/527702/.test(text) && !/no box selected/.test(text)) other = text;
      }
    }
    check('B · clicking another box in the 3D view makes it the box being edited', !!other, other || 'no other box hit');
    // empty space: no selection → the editor says so
    await page.mouse.click(picked.x + picked.w - 8, picked.y + 40);
    await page.waitForTimeout(400);
    const none = await page.evaluate(() => document.querySelector('main').parentElement.children[1].innerText.replace(/\s+/g, ' '));
    if (/no box selected/.test(none)) {
      check('B · nothing selected while editing: the bar and the top view say so', /No box is selected/.test(await page.locator(SEL.editor).innerText()));
      await shot(page, 'b4_no_selection');
    } else {
      check('B · nothing selected while editing: the bar and the top view say so', false, `could not deselect: ${none}`);
    }

    // ---- leave
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
    check('B · Esc closes the editor', !(await editorOpen(page)));
    check('B · after closing: list, 3D view and panel are exactly where they were', JSON.stringify(await rectOf(page, SEL.list)) === JSON.stringify(before.list) && JSON.stringify(await rectOf(page, SEL.view3d)) === JSON.stringify(before.view3d) && JSON.stringify(await rectOf(page, SEL.details)) === JSON.stringify(before.details));
    check('B · after closing: still the same 3D canvas', await sameCanvas());
    check('B · after closing: the list is back with its 72 rows and the 3D cell is painted again', (await page.locator(`${SEL.list} li`).count()) === 72 && (await page.evaluate(() => getComputedStyle(document.querySelector('section[aria-label="3D view"]')).visibility)) === 'visible');
    check('B · after closing: the class chips are back', (await chipsInBar(page)) === true);
    check('B · the 3D floor cost is unchanged by all this (draw calls on this frame)', (await drawCalls(page)) === callsBefore, `${await drawCalls(page)} vs ${callsBefore}`);

    // the view is remembered: the next E opens in split view
    await selectBox(page, 9, '527702');
    await page.keyboard.press('e');
    await page.waitForTimeout(1000);
    const again = { editor: await rectOf(page, SEL.editor), view3d: await rectOf(page, SEL.view3d) };
    check('B · the view is remembered: E opens in split view again', Math.abs(again.editor.w - again.view3d.w) <= 1);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.waitForTimeout(600);
    check('B · the Done button closes the editor', !(await editorOpen(page)));

    // ---- blocked: playing, another mode
    await page.getByRole('button', { name: /^Play/ }).first().click({ force: true });
    await page.waitForTimeout(700);
    await page.keyboard.press('e');
    await page.waitForTimeout(400);
    check('B · while the sequence plays, E does not open the editor', !(await editorOpen(page)));
    await page.getByRole('button', { name: /^Pause/ }).first().click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(500);
    await selectBox(page, 9, '527702');
    await page.keyboard.press('e');
    await page.waitForTimeout(900);
    check('B · (paused again) E opens the editor', await editorOpen(page));
    await page.getByRole('button', { name: 'Evaluate', exact: true }).click();
    await page.waitForTimeout(1500);
    check('B · switching to Evaluate closes the editor', !(await editorOpen(page)));
    await page.keyboard.press('e');
    await page.waitForTimeout(400);
    check('B · E does nothing in Evaluate mode', !(await editorOpen(page)));
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.waitForTimeout(1200);
    check('B · back in Review the editor does not reopen by itself', !(await editorOpen(page)));
    check('B · the 3D canvas survived all of it', await sameCanvas());
    check('B · no page errors', page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  // ---- the other window sizes, both views
  for (const [w, h] of [[1440, 900], [1280, 720], [1024, 768]]) {
    const { context, page } = await open(browser, w, h);
    await selectBox(page, 9, '527702');
    await page.keyboard.press('e');
    await page.waitForTimeout(1200);
    for (const viewName of ['focus', 'split']) {
      if (viewName === 'split') { await page.keyboard.press('v'); await page.waitForTimeout(1500); }
      const tag = `B · ${w}×${h} ${viewName}`;
      const bar = await page.evaluate(() => { const b = document.querySelector('main').parentElement.children[1].firstElementChild; const r = b.getBoundingClientRect(); let bottom = 0; for (const el of b.querySelectorAll('*')) { const x = el.getBoundingClientRect(); if (x.width > 0) bottom = Math.max(bottom, x.bottom); } return { overflow: b.scrollWidth - b.clientWidth, oneLine: bottom <= r.bottom + 0.5 }; });
      check(`${tag}: the edit bar is one line and not cut`, bar.overflow <= 1 && bar.oneLine, JSON.stringify(bar));
      check(`${tag}: the top bar is one line`, (await topBar(page)).oneLine);
      const badPanel = await clipped(page, SEL.details);
      check(`${tag}: nothing cut in the panel`, badPanel.length === 0, badPanel.join('; '));
      const badEditor = await clipped(page, SEL.editor);
      check(`${tag}: nothing cut in the top view`, badEditor.length === 0, badEditor.join('; '));
      check(`${tag}: the legend and the scale bar do not overlap`, await page.evaluate(() => { const a = document.querySelector('[data-part="legend"]').getBoundingClientRect(); const b = document.querySelector('[data-part="scale"]').getBoundingClientRect(); return a.right <= b.left || a.bottom <= b.top; }));
      check(`${tag}: numbers and "Changed" line visible without scrolling`, await page.evaluate(() => { const panel = document.querySelector('section[aria-label="Details"]').getBoundingClientRect(); return [...document.querySelectorAll('section[aria-label="Details"] input[data-field], section[aria-label="Details"] [data-part="change"]')].every((el) => el.getBoundingClientRect().bottom <= panel.bottom); }));
      check(`${tag}: the box is inside the view, longer side ≥ 100 px`, await page.evaluate(() => { const root = document.querySelector('section[aria-label="Top view"]').getBoundingClientRect(); const b = document.querySelector('section[aria-label="Top view"] [data-part="box"]').getBoundingClientRect(); return b.left > root.left && b.right < root.right && b.top > root.top && b.bottom < root.bottom && Math.max(b.width, b.height) >= 100; }));
      check(`${tag}: no page scroll`, await noPageScroll(page));
      const e = await rectOf(page, SEL.editor);
      console.log(`      ${w}×${h} ${viewName}: top view ${e.w}×${e.h}`);
      await shot(page, `b5_${w}x${h}_${viewName}`);
    }
    check(`B · ${w}×${h}: no page errors`, page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }

  // ---- the frame with the most boxes, and the entrance animation
  {
    const { context, page } = await open(browser, 1536, 700, { motion: true });
    // scene-0061, frame 20 (156 boxes)
    await page.locator(`${SEL.frames} button`, { hasText: /scene-/ }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole('option', { name: /scene-0061/ }).first().click().catch(async () => { await page.getByText('scene-0061').first().click(); });
    await page.waitForTimeout(4000);
    await page.locator(`${SEL.frames} button[aria-label^="Frame 20"]`).first().click();
    await page.waitForTimeout(1500);
    const rows = await page.locator(`${SEL.list} li`).count();
    check('B · scene-0061 frame 20 is open (156 boxes)', rows === 156, `${rows}`);
    await page.locator(`${SEL.list} li`).nth(3).click();
    await page.waitForTimeout(500);
    // Time is taken INSIDE the page (key press -> animationend), not from the test runner.
    await page.evaluate(() => {
      window.__grow = {};
      window.addEventListener('keydown', () => { window.__grow.key = performance.now(); }, { capture: true, once: true });
      document.addEventListener('animationend', (e) => { if (e.animationName === 'bev-grow') window.__grow.end = { at: performance.now(), elapsed: e.elapsedTime }; }, { once: true });
    });
    // Where the row is, read BEFORE opening: the list is not drawn while the editor is open.
    const row = await page.evaluate(() => { const c = document.querySelector('section[aria-label="Objects"]').getBoundingClientRect(); const r = document.querySelector('section[aria-label="Objects"] li[data-selected="true"]').getBoundingClientRect(); return `${Math.round(r.left + r.width / 2 - c.left)}px ${Math.round(r.top + r.height / 2 - c.top)}px`; });
    await page.keyboard.press('e');
    // during the entrance: the editor is scaled down and growing
    await page.waitForTimeout(90);
    const during = await page.evaluate(() => { const el = document.querySelector('section[aria-label="Top view"] > div'); if (!el) return null; const m = new DOMMatrix(getComputedStyle(el).transform); return { scale: m.a, origin: getComputedStyle(el).transformOrigin, animation: getComputedStyle(el).animationName }; });
    check('B · the editor grows in (animation "bev-grow", scale between 0 and 1 shortly after the key)', during && during.animation === 'bev-grow' && during.scale > 0.02 && during.scale < 1, JSON.stringify(during));
    check('B · it grows out of the list row of the box', during && during.origin === row, `${during && during.origin} vs row ${row}`);
    await page.waitForFunction(() => window.__grow.end !== undefined, null, { timeout: 5000 });
    const grow = await page.evaluate(() => ({ elapsed: window.__grow.end.elapsed, wall: Math.round(window.__grow.end.at - window.__grow.key) }));
    check('B · the entrance lasts 0.32 s and then the editor is at full size', Math.abs(grow.elapsed - 0.32) < 0.02 && (await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('section[aria-label="Top view"] > div')).transform).a === 1)), `animation ${grow.elapsed}s`);
    console.log(`      key press -> end of the entrance, measured in the page (156 boxes, software GL): ${grow.wall} ms`);
    const n = await page.evaluate(() => document.querySelectorAll('section[aria-label="Top view"] g[pointer-events="none"] polygon').length);
    check('B · 155 other boxes are drawn on the largest frame', n === 155, `${n}`);
    const small = await page.evaluate(() => { const b = document.querySelector('section[aria-label="Top view"] [data-part="box"]').getBoundingClientRect(); return Math.round(Math.max(b.width, b.height)); });
    check('B · a small box (a pedestrian, 0.82 m) is shown large enough to grab (longer side ≥ 80 px)', small >= 80, `${small}px`);
    await shot(page, 'b6_largest_frame');
    check('B · largest frame: no page errors', page.__errors.length === 0, page.__errors.join(' | '));
    await context.close();
  }
  {
    // reduced motion: no animation at all
    const { context, page } = await open(browser, 1536, 700);
    await selectBox(page, 9, '527702');
    await page.keyboard.press('e');
    await page.waitForTimeout(60);
    const now = await page.evaluate(() => { const el = document.querySelector('section[aria-label="Top view"] > div'); return el ? { animation: getComputedStyle(el).animationName, scale: new DOMMatrix(getComputedStyle(el).transform).a } : null; });
    check('B · with "reduce motion" the editor appears at once (no animation)', now && now.animation === 'none' && now.scale === 1, JSON.stringify(now));
    await context.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nb: ${results.length - failed} / ${results.length} passed${failed ? `, ${failed} FAILED` : ''}`);
  fs.writeFileSync(path.join(OUT, 'b.result.json'), JSON.stringify(results, null, 1));
})();
