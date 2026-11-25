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
