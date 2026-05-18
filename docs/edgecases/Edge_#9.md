# Edge Case Log #9 — UI Cleanup (Step 9)

## Context

Discovered during the `/edgecase-review` pass after **Step 9 — UI Cleanup**
implementation. Step 9 was primarily a polish pass that resolved several
previously-deferred cases from earlier logs; new cases discovered here are
recorded below.

- Affected modules: all components + `lib/ui/`, `app/`.
- Test suite: **85/85 passing** throughout (no new tests; UI polish step).

---

## GPU Memory Audit (Step 8 deferred — RESOLVED, no issue)

**Discovery.** Manual audit deferred from Step 8 after `<Viewer3D key={frame.id}>`
remount-per-frame was introduced.

**Method.** Temporary `useFrame` hook in `Scene.tsx` logged
`gl.info.memory` every 2 seconds. 10-frame round-trip repeated 4–5 times.

**Result.** `geometries` oscillated between 9 and 13, matching per-frame
detection count variance (4–6 detections × 1 EdgesGeometry each + 1 PointCloud
BufferGeometry + scene primitives). No monotonic growth.

**Conclusion.** No leak. The `useEffect` dispose cleanup in `BBox3D.tsx` and
`PointCloud.tsx`, combined with R3F's Canvas lifecycle on remount, correctly
frees GPU resources on every frame switch. Temporary logging code removed after audit.

---

## Summary

| # | Item | Decision |
|---|------|----------|
| GPU | `WebGLRenderer.info.memory.geometries` stable (9↔13) across 10-frame navigation | **No issue** — dispose pattern confirmed effective |

### Cross-referenced resolutions (Step 9 closing earlier defers)

| Earlier defer | Resolution in Step 9 |
|---|---|
| `Edge_#2.md` Case 5 — Viewer2D image load has no fallback | **Fixed**: `imageError` state + SVG rect/text placeholder; resets on `frame.imageUrl` change |
| `Edge_#6.md` Case 2 — ObjectList does not scroll on mobile | **Fixed**: `max-h-[60vh] md:max-h-none` on panel wrapper |
| `Edge_#6.md` Case 3 — ObjectList header click deselects | **Fixed**: `e.stopPropagation()` on header div |
| `Edge_#7.md` Case 2 — Filters bar background does not deselect | **Fixed**: `onClick={onDeselect}` on Filters root; inner controls wrapped with `stopPropagation` |
| `Edge_#8.md` Case 2 — fetch has no AbortController | **Fixed**: `AbortController` + cleanup in `page.tsx`; `AbortError` silenced |
| `Edge_#8.md` Case 3 — Timeline thumbnail has no image-load fallback | **Fixed**: `onError` → `display:none` + `data-fallback` span reveal |

### Intentionally not fixed (carried forward as documented)

| Earlier case | Reason |
|---|---|
| `Edge_#2.md` Case 4 — label text click-through | All fix options worsen Case 1 paint-order. ObjectList is the escape hatch. |
| `Edge_#2.md` Case 6 — very small bbox click difficulty | Same cluster as Case 4. |
| `Edge_#6.md` Case 4 — id column overflow | No current trigger in sample data. |
