# Edge Case Log F#6 — Six Cameras (F6-A … F6-D)

> Cases found during the F6 session (2026-11-26) by **driving the real app** with Playwright
> (Chromium, SwiftShader WebGL) and by unit tests. See `post-mvp-checklist.md` → F6,
> `docs/plan-feature/F6_six_cameras.md` (design) and `docs/plan-feature/assets/F6/`
> (mockups, per-step captures, edge captures).

## Context

- Affected modules: `lib/cameras/*` (new), `components/camera/*` (new), `lib/nuscenes/{parser,types}`,
  `lib/types`, `lib/evaluation/*`, `lib/review/{queue,shortcuts}`, `scripts/{prep,predict}_nuscenes.py`,
  `nuscenes.json` (format 1.2) + 50 photos, `predictions.json` (format @2), `app/page.tsx`,
  `WorkspaceShell`, `Viewer2D`, `ObjectList`, `EvidenceStrip`, `QueueBar`, `EvaluationPanel`,
  `SelectedResult`, `ResultList`, `BoxColorLegend`.
- Cases 1–2 come from the edge-case review run after F6-C on **conditions no step check had
  exercised** (45 checks: a verdict that moves the selected row, mode ↔ mode state, playback with
  Follow across a camera boundary, frames with different numbers of cameras, nine window sizes,
  resizing, keyboard focus and held keys, records stored before F6, two tabs, a photo that arrives
  late). Cases 3–6 were designed for and verified while building.

---

## Case 1 — Under "Unsure first", a verdict sent the selected row far below the visible list (introduced by F6)

**Discovery (edge review).** Mark three boxes unsure, order the list "Unsure first", select the top
one, press R (reject). Reject keeps the selection (the reviewer still has to give a reason) — but the
box was no longer unsure, so its row left the top group and landed at its dataset position, **about
900 px below the bottom of the visible list** (row top at 1497 px, list visible from 153 to 599 px).
The panel asked for a reason for a box whose row was nowhere on screen.

**Root cause.** The list scrolls the selected row into view when the *selection* or the *ordering's
name* changes (`useScrollSelectedIntoView(selectedId, orderKey)`). Here neither changed: the same box
stayed selected under the same ordering, and only its position moved. Before F6 no ordering depended
on the verdicts, so a verdict could not move a row. The same class of problem as Edge_F#5 Case 3
(the score slider moving a result row).

**Resolution.** `ObjectList` adds the selected row's **index** to the hook's order key
(`` `${orderKey}:${selectedIndex}` ``), as `ResultList` already did in F5.

**Verified.** Reject the top unsure box → the row is inside the list's visible area; the reason keys
work; switching the ordering keeps it visible.

**Takeaway.** "Keep the selected row visible" must be keyed on where the row *is*, not on the events
that used to be the only way to move it. Any new ordering that reads live state re-opens this.

---

## Case 2 — Frames with different numbers of cameras made the panes jump (introduced by F6)

**Discovery (edge review, with a substituted data file).** Remove one camera from one frame and all
but one from another. Stepping through the frames, the details panel moved by **8 px** on the
five-camera frame (five thumbnails are each wider, and the row's height follows its width) and by
**43 px** on the one-camera frame (the row disappeared). F3's rule is that panes keep their place.

**Root cause.** The thumbnail row was a flex row of however many cameras the *current frame* has,
and was hidden when that was one.

**Resolution.** The row is a grid with a fixed number of cells: the largest camera count of any frame
of the dataset (`cameraSlots`, page). A frame with fewer cameras leaves cells empty; the row is shown
whenever the dataset has more than one camera, also on a frame that happens to have one. COCO and
pre-F6 sample files have one camera everywhere → no row, exactly as before.

**Verified.** Details panel at y 368, height 232 on the six-, five- and one-camera frame; `]` does
nothing on the one-camera frame; evaluate mode scores the 54 photos that exist.

**Not in the shipped sample** (every frame has six cameras). Fixed because a sensor dropout is an
ordinary thing in driving data and the fix is a layout rule, not a special case.

---

## Case 3 — A prediction selection must not survive a camera switch (designed for, verified)

A false alarm is selected by its prediction id through the one `selectedObjectId` (Rule #2). F5 dropped
such a selection when its result left the screen (frame change, mode change, slider). F6 adds a
fourth way: **another camera's photo is shown.** The id now carries the camera
(`pred:<frame>:<camera>:<index>`), so it cannot name another photo's prediction, and the existing
page effect — now looking at the evaluation of the photo on screen — drops it.

A *label* selection is kept across a camera switch: it is an object, and the panel then says where it
is ("not in the CAM_BACK photo — other cameras: F missed, FR found").

Also verified: selecting a false alarm does **not** switch the camera (`pickCamera` finds no view
with that id and keeps the current one); playback with a false alarm selected drops the selection and
keeps the camera.

---

## Case 4 — "The photo was not run" vs "the photo was run and nothing was found" (designed for, verified)

F5 kept these apart per frame (Edge_F#5 Case 6). With six cameras the unit is the **photo**:

- a frame entry that lacks a camera → that photo is not evaluated: its thumbnail shows "–", its list
  says "No predictions for this photo — not evaluated.", its labels are **not** misses, and the panel
  says how many photos were left out;
- an empty list for a camera → the model looked and found nothing: every scored label there is missed.

Verified with the pre-F6 predictions file (format @1, front camera only) substituted: Precision 88% /
Recall 52% as in F5, frame 6 coloured 12 / 10 / 39 as in F5, 50 photos reported as left out, and no
"0 found" anywhere for the photos the model never saw. Per-object outcomes then come from the one
photo that was run.

---

## Case 5 — The first camera entry of a frame is unusable (designed for, unit-tested)

`Frame`'s top-level image fields are "the default camera", and the invariant is that they ARE
`cameras[0]` (the same array). If the file's first camera entry is malformed, the parser does not
keep the top-level (CAM_FRONT) fields beside a `cameras` list that starts with another camera — the
next valid camera becomes the default view and the top-level fields follow it. If no entry is usable,
the frame falls back to the top-level camera. A frame is never lost over a bad camera.

---

## Case 6 — The camera choice is made while rendering, not in an effect (designed for)

`useActiveCamera` picks the camera for a new selection during render (React's "adjust state when a
prop changes" pattern). An effect would paint one frame with the old photo and its "Selected box is
outside …" notice before switching. Verified indirectly: no step check ever saw the notice after an
automatic switch, including during playback (checked every 250 ms over 24 samples).

---

## Measured and NOT changed

Production build (`next start`), headless Chromium with software GL — absolute numbers are
pessimistic for the 3D part; read differences.

- **Scoring 60 photos:** `evaluateFrames` 1.1 ms (1.8 ms at min score 0.05, where all 1,597
  predictions take part). F5: 0.2–0.4 ms for 10 photos. Runs on every slider step; not optimised.
  `parseNuScenes` 15 ms with six cameras vs 11 ms without; `pickCamera` + `frameAsCamera` < 0.01 ms.
- **Interaction latency, six cameras vs the same data with one camera** (time until the screen shows
  the change, median): frame switch 506–515 ms vs 553–559 ms; J (next box) 248 ms vs 206–238 ms; Min
  score step 163–185 ms vs 154–171 ms; camera switch 208–216 ms. The six-camera UI adds nothing
  measurable; everything is dominated by the 3D scene being drawn in software (the three.js idle cost
  recorded in Edge_F#4 — still a separate item, the user chose to do it after F6).
- **Loading** (cache on, a fresh window, resource timing from navigation start):

  | Connection | data file | this frame's 6 photos | next frame's 6 | all 60 |
  |---|---|---|---|---|
  | local | 0.27 s | 0.33 s | — | 0.8 s |
  | 100 Mbps | 0.33 s | 0.5 s | 0.8–1.0 s | 1.4–1.6 s |
  | 20 Mbps | 0.65 s | 1.1 s | 2.0–2.3 s | 6.5 s |
  | 9 Mbps | 1.2 s | 2.1–2.2 s | 4.2 s | 10.5–11 s |

  Transferred: photos 8.06 MB in exactly 60 requests (no photo is fetched twice: the large image,
  the thumbnail, the timeline and the preloader share one file), `nuscenes.json` 575 KB compressed,
  `predictions.json` 25 KB.
- **Preload concurrency 2 → 4 was tried and reverted.** At 20 Mbps the next frame's photos arrived at
  3.9 s either way (dev server), and the total moved within run-to-run noise. The connection speed is
  the limit, not the number of parallel requests.
- **Consequence, stated rather than fixed:** playback needs 12 photos per second (6 per half second).
  At 20 Mbps about 10 arrive per second, so pressing Play the moment the page opens shows some
  thumbnails late for the first loop; at 9 Mbps more so. Boxes, the 3D view and the numbers do not
  depend on the photos. F7 (many more frames) has to bound the preload anyway (`PRELOAD_FRAMES_AHEAD`).

## Observed, accepted

- **A box hidden by a filter still moves the camera** when selected from the list. The photo does not
  draw it (it is filtered out) and the verdict is blocked ("Hidden by filters"), but the thumbnails
  mark where it is. Consistent with the list, where hidden rows stay selectable.
- **A manual camera choice lasts until the selection or the frame changes** — also during playback:
  click another thumbnail while a tracked object is selected and the next keyframe brings the photo
  back to the object. By design (design doc, decision 3); a "pin" switch was not needed in testing.
- **The camera is not a filter.** Reset (either mode) does not return to the front camera.
- **A photo that arrives late** (4 s delay injected): the camera switches at once, the boxes are drawn
  on an empty image area, and "Image unavailable" is not shown until the request actually fails.
- **A photo that fails** is not retried by the preloader; the viewer shows "Image unavailable" with
  the boxes, the other five thumbnails are unaffected, and the failure does not follow to another
  camera or frame.
- **Windows shorter than 640 px** (1536×600, 1280×600) scroll 40 px — F3's minimum height, identical
  before F6.
- **Below 1024 px** the layout stacks (F3); the thumbnail row sits right under the photo. No sideways
  scroll at 1023, 820, 600, 390 and 320 px in either mode.
- **Memory held by the 60 preloaded photos was not measured** (the JS heap does not include decoded
  images). 8 MB encoded; revisit with F7's larger set.

## Found during F6, not caused by F6 — fixed afterwards, on the user's request

Both were reported to the user instead of being fixed inside F6 (HANDOFF §6: a problem this feature
did not make is recorded and asked about). The user asked for both; they went into a separate `fix:`
commit on the same branch.

- **At 1024 px the last class chip ("motorcycle") was cut off in the filter bar.** Present in the F5
  captures (`assets/F5/2026-11-25_before/…_1024x768.jpg`). Measured: nuScenes' seven chips need
  649 px, the bar had 558 px (91 px hidden; still 15 px at 1100 px; fits from about 1115 px). F3 made
  the row scroll sideways when it overflows, but nothing on screen said so.
  **Fix:** the one long chip shows its short name (`classLabel`: "static_object.bicycle_rack" →
  "bicycle_rack", full name in the tooltip and as the accessible name; the class itself — filter,
  colour, the rack rule — is unchanged), and chips are 4 px narrower below 1280 px. Overflow 0 px at
  1024 / 1100 / 1279 / 1280 / 1536 in review, practice and evaluate; bar still 40 px.
- **"5 false alarm"** in the panel's frame row: the label was not pluralised (F5 wrote
  `OUTCOME_LABEL[kind].toLowerCase()`). More visible once a frame's counts became sums over six
  photos. **Fix:** `outcomeCountLabel(kind, count)`; the three tooltips that pluralised inline use
  it too. Checked on all ten frames (5, 8, 12, 5, 5, 5, 13, 21, 17, 16 "false alarms").

Not done on purpose: the object list and the 3D label still show the full class name
("static_object.bicycle_rack", truncated in the list). Only the chip was the reported problem.

## Notes on decisions that did NOT become edge cases

- **Both data scripts are deterministic.** `prep_nuscenes.py` and `predict_nuscenes.py` were each run
  twice: byte-identical files.
- **Nothing that existed before F6 changed in the data.** Every pre-existing field of `nuscenes.json`
  is identical; parsed, the front camera's 200 2D boxes, the 583 3D boxes and the LiDAR points are
  deep-equal to the pre-F6 file's. The front camera's predictions are identical to the F5 file's.
- **The design-time probe and the code agree everywhere.** Per-camera label counts, the "seen by 1 /
  2 / 0 cameras" split, every evaluation number (per camera, per class, per distance band, per frame,
  per object, the rack rule on and off) — computed first by a Python re-implementation, then locked
  in `sample-data.test.ts` files. This time the probe was validated *before* its numbers were quoted,
  by reproducing F5's front-camera result (the lesson of Edge_F#5 Case 7).
- **No box in this sample straddles a camera plane** (all eight corners in front or all behind, for
  every camera). The existing rule (such a box has no 2D box in that camera) is unchanged.
- **Step-check scripts failed about a dozen times; every failure was the script's expectation**, not
  the app (a count that did not grow because the box was already reviewed, a locator matching three
  thumbnails once badges had text, upper-cased titles, a slider not moved far enough to change frame
  6's colours, the outcome chips' existing "show only this kind" behaviour).
