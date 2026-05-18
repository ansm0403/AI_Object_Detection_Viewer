# Edge Case Log #7 — Filters (Step 7)

## Context

Discovered during the `/edgecase-review` pass after **Step 7 — Filters** main work
and the paint-order sort follow-up. Step 7 also resurfaced and resolved two
pre-existing cases via separate fixes; those are recorded under their original
logs (cross-referenced in the Summary below).

- Affected modules:
  - `apps/ai_detection_viewer_client/src/components/filters/`
  - `apps/ai_detection_viewer_client/src/app/page.tsx`
- Test suite: **82/82 passing** (no new tests for UI components per CLAUDE.md
  Testing Policy).
- Both cases below are deferred — neither is a Step 7 scope bug.

---

## Case 1 — `Filters` derives class list from the current frame only (DOCUMENTED, defer to Step 8)

**Discovery.** `/edgecase-review` open-ended pass.

**Root cause.** `Filters.tsx` builds the chip list with

```ts
const classes = useMemo(() => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of frame.detections2D) {
    if (!seen.has(d.class)) { seen.add(d.class); out.push(d.class); }
  }
  return out;
}, [frame.detections2D]);
```

The chip set is therefore a function of the **currently visible frame only**. The
`visibleClasses` Set in the store persists across frames (no reset on
`setSelectedFrame`).

**Downstream risk (Step 8).** When the timeline introduces frame navigation:

- A class that exists only in frame N (e.g. `truck`) will have a chip in frame N
  but **disappear** when the user navigates to frame M where no truck is detected.
- If the user had toggled `truck` into `visibleClasses` while in frame N, the
  state persists — but in frame M they have no UI to toggle it back out, because
  the chip is gone.
- Visually nothing breaks; functionally, a hidden class becomes unrecoverable
  without returning to a frame that contains it.

No risk in Step 7's single-frame view: `frame.detections2D` is always the same
set, so the chip list and `visibleClasses` references stay consistent.

**Future revisit (Step 8 Frame Timeline).**

| Option | Trade-off |
|---|---|
| A. Derive `classes` from the **union** across all frames | Chip set is stable across navigation. Requires `Filters` (or `page.tsx`) to receive `frames` rather than just `currentFrame`. |
| B. Reset `visibleClasses` on every `setSelectedFrame` | No UI change, but loses the user's filter intent across navigation. |
| C. Auto-remove stale classes from `visibleClasses` when entering a frame that lacks them | Implicit state change is surprising. Reject. |

Recommended: **Option A**. Read `Edge_#7.md` Case 1 when starting Step 8.

---

## Case 2 — Filters panel background click does not deselect (DOCUMENTED, defer to Step 9)

**Discovery.** `/edgecase-review` open-ended pass.

**Root cause.** `Viewer2D`, `Viewer3D`, and `ObjectList` all treat empty-space
clicks as deselect (`onSelect?.(null)`). The `Filters` root `<div>` has no
equivalent handler, so clicking its padding while an object is selected leaves
the selection in place.

**Downstream risk.** Mild UX inconsistency. The filters bar is "controls" rather
than "scene background," so this is defensible — but the rule "click any
non-detection surface to deselect" is broken in one spot.

**Future revisit (Step 9 UI Cleanup).** Decide whether the filter bar should
deselect on background click, and apply consistently with whatever decision is
made for other layout chrome (header area, page background). One-line fix
either way.

---

## Summary

| # | Symptom | Decision | Fix site |
|---|---------|----------|----------|
| 1 | Class chip set changes per-frame while `visibleClasses` persists; toggled-on classes become unreachable in frames that lack them | **Defer to Step 8** (Option A: union of all frames) | — |
| 2 | Clicking Filters bar background does not deselect | **Defer to Step 9** | — |

### Cross-referenced fixes (Step 7 main + follow-up)

| Issue | Original log | Status |
|---|---|---|
| `pointCloud` ignored filters (orphan points after class/threshold filtering) | `Edge_#4.md` Case 5 | **Fixed in Step 7** (Option A: `Point3D.detectionId` required; render-time filter) |
| SVG bbox click priority in overlapping bboxes | `Edge_#2.md` Case 1 / `Edge_#4.md` Case 1 | **Fixed in Step 7 follow-up** (paint-order sort by bbox area ascending; long-form write-up in `docs/etc/blog-svg-paint-order-and-click-priority.md`) |

Both Step 7 cases above are deferred *to the right consuming step* (Step 8 needs
the union-of-frames decision before frame navigation lands; Step 9 owns
layout/UX consistency). Neither blocks Step 7 completion.
