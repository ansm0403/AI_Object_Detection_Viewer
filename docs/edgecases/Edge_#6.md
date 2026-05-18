# Edge Case Log #6 — Object List Panel (Step 6)

## Context

Discovered during browser verification after **Step 6 — Object List Panel** implementation.
Case 1 was a user-reported bug fixed in-session. Cases 2–4 were identified via the
lightweight `/edgecase-review` pass after Case 1's fix.

- Affected modules:
  - `apps/ai_detection_viewer_client/src/components/object-list/`
  - `apps/ai_detection_viewer_client/src/app/page.tsx`
  - `apps/ai_detection_viewer_client/src/components/viewer-3d/Viewer3D.tsx`
- Test suite: **70/70 passing** throughout (no new tests; UI rendering not in test scope).

---

## Case 1 — 2D viewer hidden behind 3D Canvas (FIXED)

**Discovery.** Reported by user during Step 6 browser verification:
"2D 그림은 보이지 않는다" — the 2D SVG existed in the DOM (confirmed via devtools,
`viewBox="0 0 426 640"` matched the expected frame) but was invisible on the page.

**Root cause.** Two factors compounded:
1. The grid template was defined as `const LAYOUT_CLASS = 'grid-cols-1 md:grid-cols-[1fr_1fr_280px]'`
   and interpolated into JSX `className`. Tailwind v3 JIT scans source files for class names, and
   while it usually picks up class names inside JS string literals, extraction of arbitrary values
   with bracket notation (`[1fr_1fr_280px]`) from a const string is less reliable than from a JSX
   literal — the 3-column rule was not consistently generated.
2. With the 3-column rule missing, the grid fell back to `grid-cols-1`. The Viewer3D wrapper had
   `w-full aspect-[4/3]` but no `position: relative` of its own. R3F's `<Canvas>` renders an
   inner `<canvas>` with `position: absolute; width: 100%; height: 100%`. When `aspect-ratio`-driven
   height resolution becomes ambiguous in a fallback layout, the absolute canvas can use a
   higher ancestor as its containing block, overflowing its intended cell and covering the SVG
   that should be above/beside it.

**Fix.**
- `page.tsx`: removed `LAYOUT_CLASS` const; class string lives directly in JSX `className`,
  guaranteeing Tailwind JIT extraction. Comment above the `return` documents how to swap layouts.
- `Viewer3D.tsx`: added `relative overflow-hidden` to the wrapper div as a defensive
  containment — the Canvas's absolute positioning is now anchored to (and clipped by) this wrapper.

**Why both fixes, not just one.**
Fix (1) restores the intended 3-column layout. Fix (2) is defensive against any future layout
where the wrapper's containing-block role is unclear. Cheap (one Tailwind class) and prevents
the same class of bug from re-appearing under unrelated layout changes.

**Tests.** None — CSS layout is not in the Vitest scope. Suite remains 70/70.

---

## Case 2 — ObjectList does not scroll on mobile (DOCUMENTED, defer to Step 9)

**Discovery.** `/edgecase-review` after Case 1 fix.

**Root cause.** The panel uses `<div class="flex flex-col h-full">` with `<ul class="flex-1 overflow-y-auto">`.
`overflow-y-auto` triggers only when the child overflows a constrained height. In `grid-cols-1`
(mobile), the grid row height is `auto`, so `h-full` resolves to content height — the list
extends the page instead of scrolling within a fixed area.

**Downstream risk.** Pure UX (long lists push other content off-screen on mobile). No data
corruption or crash.

**Future revisit (Step 9 UI Cleanup).** Cap the panel height on small screens, e.g.
`max-h-[60vh] md:max-h-none`. Deferred because the project is desktop-first and Step 9 will
do a full responsive pass anyway.

---

## Case 3 — Clicking the panel header deselects (DOCUMENTED, defer to Step 9)

**Discovery.** `/edgecase-review` after Case 1 fix.

**Root cause.** The outer panel `<div>` has `onClick={() => onSelect?.(null)}` for empty-space
deselect. The "Objects (N)" header is a child of this div, and its click bubbles up — clicking
the header text counts as an empty-space click.

**Downstream risk.** Mildly counterintuitive (clicking a label clears selection). Not destructive.

**Future revisit (Step 9 UI Cleanup).** One-line fix: `onClick={(e) => e.stopPropagation()}` on
the header div. Deferred only because the header is a small target and impact is minor.

---

## Case 4 — `id` column has no truncate/max-width (DOCUMENTED, no fix needed now)

**Discovery.** `/edgecase-review` after Case 1 fix.

**Root cause.** The `id` `<span>` uses `shrink-0 tabular-nums` but no `truncate` or `max-w-*`.
Today's ids follow `${imageId}-${annotationId}` (e.g. `"1-23"`) — short, no overflow.

**Downstream risk.** Latent: if a future dataset (or id-generation change) produces long ids,
the row width would expand and squeeze the class column's `truncate` budget.

**Future revisit.** Only act if/when long ids actually appear. Quick fix would be
`truncate max-w-[80px]` on the id span, or hide id below `md:`.

---

## Summary

| # | Symptom | Root cause | Decision | Fix site |
|---|---------|-----------|----------|----------|
| 1 | 2D SVG invisible; 3D Canvas appears to cover it | Tailwind JIT did not extract arbitrary-value class from const string; layout fell back; R3F absolute canvas overflowed its cell | **Fixed** | `page.tsx` (class as JSX literal), `Viewer3D.tsx` (`relative overflow-hidden`) |
| 2 | List doesn't scroll on mobile | `h-full` + `overflow-y-auto` need a constrained parent height; `grid-cols-1` row is auto-sized | **Defer to Step 9** | — |
| 3 | Clicking panel header deselects | Header click bubbles to panel's deselect handler | **Defer to Step 9** | — |
| 4 | `id` column lacks max-width / truncate | No constraint on the id span | **No fix needed now** | — |

Case 1's two fixes were applied independently of each other so that either alone would prevent
the overlap. Cases 2–3 are 1-line patches deliberately deferred to Step 9 to keep them within
the responsive/UI pass. Case 4 has no current trigger and is recorded only as a latent risk.
