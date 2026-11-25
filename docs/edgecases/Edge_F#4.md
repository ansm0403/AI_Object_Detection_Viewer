# Edge Case Log F#4 — 3D Box Review (F4-A … F4-F)

> Cases found during the F4 session (2026-11-25) by **driving the real app** with Playwright
> (Chromium, SwiftShader WebGL) and by unit tests. See `post-mvp-checklist.md` → F4,
> `docs/plan-feature/F4_box_review.md` (design) and `docs/plan-feature/assets/F4/` (captures).

## Context

- Affected modules: `lib/review/*` (new), `store/review-store.ts` (new), `components/review/*` (new),
  `ObjectList`, `AnalyticsPanel`, `Header`, `Timeline`, `app/page.tsx`, `lib/nuscenes/parser.ts`,
  `scripts/prep_nuscenes.py`.

---

## Case 1 — The list did not scroll a row into view when it sat just above the visible area (pre-existing)

**Discovery (F4-C, before wiring J / K).** `ObjectList` keeps the selected row visible when the
selection comes from outside the list (3D click, camera click, and — new in F4 — J / K and the
auto-advance after a verdict). Probing it at 1536×700: with the list scrolled to `scrollTop = 579`,
selecting row 16 from the camera image left the row **67px above the visible area**; nothing
scrolled. Rows far above or anywhere below were handled, which is why it had gone unnoticed.

**Root cause.** The effect compared `li.offsetTop` with `ul.scrollTop`. `offsetTop` is measured from
the nearest *positioned* ancestor, and no ancestor of the list is positioned — so it was measured
from `<body>` (`li.offsetParent === BODY`), i.e. it included the list's own distance from the top of
the page (**125px**: top bar + filter bar + padding + panel title). Every comparison was off by that
amount:

- row above the view by less than 125px → `liTop < viewTop` was false → no scroll (the bug);
- row above by more → scrolled, but 125px short of the row;
- row below → scrolled 125px further than needed (the row was visible, so it looked fine).

The bug dates from the Step 9.5 fix that replaced `scrollIntoView` (Edge_#9.5 Case C). F3 made it
easier to hit by moving the list under two fixed bars; F4 would have exposed it on the first `K`.

**Resolution.** Measure the row against the list's own box:
`ul.getBoundingClientRect()` vs `li.getBoundingClientRect()`, and adjust `scrollTop` by the
overshoot. No dependency on which ancestor is positioned. Still adjusts only the `<ul>` — the page
never scrolls (Edge_#9.5 Case C holds). The effect also re-runs when the list order changes
(`orderKey`), because re-sorting can move the selected row far away.

**Verified (Playwright, 1536×700).** 40 × `J` down and 40 × `K` back up: the selected row was fully
inside the list's visible area after every key press; `window.scrollY` stayed 0.

**Takeaway.** `offsetTop` is only comparable with `scrollTop` when the scroll container is the
`offsetParent`. When it is not guaranteed, use bounding rects.

---

## Case 2 — zustand `persist` lets a storage failure escape from `set()`

**Discovery (F4-A, reading `zustand/middleware` 5.0.13 before using it).** Two behaviours matter for
a tool whose main action is "press a key to save a verdict":

1. `persist` calls `storage.setItem(...)` synchronously inside the wrapped `set`. If `localStorage`
   throws (quota exceeded, storage blocked by the browser), the exception propagates out of the store
   action — the click / key handler that approved a box would throw.
2. `createJSONStorage(() => window.localStorage)` returns `undefined` when the getter throws — which
   is also what happens during server rendering (`window` is undefined). The store is then created
   **without** its `persist` API (`store.persist` is undefined) and logs a warning on every `set`.

**Resolution.** `store/review-store.ts` wraps the backend in `createSafeStorage`: `getItem` /
`setItem` / `removeItem` never throw, "no storage here" (server render, tests) is a silent no-op, and
a real failure is reported once through `storageFailed` (guarded against the save → fail → setState →
save loop). The storage object always exists, so `persist.rehydrate()` is always callable.

**Verified (Vitest).** Saving that throws `QuotaExceededError`, and storage access that throws
`SecurityError`: the verdict is still recorded in memory, no exception escapes, `storageFailed`
becomes true. No backend at all: `storageFailed` stays false.

---

## Case 3 — The top bar wrapped onto the filter bar between 1024px and ~1100px (introduced by F4)

**Discovery (edge-case review after F4-F).** The step checks used 1280 / 1440 / 1536px. At 1024×768
the header's content ended **26px below its 44px slot** and painted over the filter bar; with the
practice badge the same happened at 1100px. F3 guarantees the fixed layout from 1024px (`lg`).

**Root cause.** The `WorkspaceShell` gives the top bar a fixed height (`lg:h-11`) so the panes do not
jump when data arrives, while `Header` is `flex-wrap`. F4 added the review progress, two counts, the
Export button and the Practice toggle; the row no longer fit one line at the narrow end, wrapped, and
the fixed-height slot let the second line overflow.

**Resolution.** Below `xl` (1280px) the bar drops what is available elsewhere: the "· N detections"
part of the frame meta (only when review content is present — COCO keeps it; the list title shows the
same number) and the "N rejected / N unsure" texts (kept in the progress tooltip). The progress bar,
the reviewed count, Export and the practice badge stay.

**Verified.** At 1024, 1100, 1279 and 1280px, normal and practice mode: header content ends 8px
inside the slot; no page scroll.

**Takeaway.** A fixed-height slot plus wrapping content fails silently. When adding to a bar, test the
narrowest width the layout promises, not the common ones.

---

## Case 4 — Two tabs: the tab opened earlier overwrote reviews saved by the other

**Discovery (edge-case review).** Tab A approved 3 boxes. Tab B (opened before that) still showed
0 reviewed; after one rejection in B and a reload, A showed **1 reviewed** — the 3 approvals were gone.

**Root cause.** Each tab holds its own in-memory copy and `persist` writes the WHOLE record map on
every change. Nothing told tab B that the stored data had changed, so its next save replaced it with
B's older copy plus one record.

**Resolution.** `page.tsx` listens for the browser's `storage` event (fired in the *other* tabs when
one tab writes) and calls `persist.rehydrate()` for the review key (or `key === null`, storage
cleared). Every tab now re-reads before it can overwrite.

**Verified (two pages in one browser context).** B shows A's 3 approvals without a reload; A shows B's
rejection live; after reload 4 reviewed / 1 rejected; a reset in A reaches B.

**Limit.** Two tabs changing the SAME box at the same instant still resolve as last-write-wins — fine
for a single-user tool; real concurrent editing needs a backend (out of scope).

---

## Case 5 — Shortcuts would not fire with a non-Latin input method active

**Discovery (edge-case review).** `resolveShortcut` matched `event.key`. With Korean input active the
A key reports `key: "ㅁ"`, and `key: "Process"` while the IME composes; dispatching those events
(`code: "KeyA"`) changed nothing. Whether a given browser delivers such events outside a text field
varies (Chromium on Windows usually disables the IME there; macOS and Firefox do not), so this was
fixed rather than left to the platform — the user of this tool types Korean.

**Resolution.** When `key` is not a Latin letter / digit AND looks like input-method output
(`Process`, `Unidentified`, or a single non-ASCII character), the physical key (`event.code`:
`KeyA`, `Digit2`) decides. A typed Latin letter always wins, so remapped layouts (Dvorak) keep
working by character, and named keys / punctuation never become shortcuts through their code.

**Verified.** Unit tests (key map under Hangul / `Process` / Dvorak / punctuation / inside a text
field) and in the app: `ㅁ`(KeyA), `Process`(KeyA), `ㄱ`(KeyR) → 3 reviewed, 1 rejected.

---

## Case 6 — "Every box is reviewed" while filtered-out boxes remained; N bounced between frames

**Discovery (edge-case review).** With a class filter on, after finishing the visible boxes of the
last frame the panel offered "Next frame", and N jumped to a frame whose remaining boxes were all
hidden — which offered "Next frame" again, back and forth. In the mirror case (no other frame left)
the panel said "Every box is reviewed" with 10 of 12 reviewed.

**Root cause.** The queue respected the filters but `nextFrameWithUnreviewed` did not, and the banner
inferred "all done" from "no frame to jump to".

**Resolution.** `nextFrameWithUnreviewed` takes the same per-frame visible-id rule as the queue, so a
frame qualifies only if it has an unreviewed box the filters let through. The banner has three
states: next frame available / "Nothing left with these filters · N unreviewed hidden" / "Every box is
reviewed" (only when the overall count says so).

**Verified.** Unit tests + the app with a 2-frame data set: the hidden-box message appears with
10 / 12 reviewed, N does nothing, and resetting the filters brings the boxes back.

---

## Case 7 — "NOT SAVED" stayed on after saving worked again

**Discovery (edge-case review, reading the store).** `storageFailed` was only ever set. After a
transient failure (storage full, then freed) the warning would stay until reload although every later
save succeeded — a warning that is no longer true.

**Resolution.** A write that reaches storage clears the flag. Safe because each save writes all
records, so nothing from the failed attempts is missing. Unit-tested (fail → succeed → flag false, and
the record made during the failure is in the saved data).

---

## Measured and NOT changed

- **Typing a note re-renders the page per keystroke.** On the dev server each keystroke showed a
  ~110 ms long task, and memoising `Viewer3D` was tried. A CPU profile of the **production build**
  showed the application's own JS at **~2 ms per keystroke** (82 ms for 35 characters); the dev-server
  cost was React's development-mode element creation (`jsxDEV`), plus the item below. The memo was
  reverted — per HANDOFF 3.7, no optimisation without a measurement that justifies it.

## Found during F4, not caused by F4 — deferred

- **three.js spends ~0.4–0.55 s of JS per second on shader-program bookkeeping at idle on nuScenes**
  (production build, CPU profile, 3 s windows: nuScenes 1.25–1.69 s JS of which `getParameters` /
  `getProgramCacheKey` / `getProgram` ≈ 0.5 s; COCO 0.14 s). Present with or without a selection, so
  it is a property of the nuScenes scene (dozens of boxes), not of review. Frame rate held (~56–60 fps
  in software GL), so it is CPU / battery cost rather than visible jank. The 3D scene internals are
  outside F4's scope; this needs its own measured item (which material / object forces the program
  re-evaluation every frame).
- **A failed data request reports a JSON parse error.** The loader does not check `response.ok`, so
  an HTTP 500 shows "SyntaxError: Unexpected token…" instead of the status. Pre-F4 behaviour; the
  error state itself renders correctly.

## Notes on decisions that did NOT become edge cases

- **Re-running `prep_nuscenes.py` is deterministic.** The regenerated `nuscenes.json` was compared
  with the previous file: apart from the three new annotation fields and the format version, nothing
  differed — the decimated LiDAR arrays and the ten camera images were identical. (This also answers
  the open question recorded for F7 in HANDOFF.)
- **Space / Enter after a mouse click on a verdict button.** A verdict advances the selection, and a
  mouse-clicked button keeps focus — so Space would have "clicked" Approve again, on the *next* box.
  The verdict / reason / clear buttons drop focus after a mouse click (`event.detail > 0`); keyboard
  activation keeps focus. Verified: after a mouse Approve, Space and Enter change nothing.
- **A focused `<select>` swallows letter keys** (type-ahead). The order dropdown blurs itself after a
  change so J / K / A work immediately. `resolveShortcut` treats a focused select as a typing target
  for the moment it is open.
- **Held keys.** Only J / K repeat. Holding A approves one box (verified: 7 `keydown`s → 1 verdict).
