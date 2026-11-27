# Edge Case Log F#7.5 — Evaluation you can trust

> Cases found while building F7.5 (2026-11-27): during the per-step checks and in the edge-case
> review that followed (conditions never exercised by the step checks). See
> `post-mvp-checklist.md` → F7.5, `docs/plan-feature/F7.5_trustworthy_evaluation.md`, and the
> captures in `docs/plan-feature/assets/F7.5/` (`steps.html`, `2026-11-27_edge/`).

## Context

- Affected modules: `components/sample-check/` (new), `components/evaluation/` (`EvaluationReport`,
  `DriveTable`, `DayNightByDistance`, `IouChoice`, `EvaluationPanel`, `SceneScores`),
  `components/camera/useActiveCamera.ts`, `components/filters/Filters.tsx`,
  `components/workspace/WorkspaceShell.tsx`, `lib/sampling/` (new), `lib/evaluation/`, `lib/review/types.ts`,
  `app/page.tsx`.
- Everything was run on the **production build** (`npm run build`, `npx next start -p 3100`),
  headless Chromium (Playwright, software GL), 1536×700 unless a size is given.
- Method for the edge review: one script, 48 checks (`E1`–`E16`), each a condition the step checks had
  not exercised — scenes arriving slowly, a scene that fails, a scene without predictions, key presses
  with no pause, the Korean keyboard layout, a lingering focused button, a selection that is not a
  sampled box, shrinking the sample under the current box, a reload, a second tab, another dataset,
  the slider below the file's minimum, the minimum height, 390 px, 300 rows at 1024 px, storage that
  refuses writes, stored data that is stale / broken / from before the feature. It was run **before**
  any fix: 42 / 48. Two real problems (Cases 1–2); the other four failures were follow-on effects of
  Case 1 in the same script (one unseen verdict shifted every later count by one).
- After the fixes every check was re-run on the final build: B 135, C 74, D 51, edge 48, floor cost 5
  — 313 in total.
- The F7 check scripts (163 checks) did not survive the session change, so a regression script was
  written for the F4–F7 flows that share code F7.5 touched (`Filters` slots, `useActiveCamera`,
  `WorkspaceShell`, the review scopes, `handleOpenHit`, the shortcut handler): 30 checks, all passing on
  the final build. Its five failures on the way were all in the script (a stray click that changed the
  mode, the export button's name, row text read without spaces, the `aria-current` marker being on the
  row's button). Narrower than the F7 scripts were.

---

## Case 1 — Two key presses with no pause judged a box nobody had looked at (fixed)

**Symptom.** In the sample check, `A` immediately followed by `R` gave box 1 "real object" and box 2
"model wrong" — and the screen was already on box 3. Box 2 had been "on screen" for a few
milliseconds; its photo had not even been requested.

**Root cause.** A verdict selects the next unjudged box at once. All scenes' boxes are in memory, so
even a box in another scene becomes the current selection within one or two renders (measured: 41 ms
to another scene, 24 ms within a scene). Any key that follows — a double tap, a key typed ahead —
is a valid verdict on the new box. In the label review (F4) the same thing can happen, but there a
stray approval is one of thousands; here each verdict is one of a hundred that an estimate is built
on, and a blind one is invisible afterwards.

**Fix.** `useSampleCheckController`: a verdict is accepted only when the box has been the current one
for at least `MIN_LOOK_MS` = 400 ms (the time it became current is stamped in an effect). Far below
the time it takes to look at a photo, so a deliberate verdict is never held back; stepping (J / K) and
clearing are not delayed.

**Limit.** This is a time, not "the photo has been painted". On a slow connection the photo of the next
box can take longer than 400 ms to arrive, and a verdict in that window would still be blind. The
viewer does not report when its image has loaded; wiring that through was not done.

## Case 2 — At 390 px the report's drive table cut its first column (fixed)

**Symptom.** On a phone-width window the "date · place" cells of the drive table were cut
("2018-10-02singapore-queensto"): the table was squeezed to the 346 px of the stacked report while its
five other columns keep fixed widths.

**Fix.** Both report tables sit in an `overflow-x-auto` block and keep a minimum width (26.5 rem for
the drives, 19 rem for the distance bands): on a phone the table scrolls sideways inside its block
instead of cutting a cell. The page itself still has no horizontal overflow.

**Found after the fix, by looking at the capture:** at the same width the report's TITLE was cut
("all 10 scenes · 404 frame…"). The 390 px check looked at table cells and paragraphs only, not at the
title. The title now wraps (the title row has a minimum height instead of a fixed one), and the check
covers titles, buttons and chips as well. All scripts were re-run on that build.

---

## Cases found during the steps

## Case 3 — Captions cut inside the verdict buttons and the list; the step script passed (F7.5-B, fixed)

**Symptom.** The first sample-check screen passed all 123 checks, and the capture showed "Real · label
mi…" in the first verdict button at every width, and "c…" / "b…" for the class names in the list at
1024 px.

**Why the script missed it.** It tested that each button was inside the panel and that the row's
fixed columns were not cut — but excluded the one flexible, `truncate`-styled span per row, which is
exactly where text is cut. This is the same blind spot as in F7 (text checked by content, not by
position).

**Fix.** Captions `Real object` / `Model wrong` / `Unclear` (the full names are in the tooltips and in
"Judged: Real object, label missing"); the list shows the scene's number ("0757") with the full name in
the row's tooltip; the bar's explanatory note is shown only where the whole sentence fits (≥ 1440 px)
instead of being cut. The scripts now compare `scrollWidth` with `clientWidth` on every text element,
including the truncating ones (135 checks after the change).

**Not done:** the new check was not run against the old build to prove that it fails there.

## Case 4 — The drive table's rows did not fit the planned three-column report (F7.5-D, fixed)

**Symptom.** With three columns from 1400 px, the "date · place" cell was cut at 1536, 1440 and 1280 px
(caught by the position check): "singapore-hollandvillage" alone is about 135 px at 11 px type, and the
row has five more columns.

**Fix.** Date and place on two lines; the drive table gets the wider column (1.25 : 1); three columns
only from 1536 px, two (totals on top) from 1280 px, one below. At 1536×700 and 1440×900 both tables
are still fully visible without scrolling the report.

---

## Case 5 — Looking at another camera lost the box being judged (found by the user, fixed)

**Symptom.** The user's first real session: after clicking the other camera thumbnails "to look from
another angle", the yellow box was gone everywhere, FULL and ZOOM looked the same, and the panel said
"No sampled box is selected". Reproduced on the user's own dev server.

**Root cause.** A rule from F6: a prediction id in `selectedObjectId` is dropped as soon as the photo
on screen does not contain that prediction ("otherwise an invisible selection would linger"). In
ordinary evaluate mode that is right. In the sample check the selection IS the work item, and looking
through the neighbouring cameras is how a reviewer gets context — so the first thumbnail click threw
the work item away, and coming back to the box's camera did not restore it. Without a selection
there is nothing to zoom on, hence ZOOM = FULL.

**Why no check caught it.** None of the 343 checks clicked a camera thumbnail while the sample check
was open. The scripts walked the path the author had in mind (judge, step, export); the user did what
a reviewer does.

**Fix.**
- `page.tsx`: in the sample check, a prediction id whose FRAME is the current frame is kept while
  another camera is shown (`frameOfPredictionId`, new in `lib/evaluation/parse.ts`). Another frame
  still drops it.
- `SamplePanel`: "Showing FR — the box is in the F photo." with a **Show the box** button. The verdict
  buttons stay enabled (look around, then judge).
- The thumbnail of the box's camera carries the "selected box" marker (the way back); clicking it, the
  box's row in the list, or `[` / `]` back to it brings the zoomed photo and the yellow box back
  (opening a sampled box now sets its camera explicitly — the selection did not change, so nothing
  else would).
- 19 checks added to the sample-check script; all scripts re-run on that build (B 154, C 74, D 51,
  edge 48, regression 30, floor cost 5 = 362). Unit tests 985 → 989.

**Also learned from the same session (no code change):** the two screenshots the user sent were not of
the sample check at all — no "model / label" legend, no count badges on the thumbnails — but of review
mode, where the full photo's box labels are tiny and ZOOM needs a selected box. The sample check has
no on-screen cue other than the amber "SAMPLE CHECK" in the bar that says "you are in it".

## Checked, no change needed

- **Scenes arriving slowly (6 s each):** the sample check says "The sample is drawn from all scenes: 1
  of 10 are loaded…" in the panel and the list, Export is disabled, and box 1 opens by itself once the
  last scene is in. The sample is never drawn from a part of the population.
- **A scene that fails to load / has no predictions:** no sample, with the scene named as the reason;
  the report shows the same reason in place of "1,452 of 3,514", and lists the scene as not loaded /
  not evaluated.
- **Korean keyboard layout** (`key: "ㄱ"`, physical R): judged — `resolveShortcut` already reads the
  physical key (Edge_F#4 Case 5).
- **A verdict button clicked with the mouse, then Space / Enter:** the next box is not judged (buttons
  blur after a mouse click, as in F4).
- **A 3D box (or nothing) selected during the sample check:** `A` writes nothing to any scope; the
  buttons are disabled; J resumes at the first box without a verdict.
- **Shrinking the sample (200 → 100) under box 150:** no crash, the verdict on box 150 is not counted
  in the sample of 100, and it is still there when the sample is 200 again. After a reload the sample
  opens at 200 so that verdict is not hidden (`sampleSizeForRecords`).
- **Two tabs:** a verdict given in one tab shows in the other without a reload, and neither overwrites
  the other's records (the F4 `storage` sync covers the new scope).
- **Storage that refuses writes:** verdicts work for the visit, nothing throws, and the panel says
  they will be lost on reload — visible without scrolling.
- **Stored data:** a stale record (a box that is not in the sample) is ignored, broken records are
  dropped, data saved before F7.5 (two scopes) loads with its label records intact.
- **Dataset switch during the sample check or with the report open:** COCO renders as before; back on
  nuScenes neither reopens by itself.
- **Slider at 0 with IoU 0.5:** the conditions line reads "score ≥ 0.05 (file minimum) · IoU ≥ 0.5",
  wraps to two lines and is not cut; the scene's precision and recall are still visible.
- **Minimum height (1536×640, 1024×640):** the report stays above the timeline and scrolls inside.
- **300 rows at 1024 px:** no column of any row is cut.
- **3D floor cost:** 41 draw calls (1440×900) / 42 (1536×700) on the 40-box frame, also in evaluate
  mode and with the report open.

## Found, not caused by F7.5

- **The evaluation panel cuts "1364 of 1778 model boxes matched a la…" at 1024 px.** The `truncate`
  class on those lines was there before F7.5 (commit `4b4597e`); the panel is 360 px wide below
  1400 px. Reported to the user; not changed.
- **The bicycle-rack rule differs from the official one.** The nuScenes detection evaluation removes
  bikes and motorcycles inside a rack from BOTH ground truth and predictions ("All bikes and motorcycle
  boxes (GT and prediction) that fall inside a bike-rack are removed" — devkit detection README, read
  2026-11-27). This tool removes predictions only (F6). Whether any labelled bike sits inside a rack in
  the 404 frames was not counted. A scoring rule — out of scope here.
- **A failed scene is described as "still loading" in the panel's "All scenes" block** (F7 wording).
  The report says "not loaded (still on the way, or failed)"; the panel was left as it is.

## Could not be verified

- **The user's real browser and GPU.** All timings are from headless Chromium with software GL, one
  run each.
- **A Vercel deployment** with the 152 MB of data (carried from F7; no status was reported).
- **Whether 400 ms is right for a human.** It was chosen, not measured with a person.
- **How well one person's verdicts on 960×540 crops reproduce.** The estimate's interval covers the
  sampling, not disagreement between reviewers or the same object appearing in several sampled boxes.
