# Edge Case Log F#3 — No-scroll Workspace Layout (F3-A / F3-B / F3-C / F3-D)

> All cases were found by **rendering the real app** (Playwright, Chromium with SwiftShader WebGL)
> during the F3 session on 2026-11-25, not by unit tests — F3 is layout and styling, which the
> Testing Policy verifies by capture. See `post-mvp-checklist.md` → F3 and `architecture.md` →
> "Layout (F3 workspace)". Captures: `docs/plan-feature/assets/F3/`.

## Context

- Affected modules: `components/workspace/WorkspaceShell.tsx` (new), `components/workspace/Panel.tsx`
  (new), `app/page.tsx`, `Viewer2D`, `Viewer3D`, `ObjectList`, `Timeline`, `Header`, `Filters`.
- Test suite: 206 → 213 (F3-B `selectClassCounts` +2, F3-C `displayId` +5). Layout itself has no
  unit tests (Testing Policy).

---

## Case 1 — A box with `aspect-ratio` grew to fit a portrait photo (COCO camera cell 400×600)

**Discovery (F3-A, rendering COCO at 1440×900).** The camera cell is given a ratio by the shell
(`style={{ aspectRatio: 4/3 }}` on COCO) and should be 400×300. On COCO frame 1 (a 426×640 portrait
photo) it rendered at **400×600**, pushing the details panel down to a sliver. nuScenes looked fine,
which hid the bug: its photos are 16:9, the same ratio as its cell, so the content never asked for
more height.

**Root cause.** In CSS, `aspect-ratio` sets a *preferred* size. A box's automatic minimum height
(`min-height: auto`) is still its content height, and the content here — an SVG that is
`w-full h-full` with a 426×640 viewBox — asked for 600px at 400px width. The minimum won over the
preferred ratio.

**Resolution.** The camera cell carries `min-h-0 overflow-hidden`. With the automatic minimum
removed, the ratio is binding and the photo is pillar-boxed inside the cell by the SVG's
`preserveAspectRatio="xMidYMid meet"`. Measured after the fix:

| COCO frame | photo | 1440×900 cell / photo | 1280×720 cell / photo |
|---|---|---|---|
| 1 | 426×640 portrait | 400×300 / 200×300 | 360×270 / 180×270 |
| 2 | 640×427 landscape | 400×300 / 400×267 | 360×270 / 360×240 |
| 3 | 640×640 square | 400×300 / 300×300 | 360×270 / 270×270 |

The pillar-box bands still deselect on click (Edge_#9.5 Case B — the handler is on the wrapper).

**Takeaway.** When a layout relies on `aspect-ratio`, test it with content whose own ratio differs
from the box's. A matching ratio (nuScenes) cannot reveal the bug.

---

## Case 2 — Next.js dev indicator overlaps the timeline's Play button (dev server only) — deferred

**Discovery (F3-A, behaviour check).** Playwright could not click "Play": the Next.js dev
indicator (the round "N" button, `<nextjs-portal>`) sits at the bottom-left corner of the viewport,
which is exactly where the new one-row timeline puts its Play button. The click was intercepted.

**Scope.** Development only — the indicator is not rendered by `next build` / production. Real users
of the deployed app never see it. The developer does, while running `npm run dev`.

**Decision (user, 2026-11-25): leave it for now.** The fix would be one line in `next.config.js`
(`devIndicators: false`, or move it with `devIndicators: { position: 'bottom-right' }`). Capture
scripts hide it with an injected style (`nextjs-portal { display: none !important }`) before
clicking.

---

## Case 3 — Taller 3D cell leaves empty space above the nuScenes scene — accepted

**Discovery (mockup, then F3-A).** At 1440×900 the 3D cell is 736×708 (≈1.04:1, taller than the old
4:3). The nuScenes box cloud sits in the middle and roughly the top fifth of the pane is empty.

**Root cause.** The camera's vertical field of view is fixed (`fov: 50`) and the initial camera pose
comes from `frameBoxesForCamera` (`lib/geometry/camera-framing.ts`), which was tuned while the pane
was 4:3. A taller pane with the same vertical FOV shows more sky above the scene.

**Decision (user, 2026-11-25): no change.** On the user's laptop the browser viewport is wide and
short (~1536×700), where the 3D cell is 832×508 (wider than 4:3) and the gap does not appear.
Zooming with the mouse wheel also closes it. `lib/geometry` stays untouched, as the F3 design doc
planned. If it matters later, the option is to adjust only `Viewer3D`'s camera init (e.g. FOV by
aspect), not the pure framing function.

---

## Notes on decisions that did NOT become edge cases

- **`ring-inset` vs `border` for the panel outline (F3-D).** An inset box-shadow is painted under the
  element's content, so the camera photo and the 3D canvas, which fill their panes, covered it — the
  panels looked borderless in places. Switched every pane to a real 1px `border`. It shrinks the inner
  area by 2px (3D canvas 736×708 → 734×706), which is harmless.
- **Canvas resize vs remount.** The shell only changes the cell size; `Viewer3D`'s `key` is
  unchanged, so R3F resizes the existing canvas. Verified by tagging the `<canvas>` element and
  resizing the window five times (1280×720, 1100×700, 1536×864, 900×800, 1440×900): the same element
  survived every resize, including the switch to the narrow stacked layout. GPU memory itself was not
  measured.
- **6-character display ids.** Checked for collisions before choosing the length: the 73 instance
  tokens in the bundled nuScenes sample have 73 distinct 6-character prefixes. A larger dataset could
  collide; the full id stays in the row tooltip and the details panel.
- **Playwright clicks scroll the page on mobile.** At 390×844 the capture log shows `scrollY=474`
  after selecting a list row; that is Playwright scrolling the target into view before clicking, not
  the app. On wide screens the same check stays at `scrollY=0`.
