# Edge Case Log F#7 — Scene exploration

> Cases found while building F7 (2026-11-27): during the per-step checks, during the measurements
> of F7-E, and in the edge-case review that followed (conditions never exercised by the step
> checks). See `post-mvp-checklist.md` → F7, `docs/plan-feature/F7_scene_exploration.md`, and the
> captures in `docs/plan-feature/assets/F7/` (`steps.html`, `2026-11-27_edge/`).

## Context

- Affected modules: `components/dataset/` (new), `components/scenes/` (new),
  `components/explore/` (new), `components/timeline/Timeline.tsx`,
  `components/camera/usePhotoPreload.ts`, `components/review/ExportMenu.tsx`,
  `components/evaluation/` (`SceneScores`, `useSettledValue`), `lib/scenes/`, `lib/search/`,
  `lib/nuscenes/parser.ts`, `app/page.tsx`.
- Everything was run on the **production build** (`npm run build`, `npx next start -p 3100`),
  headless Chromium (Playwright), 1536×700 unless a size is given. Development-server behaviour
  was checked separately (Case 9).
- Method for the edge review: one script, 34 checks (`E1`–`E18`), each a condition the step checks
  had not exercised — an empty scene, a wrong / late / out-of-order file, rapid repeated input,
  another mode's state, a second tab, the Korean keyboard layout, 390 px, 1024×640. It was run
  **before** any fix (7 failures: Cases 1–5 below, plus two wrong expectations in the script) and
  again after (33 / 33; a 34th check was added with the follow-up to Case 2).
- After the last fix every check of the feature was re-run on the final build: F7-B 45, F7-C 32,
  F7-D 28, F7-E 24, edge 34 — 163 in total.

---

## Case 1 — Choosing a scene with no frames trapped the user (fixed)

**Symptom.** A scene whose frames file holds no usable frame (`{"frames": []}`) replaced the scene
on screen. The page fell to the "No frames." state, where the timeline is a placeholder — and the
scene picker lives in the timeline. There was no way back to another scene except a reload.

**Root cause.** `useScenes` swapped in any scene that had finished loading. The workspace needs a
current frame; without one the page renders its placeholder branch, which did not carry the picker.

**Fix.**
- `useScenes`: a scene with zero frames is treated like a scene that failed — the scene on screen
  stays, and `pending.error` says "scene-0757 has no frames." (the picker shows "… failed").
- `page.tsx`: the scene picker is built once and also placed in the timeline slot of the error
  state. So when the scene that should open FIRST fails or is empty (nothing to fall back to),
  another scene can still be chosen. The message adds "Another scene can be opened from the scene
  picker below."

**Verified.** E1: picker present, 41 cells of the previous scene still shown, canvas not re-created,
another scene opens afterwards.

## Case 2 — The export / reset menu counted the scene on screen but acted on every scene (fixed)

**Symptom.** In a scene without any review the menu said "Nothing reviewed yet" and all three items
were disabled — although other scenes had records and the export covers all scenes. And where it
was enabled, "Click again to delete N" named the current scene's N while the reset deletes the
whole scope.

**Root cause.** F7 made the progress in the top bar per scene (`summarizeProgress(frames)`), and the
same number was still passed to `ExportMenu`, whose two actions are not per scene.

**Fix.** The menu receives the number of records in the scope (`Object.keys(reviews).length`), says
"… in all scenes", arms as "Click again to delete all N · in all scenes · no undo", and shows a
caveat when the file cannot cover everything (scenes not loaded yet; practice set = this scene only).

**Verified.** E2 (2 records in scene-0916, menu opened in scene-0103).

**Follow-up, found while writing up the captures.** The longer armed text did not fit the 256 px
menu: "in all scenes · no undo" was cut off after "no un" — the one warning that must be readable.
The first version of E2 only read the text content, which is complete even when the pixels are
clipped. Fix: the reset row wraps (`flex-wrap`), so the warning sits on its own line. E2 gained a
check that no text of the menu reaches past the menu's edge. Everything was re-run on the build
with this fix.

## Case 3 — A points file of another frame was drawn (fixed)

**Symptom.** If the file fetched for a frame's points belonged to a different frame, its points were
drawn under this frame's boxes with no hint.

**Root cause.** `parseNuScenesPoints` validated the file's shape but not which frame it was for. The
points files are self-contained (they carry their own alignment), so nothing else would notice.

**Fix.** `parseNuScenesPoints(raw, expectedToken)`: a file naming another frame is rejected with a
warning, and the 3D tag reads "points unavailable". Measured points of one moment are never shown
for another (Rule #6). Three unit tests.

**Verified.** E6. Related, and already correct before: E5 — eight rapid frame jumps with points
responses delayed 0.2–1.1 s at random; the cloud on screen at the end is the last frame's (6,983
points). Points are stored by frame id and only returned for the frame on screen.

## Case 4 — At 390 px the scrubber's cells were 0 px wide (fixed)

**Symptom.** Far below the supported width the timeline could not be used: the controls block took
the whole row and the 41 cells got no width. Before F7 the thumbnail strip scrolled sideways there.

**Fix.** For the scrubber variant the timeline stacks below `lg`: controls on top, cells under them
at a fixed 80 px height. Unchanged at ≥ 1024 px.

**Verified.** E10: cells 8.7 px wide at 390 px, a click goes to that frame, no sideways page scroll.

## Case 5 — At 390 px Explore pushed the page 196 px sideways (fixed)

**Symptom / cause.** The condition chips and the presets sat in non-wrapping rows; `flex-nowrap`
with sideways scrolling is only right on wide screens. Also the scene list's "1 drive · 3 scenes"
badge was drawn over the number columns.

**Fix.** Both chip groups wrap below `lg`; the list's middle column clips its content.

**Verified.** E10: sideways overflow 0 / 0 / 0 px in review / explore / evaluate at 390 px.

---

## Cases found during the steps

## Case 6 — One slow scene file held up every scene queued behind it (F7-C, fixed)

**Symptom.** With one scene's frames file held back, search covered 3 of 10 scenes and stayed there.

**Root cause.** Scenes were loaded strictly one at a time in the background (`scenesToRequest`).

**Fix.** Two at a time (`SCENE_LOAD_CONCURRENCY = 2`): one stuck file leaves the other slot working.
The active scene is still requested first, regardless of the limit. Tests cover "a scene that hangs
does not hold up the ones behind it".

## Case 7 — Photos fell behind playback (F7-E, fixed at 20 Mbps, a limit remains at 9 Mbps)

**Symptom.** During playback most frames were shown before all six of their photos had arrived:
18–19 of 24 frames at 20 Mbps (up to 0.30 s late), 20 of 24 at 9 Mbps (up to 0.46 s). The point
clouds were never late.

**Root cause.** `usePhotoPreload` waited 300 ms after every change of its list before fetching, so
that the visible frame's own requests go first. Playback changes the list every 500 ms — 200 ms of
fetching per frame.

**Fix.** The delay is skipped when the list's first photo (the current frame's) has already been
requested by the preloader: there is nothing to give way to. Three photos at a time instead of two.

**After** (three runs each): 20 Mbps — 0 late frames, three times out of three. 9 Mbps — 9–12 late
frames, up to 0.35–0.40 s. At 9 Mbps the connection itself is near its limit: playback needs twelve
photos and two points files per second (~600 KB/s of ~1,125 KB/s, plus per-request latency).

**Measurement note.** The first run of this measurement was wrong: the browser keeps only 250
resource-timing entries by default, and one scene has 246 photos — later photos were reported as
"never arrived". `performance.setResourceTimingBufferSize(20000)` before loading fixes that.

## Case 8 — "Deferred" scoring of all scenes blocked every slider step (F7-E, fixed)

**Symptom.** In evaluate mode one step of the score slider cost ~3× what it did before F7 (JS per
step 49 → 145 ms, worst frame while dragging 95 → 156 ms; pre-F7 and F7 builds measured alternately).

**Root cause.** The all-scenes evaluation followed `useDeferredValue(rules)`. React starts the
deferred render right after every urgent one, and a single 70–100 ms computation cannot be
interrupted half-way — so each step paid for it.

**Fix.** `useSettledValue(rules, 250)`: all scenes are re-scored once the slider has rested for
250 ms; while it moves only the scene on screen is scored and the "All scenes" block is dimmed
(`aria-busy`). After: ~1.4–1.5× the pre-F7 step cost (56 → 84 ms and 92 → 131 ms in two alternating
runs), which is the scene being 41 frames instead of 10. One long frame remains after release — the
single all-scenes scoring.

---

## Checked, no change needed

- **E3 catalog failures.** HTTP 500 → the status and Retry; a JSON that is not a catalog → "Not a
  scene catalog"; a catalog with zero scenes → "No frames.". COCO opens from each of them.
- **E4 rapid scene stepping.** Six fast clicks on › land six scenes on (steps count from the scene
  being loaded, not the one still on screen); canvas kept.
- **E7 J pressed three times while the hit's scene is still loading.** Ends on a hit in that scene.
- **E8 modes do not disturb each other.** Review's distance filter survives Explore, Explore's
  Reset and Evaluate. A model box selected in Evaluate does not break Explore or Review.
- **E9 result-list order change** keeps the open frame's row in view.
- **E11 / E12 practice mode or Follow kept on across a scene change.** The new scene's practice set
  opens (92 planted errors in scene-1077); canvas kept.
- **E13 a scene with one frame and no boxes** opens ("Frame 1/1 · 0 detections"), in all three modes.
- **E14 Korean layout** (`ㅓ` on the J key) steps the result list. **E15 two tabs** stay in sync.
- **E17 five conditions at 1024 px**: the bar keeps its 40 px height, nothing overflows.
- **E18 dataset round trip** returns to the scene that was open.

## Case 9 — Development server (React runs effects twice): checked, no change needed

The loaders were written for it (a per-catalog "requested" set; results accepted only while their
catalog is current) but had only been run on the production build. On `next dev`: 10 frames files,
10 predictions files and 4 points files, each requested exactly once; the point cloud is drawn;
scene switch, search (135 hits), all-scenes evaluation and practice mode work. No React warning.

## Found, not caused by F7

- **`THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.`** — one console
  warning on the development server. It comes from inside the three.js / R3F libraries, not from app
  code, and predates F7. Not touched.
- **1024×600 scrolls 40 px vertically.** `WorkspaceShell` has had `lg:min-h-[640px]` since F3; the
  edge script first tested 600 px by mistake. 1024×640 has no overflow.
- **README is out of date beyond the data section** (386 tests, nothing about F3–F6). Only the data
  description, the regeneration commands and the attribution were updated in F7.

## Measured and NOT changed

- **3D idle cost at 156 boxes** (design decision 12: merge the box lines if below 55 fps or above
  150 ms/s of idle JS). Integrated GPU: 60 fps, 159 ms/s (117–180), 158 draw calls. Software GL:
  53 fps, 583 ms/s. By the letter the threshold is exceeded. But absolute numbers on this machine
  drift by several times between days (also recorded in Edge_F#6.5): today the **pre-F7 build**
  measured 57 ms/s on the frame that was recorded as 34 ms/s in F6.5. Measured alternately in one
  session, pre-F7 and F7 are the same on the shared 40-box frame (GPU 57 vs 64 ms/s in review, 60 vs
  60 in evaluate, 42 draw calls and 60 fps both; software 157 vs 184 and 128 vs 110 — no consistent
  direction). **User decision (2026-11-27): do not merge now; record as a follow-up.**
- **Entering Explore takes ~0.7 s** (first render of 404 result rows). Not virtualised.
- **Search cost in the browser**: preset click to next paint 105 ms (label condition), 198 ms for the
  first model condition (evaluates all ten scenes once), 114 ms after that.

## Could not be verified

- **Deployment.** 152 MB of static files have not been deployed to Vercel from this branch. The
  documentation lists no size limit for Git deployments; that is not the same as having tried.
- **What the ~1,380 "no label nearby" false alarms are.** Explore's "Unlabelled?" preset now shows
  them one photo at a time; counting how many are real unlabelled objects is future work
  (design doc §13).
- **The user's own browser and the discrete GPU** were not measured.
