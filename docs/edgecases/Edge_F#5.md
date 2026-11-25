# Edge Case Log F#5 — Camera Detection Evaluation (F5-0, F5-A … F5-D)

> Cases found during the F5 session (2026-11-25 → 26) by **driving the real app** with Playwright
> (Chromium, SwiftShader WebGL) and by unit tests. See `post-mvp-checklist.md` → F5,
> `docs/plan-feature/F5_camera_detection_eval.md` (design) and `docs/plan-feature/assets/F5/`
> (mockups + per-step captures).

## Context

- Affected modules: `lib/evaluation/*` (new), `components/evaluation/*` (new), `lib/data/fetch-json.ts`
  (new), `lib/ui/image-overlay.ts` (new), `scripts/predict_nuscenes.py` + `predictions.json` (new),
  `app/page.tsx`, `Header`, `Filters`, `ConfidenceSlider`, `Timeline`, `Viewer2D`,
  `viewer-3d/{Viewer3D,Scene,BBox3D}`, `ObjectList`, `components/workspace` (shared scroll hook).
- Cases 1–4 come from the edge-case review run after F5-D on **conditions no step check had
  exercised** (26 checks: review filters across a mode visit, a slider below the file's minimum,
  Korean input method, a focused slider, a class with no result, a selection hidden by a chip, a row
  moved by the slider, autoplay + Follow with a false alarm selected, reload, rapid dataset
  switching, six window sizes below the supported ones, a missing photo, two tabs). Cases 5–7 were
  found while building.

---

## Case 1 — "Reset" in evaluate mode silently cleared review mode's distance filter (introduced by F5)

**Discovery (edge review).** Review mode, distance slider at 20 m (25 of 61 boxes visible). Switch to
Evaluate, toggle a class chip, press Reset, switch back: the distance slider read "All" and 61 of 61
boxes were visible. The filter the reviewer had set was gone, and nothing on screen had said so.

**Root cause.** Evaluate mode's Reset called the store's `resetFilters()` (classes + threshold +
distance) and then set the score to 0.25. The distance filter is neither shown nor applied in
evaluate mode (design decision 11), but it still lives in the same store — so a button of one mode
reset a control of the other.

**Resolution.** `handleResetEvaluationFilters` puts `maxDistance` back after `resetFilters()`. The
store is unchanged (the design kept `viewer-store` untouched); the rule is in the page: *a Reset
resets what its own bar shows*. Review mode's Reset is unchanged and still clears everything it
shows.

**Verified.** 20 m → Evaluate → class chip → Reset → Review: slider "20m", 25/61 visible.

**Takeaway.** When two modes share one store, every "reset" / "clear" needs a stated scope. Shared
state that one mode hides is the first thing a blanket reset destroys.

---

## Case 2 — The slider could ask for a score the predictions file does not contain (introduced by F5)

**Discovery (edge review).** With "Min score" at 0.00 the panel header read `score ≥ 0.00`, and
every number was identical to 0.05.

**Root cause.** `predict_nuscenes.py` writes predictions down to score 0.05 (`model.minScore` in the
file). Below that there is nothing to bring in, but the UI echoed the slider value as if the
evaluation had used it — a statement about the data that the data cannot back (the same class of
problem as Immutable Rule #6: do not claim what was not measured).

**Resolution.** `EvaluationPanel` compares the slider with `model.minScore`. Below it, the header
reads `score ≥ 0.05 (file minimum)`, the "Found = …" sentence quotes 0.05, and an amber line says
"The predictions file only holds boxes scoring ≥ 0.05. A lower Min score changes nothing." The
slider's range is unchanged (0–1): the control is shared with COCO's confidence filter, and the file
of another model may reach lower.

**Not changed.** The tooltip of the top-bar headline still quotes the slider value; the panel next to
it carries the correction.

**Takeaway.** A threshold control's range and the data's range are two facts. When they differ, show
the one that is in effect.

---

## Case 3 — The selected row left the visible list when the slider changed its outcome (introduced by F5)

**Discovery (edge review).** Select a found person, drag "Min score" to 0.90 and then to 0.05: the
list grows to 63 rows, the person is still selected and still "found", but its row sat **1375 px below
the visible list** — no highlight on screen.

**Root cause.** The list scrolls the selected row into view when the *selection id* changes. Here the
id stayed the same; the row moved, because the slider added 37 false-alarm rows above it (and, at
other values, moves the row to another outcome group).

**Resolution.** `ResultList` passes the selected row's **index** as the scroll hook's order key, so
the hook also runs when the row's position changes. (The object list had the same need for its
"order" dropdown — `orderKey` — which is why the hook already took a second argument.)

**Verified.** Found → missed at 0.90 and back to found at 0.05 (63 rows): the selected row is inside
the list's visible area both times.

---

## Case 4 — At phone width the top bar pushed the whole page sideways (introduced by F5)

**Discovery (edge review, 390×844).** `document.documentElement.scrollWidth` exceeded the viewport by
**126 px** in review mode and 48 px in evaluate mode. Below 1024 px the layout stacks and scrolls
vertically by design (F3); it must not scroll sideways.

**Root cause.** The top bar's left group (title, dataset switch, badge, mode switch, Practice) was a
non-wrapping flex row. Before F5 it fitted 390 px only because the title text wrapped (group
362 px, room 358 px); the 126 px mode switch made it 500 px.

**Confirmed as F5's.** Measured per element at 390 px: without the mode switch the group needs
≈ 358–362 px; COCO (no switch) does not overflow.

**Resolution.** The left group wraps (`flex-wrap`, `gap-y-1.5`). At the supported desktop widths
(≥ 1024 px) the group fits on one line, so nothing wraps there — re-checked at 1024 / 1100 / 1279 /
1280 in review, practice and evaluate (bar height 44 px, one line).

**Verified.** 390 px: overflow 0 px in review, practice, evaluate and COCO.

---

## Case 5 — A prediction selection could outlive its result (designed for, verified)

`selectedObjectId` holds a *prediction* id when a false alarm is selected (Immutable Rule #2: still
one selection field). Such an id means something only while that prediction is a result on screen.
It is dropped by one effect in the page when: the frame changes (also during autoplay), evaluate
mode is left, the slider moves past the prediction's score, or the predictions become unavailable.
A *label* selection is kept across all of these (it is a tracked object id).

**Verified.** Mode switch, timeline click, autoplay with Follow, slider to 0.40 — each cleared a
false-alarm selection and kept a label selection.

**Takeaway.** The prediction id carries its frame (`pred:<frame>:<index>`) so that a stale id can
never point at *another* prediction; the effect then removes the staleness itself.

---

## Case 6 — "The model was not run" vs "the model found nothing" (designed for, verified)

A frame with **no entry** in the predictions file is not evaluated: its badge reads "no preds", the
list and the panel say "not evaluated", the 3D view and the camera image keep their normal colours,
and the frame is left out of the totals (the panel says "9 frames" and "1 frame has no
predictions…"). A frame whose entry is an **empty list** was run: every scored label is missed.
Counting the first like the second would invent 20-odd misses.

Also verified with substituted files: malformed predictions inside a frame are skipped (one
warning) and the frame is still scored; an entry for an unknown frame is ignored; a JSON of another
shape → "Not a predictions file"; truncated JSON → the parse error; HTTP 404 → the status (F5-0); a
file that arrives after the user entered evaluate mode → "Loading predictions…", then the numbers.
In every case review mode works normally.

---

## Case 7 — The probe that produced the design numbers used a different "not scored" rule

The design doc's score-sweep table says 220 and 98 false alarms at min score 0.05 and 0.10. The
implementation gives **243 and 104**. The Python probe dropped a prediction lying on *any* unscored
label; the rule as designed (and implemented) drops only a prediction of the label's **own class**,
like the matching itself. Re-measured independently with the designed rule: 243 / 104. The default
(0.25) and everything above it are unaffected (91 / 83 / 13 / 26). `sample-data.test.ts` locks the
corrected values; the design doc is left as the record of the plan.

**Takeaway.** A probe written before the rules are fixed must be re-run with the final rules before
its numbers are quoted.

---

## Measured and NOT changed

- **Re-scoring on every slider step.** Production build. Scoring all 10 frames takes **0.2–0.4 ms**
  (order + overlay + 3D colours of one frame: 0.06 ms). One slider step costs ≈ 105 ms wall in
  evaluate mode vs ≈ 80 ms for review mode's distance slider, against an idle baseline of ≈ 48 ms
  per two animation frames (software GL, no GPU on this machine). The extra ≈ 25 ms is React
  re-rendering the list, the overlay and the panel plus ≈ 10 ms of style / layout. The baseline is
  the three.js idle cost recorded in Edge_F#4, which is a separate item. No optimisation was made.

## Observed, accepted

- **A selected result hidden by an outcome chip stays selected.** Its row is not listed and its boxes
  are not drawn, but the panel still describes it. Same as review mode, where a filtered-out box
  stays selected and described. J / K then enter the visible list at its first / last row.
- **Windows shorter than ~700 px** (1536×600, 1280×600) scroll 40 px vertically — identically in
  review and evaluate mode. Pre-existing (F3 fixed the layout for the sizes it lists).
- **Outcome chips do not hide 3D boxes** (class chips do). The 3D view answers "where"; hiding by
  outcome there would remove the context that makes a miss readable.
- **The photo fails to load** → "Image unavailable" with the overlay still drawn; numbers unaffected.
- **Two tabs.** Evaluate mode is not persisted; a verdict made in another tab does not disturb it and
  appears when this tab returns to review (F4's cross-tab sync).
- **Korean input method.** J / K / Z work and A / R write nothing in evaluate mode (the F4 resolver
  is reused unchanged).

## Notes on decisions that did NOT become edge cases

- **`predict_nuscenes.py` is deterministic.** Run twice: byte-identical `predictions.json`.
- **The local `tsc` error seen mid-session** was in `.next/dev/types/routes.d.ts`, a file the running
  dev server had generated (an extra `}`), not in source. It was gone later in the session (the dev
  server rewrites that file; exactly when was not tracked). Checking source only:
  `tsc --noEmit | grep -v '^.next/'`. Note that a production build rewrites `next-env.d.ts` to point
  at `.next/types/` instead of `.next/dev/types/`; that generated change is reverted with
  `git checkout` (HANDOFF §8).
- **3D colours were verified from the live scene, not only from captures:** the step script reads the
  wire materials through three's devtools hook and counts colours (frame 6: 12 green, 10 red, 39
  grey = 61 boxes), and checks that the canvas element is the same object before and after.
