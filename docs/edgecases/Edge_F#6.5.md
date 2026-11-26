# Edge Case Log F#6.5 — three.js idle cost (performance session between F6 and F7)

> Not a feature. One performance problem, measured → cause found → fixed → measured again, in its
> own session (2026-11-26) between F6 and F7. Found in F4 (`Edge_F#4.md`, "Found during F4, not
> caused by F4"), carried through F5 and F6 untouched. See `post-mvp-checklist.md` → F6.5 and
> `docs/plan-feature/assets/F6.5/` (before / after captures).

## Context

- Affected module: `components/viewer-3d/BBox3D.tsx` only (one JSX element, 2 lines + a comment).
- Everything below was measured on the **production build** (`npm run build`, `npx next start -p
  3100`), three.js 0.184.0, R3F 9.6.1, drei 10.7.7, headless Chromium (Playwright 1.59.1),
  1440×900, the page left alone (pointer parked in a corner).
- Machine: i7-13700HX laptop on AC power, Windows power plan "Balanced".
- Two GL back ends, both recorded because they disagree in absolute numbers:
  **software** = SwiftShader (`--use-angle=swiftshader`, what every earlier session used) and
  **hardware** = the integrated GPU through ANGLE/D3D11 (`--use-angle=d3d11`; Chromium picked the
  Intel UHD, not the RTX 4060).

---

## Case 1 — Every 3D box re-evaluated its shader program twice per frame, forever (pre-existing since Step 5)

**Symptom.** With nothing happening, the nuScenes screen used 4–7 times the JS time of the COCO
screen. Frame rate held (~59 fps), so nothing looked wrong: it was CPU (battery, fan), not jank.

**Measurement (before).** JS self time from a CDP CPU profile, per second of wall time, median of
three 5 s windows (range in brackets). "Shader bookkeeping" = self time of three.js
`getParameters` + `getProgramCacheKey`.

| Case | Software GL: JS ms/s | of which shader bookkeeping | Hardware GL: JS ms/s | of which shader bookkeeping | Draw calls / frame |
|---|---|---|---|---|---|
| nuScenes, no selection | 67.7 (57.2–71.7) | 29.5 | 114.3 (105.0–125.0) | 53.6 | 119 |
| nuScenes, one box selected | 81.3 (63.2–84.7) | 37.1 | 116.5 (105.8–134.2) | 56.8 | 119 |
| COCO, no selection | 16.1 (15.8–18.8) | 2.8 | 39.0 (30.1–44.1) | 9.1 | 17 |
| COCO, one box selected | 13.6 (12.6–25.2) | 2.7 | 35.8 (34.4–49.0) | 5.3 | 17 |

Selection makes no difference; the number of boxes does (40 on this nuScenes frame, 5 on COCO).

**Root cause (established as fact, three ways).**

1. *Source.* Each `BBox3D` carried a full-volume pick mesh (line segments are too thin to click)
   made "invisible" with `<meshBasicMaterial side={DoubleSide} transparent opacity={0} />`.
   three.js draws a material that is **transparent AND double-sided** in two passes — back faces,
   then front faces — and sets `material.needsUpdate = true` before each
   (`WebGLRenderer.js`, `renderObject`, r184 lines 2125–2135). `needsUpdate` bumps
   `material.version`, and a changed version makes `setProgram` call `getProgram`, which rebuilds
   the full parameter list and the cache key for that material. The key is the same every time, so
   no shader is recompiled — but the bookkeeping to find that out runs anyway.
2. *Live scene.* Reading `material.version` of every material in the running scene across a 5 s
   window: the 40 pick-mesh materials rose by **1.95 per material per frame** (2 × the 39 of 40
   boxes inside the view); the 40 line materials, the point material and the grid material rose by
   **0**. That is ≈ 78 program look-ups per frame, ≈ 4,600 per second, for meshes that draw nothing.
   The same 78 are also 78 of the frame's 119 draw calls.
3. *Experiment.* Changing only those materials at runtime, in the unmodified build:

| nuScenes, no selection | as it was | one pass (`forceSinglePass`) | not drawn (`visible = false`) |
|---|---|---|---|
| Software GL: JS ms/s | 67.7 | 28.3 | 15.0 |
| Hardware GL: JS ms/s | 114.3 | 58.3 | 38.0 |
| Shader bookkeeping ms/s | 29.5 / 53.6 | 0 / 0 | 0 / 0 |
| Draw calls / frame | 119 | 80 | 41 |

   Bookkeeping drops to zero as soon as the two-pass path is avoided; the rest of the drop is the
   draws themselves.

**Resolution (option A, chosen by the user).** The pick mesh is `visible={false}` and its material
is a plain `<meshBasicMaterial side={DoubleSide} />`. Picking does not need the mesh drawn:
`Raycaster` tests an object's layers and geometry, never `visible`, and `Mesh.raycast` still reads
`material.side` (so clicking from inside a box keeps working — Edge_#5 Case 11).

**Measurement (after), same method.**

| Case | Software GL: JS ms/s | Hardware GL: JS ms/s | Shader bookkeeping | Draw calls / frame |
|---|---|---|---|---|
| nuScenes, no selection | 67.7 → **15.0** (9.8–18.6) | 114.3 → **34.1** (27.6–41.9) | → 0 | 119 → 41 |
| nuScenes, one box selected | 81.3 → **14.2** (10.2–18.0) | 116.5 → **27.3** (27.2–38.3) | → 0 | 119 → 41 |
| COCO, no selection | 16.1 → 9.9 (3.4–9.9) | 39.0 → 24.6 (19.2–27.3) | → 0 | 17 → 7 |
| COCO, one box selected | 13.6 → 10.2 (9.2–17.3) | 35.8 → 16.8 (16.4–20.9) | → 0 | 17 → 7 |

Other counters on the nuScenes frame: main-thread script time (CDP `ScriptDuration`) 81.6 → 23.7
ms/s software, 124.3 → 44.5 hardware; main-thread task time 112.5 → 57.2 and 154.1 → 82.3; GPU
geometries 80 → 41 (the pick boxes are no longer uploaded); shader programs 5 → 3. Frame rate
unchanged (~59 fps). nuScenes idle is now at COCO's old level.

**Verified in the real app (fixed production build).**

- *Pixels.* nuScenes 3D pane, default view and three orbited views: **0 of 521,088 pixels differ**
  from the old drawing style (same page, pick meshes switched between the two styles; capture noise
  0). Old build vs fixed build, separate page loads: 0 pixels.
- *Picking.* A 15 × 9 grid over the 3D pane, before the fix vs after: the hover result (cursor +
  label) and the click result (selected id or none) are identical at all 135 points, on both
  datasets. Clicking from inside a box (Follow, zoom to 0.02 m from its centre, select another row,
  click) selects the box the camera sits in, as before.
- *Regression script, 46 of 46 passed:* the fix itself (40 pick meshes, none drawn, none
  transparent, 41 draw calls); selection → one white wire at the pose the panel shows, pulse within
  0.96–1.04, label pill, empty-space deselect; Follow aims at the selected box without moving the
  camera and keeps tracking across a frame switch; playback glides (96 distinct poses in 96
  animation frames) and pause returns the exact measured pose; the canvas element survives
  selection, Follow, playback, Review ↔ Evaluate, frame switches and five window sizes (one scene,
  one renderer throughout); evaluate mode shows Precision 77% / Recall 66%, 349 of 456, 349 of 531,
  front camera 91/174, 295 of 418, and frame 6 has 28 / 16 / 17 wires in the three outcome colours;
  a 3D click in evaluate mode selects and the photo follows; review A / U / J / K, six thumbnails,
  auto camera; COCO draws, picks, and has no thumbnail row or mode switch; no page scroll at
  1440×900, 1280×720, 1536×700, 1024×768.
- 695 tests, `tsc --noEmit` 0 errors, CI lint 0 errors (19 pre-existing warnings), production build.

**Takeaway.** In three.js "invisible" has two meanings. `opacity: 0` is still *drawn* (and, when
transparent + double-sided, drawn twice with a program re-evaluation each time); `visible: false`
is *not drawn* but still *pickable*. A pick target should be the second kind.

---

## Case 2 — The invisible mesh had also been erasing the floor grid behind boxes (COCO; accepted change)

**Discovery.** The pixel comparison for COCO was not zero: 1.6% of the 3D pane differed in the
default view, 1.8% in one orbited view, 0 in two others.

**Root cause.** An `opacity: 0` fragment changes no colour but still writes **depth**. The pick
boxes are transparent, so they are drawn in the transparent pass together with the drei `<Grid>`
(also transparent), sorted by distance. Where a box was drawn before the grid and stood in front of
it, the grid's fragments failed the depth test: the grid lines behind the box were missing, as a
box-shaped hole. Lines and points are opaque and drawn earlier, so they were never affected. On
nuScenes no box stands in front of the grid in the views tested (0 pixels).

**Resolution.** None needed — it goes away with Case 1's fix: the grid now shows through the boxes.
This is the one visible change of the session. It was shown to the user before the fix (option A
"COCO looks slightly different" vs option B `forceSinglePass`, pixel-identical everywhere but still
drawing 40 invisible boxes, ≈ 2× the remaining cost) and **the user chose A**.

**Takeaway.** A cross-page pixel comparison of COCO is not usable: the estimated point cloud is
scattered with `Math.random` on every load (`lib/geometry/pointcloud-generator.ts`), which alone
made 4.6% of the pane differ. Compare on the **same page**, switching only the thing under test.

---

## Measured and NOT changed

- **The scene still renders every animation frame** (R3F's default `frameloop="always"`): 41 draw
  calls and ≈ 15 ms/s (software) / ≈ 34 ms/s (hardware) of JS at idle on nuScenes. `frameloop=
  "demand"` would stop that, but the selected box's pulse, OrbitControls damping, the playback tween
  and the `<Html>` label all rely on continuous frames; each would need an explicit `invalidate()`.
  Not attempted — it is a behaviour change with its own risks, and the remaining cost is at the
  level COCO always had.
- **`instancedMesh` for the boxes** (an R3F Performance Rule since the MVP) is still not used: 40
  line draws per frame. With the bookkeeping gone the profile shows no single hot spot to justify
  it at this box count. Re-measure with F7's larger frames.

## Could not be measured / not reproduced

- **F4's numbers were not reproduced.** F4 recorded 1.25–1.69 s of JS per 3 s window (≈ 420–560
  ms/s) with ≈ 0.5 s in the program functions. Today the same build path measures 57–72 ms/s
  (software), 6–7 times less; the *share* of the program functions (≈ 44–47%) matches. The reason for
  the absolute difference was not found. A slower CPU state at the time (battery / power plan /
  other load) is a guess, not a finding. F6's note that idle JS was "about 80% of wall time" was not
  reproduced either (≈ 8% script time today).
- **Hardware GL was slower than software GL in JS time** (114 vs 68 ms/s before). Not investigated.
  A guess: with SwiftShader the CPU is kept busy and at a higher clock, so the same JS runs faster.
- **The discrete GPU (RTX 4060)** — headless Chromium chose the integrated one.
- **GPU-process time.** The CPU profile covers the page's main thread only. What 78 fewer draw calls
  save in the GPU process (all of SwiftShader's rasterising in software mode) was not measured.
- **The user's own browser** (a visible window, their display's refresh rate, on battery).
- **The dev server.** Numbers there include React's development overhead and were not taken.

## Notes on decisions that did NOT become edge cases

- **`side={DoubleSide}` stays on a mesh that is never drawn.** It is read by the raycaster, not only
  by the renderer; removing it would bring back Edge_#5 Case 11 (no click from inside a box).
- **`transparent opacity={0}` was removed rather than kept "just in case".** If someone later drops
  `visible={false}`, an opaque white box appears at once — a visible mistake instead of a silent
  return of the cost.
- **Reading the live scene in a production build works.** The `__THREE_DEVTOOLS__` hook (HANDOFF §8,
  until now used on the dev server only) also fires in the production bundle, for the scene and for
  the renderer (`renderer.info`: draw calls, programs, geometries). `scene.__r3f.root.getState()`
  gives the R3F camera and the OrbitControls (`controls.target`).
- **The check scripts did not fail this time** (46 of 46 on the first run).
