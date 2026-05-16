# Edge Case Log #4 — 3D Scene (Step 4)

## Context

Discovered during browser verification after the **Step 4 — 3D Scene (basic)**
implementation. Cases 1 and 2 were reported by the user after visually checking the
rendered output. Cases 3–6 were identified through a systematic code review of
`lib/geometry/` and `components/viewer-3d/`.

- Affected modules:
  - `apps/ai_detection_viewer_client/src/components/viewer-3d/`
    (`Viewer3D.tsx`, `PointCloud.tsx`, `BBox3D.tsx`)
  - `apps/ai_detection_viewer_client/src/lib/geometry/`
    (`bbox-estimator.ts`, `frame-enricher.ts`)
- Test suite: **65/65 passing** throughout (geometry tests are pure-function tests;
  R3F canvas tests are out of scope per Step 4 policy).
- Final status after fixes: **65/65 tests passing**.

---

## Case 1 — SVG bbox click priority fixed by paint order (DOCUMENTED, defer to Step 6)

**Discovery.** Reported by user. Clicking a visually-front object selects the wrong
detection because SVG has no CSS z-index — the last element in the JSX `map` result
is painted on top and receives click events first.

**Downstream risk.** The selected id is wrong relative to visual intent, but
Step 5 sync is unaffected (wrong id is faithfully relayed to the 3D view). The
selection ambiguity is entirely in the 2D view. Identical issue was logged in
`Edge_#2.md` Case 1 with the same deferral.

**Why no fix here.** Step 4 scope is `components/viewer-3d/` and `lib/geometry/`.
Touching `Viewer2D.tsx` violates `CLAUDE.md` Workflow Rule: "Avoid editing unrelated
files. Stay within the scope of the current step."

**Future revisit.**

| Step | Relevance | Required action |
|---|---|---|
| **Step 6 (Object List)** | **Primary resolution** | Introduce a non-spatial selection path (list click) that bypasses 2D bbox ambiguity entirely. Read `Edge_#4.md` Case 1 before starting Step 6. |
| Step 7 (Filters) | Partial mitigation | Class visibility toggles reduce the number of rendered bboxes and therefore overlaps. |
| Step 9 (UI Cleanup) | Re-evaluate | If ambiguity is still noticeable after Steps 6–7, consider (a) hover-cycle between candidates, (b) bring-to-front on hover, or (c) accept as intentional. Re-read `Edge_#2.md` + `Edge_#4.md` Case 1 before deciding. |

---

## Case 2 — 3D depth direction inverted (FIXED)

**Discovery.** Reported by user: "자전거가 사진 상에서 맨 앞에 있는데 3D viewer에서는
맨 뒤에 있음."

**Root cause.** Two coordinate conventions collided.

`bbox-estimator.ts` encodes depth as follows:
```ts
const areaRatio = (bbox.width * bbox.height) / (W * H);
const z = MAX_Z - areaRatio * (MAX_Z - MIN_Z);
// areaRatio=1 (full image) → z=MIN_Z=1   ("close")
// areaRatio=0 (tiny bbox) → z=MAX_Z=8    ("far")
```
Here `z` is a **distance scalar**: smaller z = closer to camera. This is the
convention stated in `mvp-checklist.md` Step 4 Tests: *"Larger bbox area produces a
smaller `z` (closer-to-camera)."*

The original `Viewer3D.tsx` placed the camera at `(0, 0, +14)` with the OrbitControls
target at `(0, 0, 4.5)`. With this setup the camera looks in the **−z direction**, so:

| World z | Distance from camera | Perceived depth |
|---------|---------------------|-----------------|
| 1 (large bbox, spec "close") | \|14 − 1\| = **13** | **farthest** from camera |
| 8 (small bbox, spec "far") | \|14 − 8\| = **6** | **closest** to camera |

The bicycle (largest bbox in the sample frame) gets z ≈ 1 → distance 13 → appears
at the back. The smallest detection gets z ≈ 8 → distance 6 → appears at the front.
Spec intent and visual result are inverted.

This is also the root cause of **Case 3** (frustum clipping) — see below.

**Fix (Path A: move camera to −z side).**

Changed `Viewer3D.tsx` camera position from `[0, 0, 14]` to `[0, 0, -10]`. Target
`[0, 0, 4.5]` unchanged.

```diff
- camera={{ position: [0, 0, 14], fov: 50, near: 0.1, far: 100 }}
+ camera={{ position: [0, 0, -10], fov: 50, near: 0.1, far: 100 }}
```

Camera now looks in **+z direction**. Distances become correct:

| World z | Distance from camera | Perceived depth |
|---------|---------------------|-----------------|
| 1 (large bbox, spec "close") | \|1 − (−10)\| = **11** | **closest** ✓ |
| 8 (small bbox, spec "far") | \|8 − (−10)\| = **18** | **farthest** ✓ |

**Why Path A over alternatives.**

| Approach | Change surface | Impact |
|---|---|---|
| **A. Move camera to −z (chosen)** | `Viewer3D.tsx` 1 line | Estimator, tests, spec wording untouched |
| B. Flip estimator formula | Estimator + comment + 1 test + mvp-checklist spec | 4 locations; data semantics change from "z=distance" to "z=world coord" |
| C. Negate z when placing meshes | Scene/PointCloud/BBox3D 3 files | `Detection3D.center[2]` value ≠ actual world position; confusing invariant |

Path A preserves the single-responsibility boundary: the data model expresses z as a
distance, the renderer's camera placement decides how that maps to world space.

**Frustum verification (FOV 50°, canvas aspect 4:3, SCENE_HALF_Y=5).**

At camera z=−10, the nearest scene content is at z=1 (distance 11). Visible half-height
at that distance: `11 × tan(25°) ≈ 5.13 ≥ SCENE_HALF_Y=5`. Fits. Horizontal range at
4:3 aspect: `5.13 × (4/3) ≈ 6.84 ≥ SCENE_HALF_Y × aspect = 6.67`. Fits. No clipping.

**Tests.** No test changes needed — all geometry tests are pure-function tests on
`lib/geometry/`, not on Three.js scene configuration. The 65-test suite remains green.

---

## Case 3 — Scene frustum clips detections at image edges (FIXED via Case 2)

**Discovery.** Code review of camera config vs. estimator scale constants.

**Root cause.** Same as Case 2. With camera at `(0, 0, +14)` the nearest scene plane is
z=8 (distance 6 from camera). Visible half-height at distance 6: `6 × tan(25°) ≈ 2.8`.
But `SCENE_HALF_Y=5`, so any detection with a world y beyond ±2.8 at z=8 would be
outside the frustum. A small bbox at the top edge of the image maps to
`y ≈ +SCENE_HALF_Y=5`, which exceeds the ±2.8 visible window → clipped.

**Fix.** Same as Case 2 (camera to −z). Verified in Case 2 frustum check above: nearest
plane (z=1, distance 11) gives visible half-height ≥ 5.13, which covers SCENE_HALF_Y. No
separate change required.

---

## Case 4 — `BufferGeometry` / `EdgesGeometry` never disposed — GPU memory leak (FIXED)

**Discovery.** Code review of `PointCloud.tsx` and `BBox3D.tsx`.

**Root cause.** Both components create Three.js geometry objects imperatively inside
`useMemo`:

```ts
// PointCloud.tsx
const geometry = useMemo(() => new THREE.BufferGeometry(), [points]);

// BBox3D.tsx
const geometry = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...)), [...]);
```

When the memo dependency changes (new frame, size update), React discards the old memoized
value and recomputes. The old `BufferGeometry`/`EdgesGeometry` loses its JS reference and
becomes eligible for GC — but Three.js geometry objects hold **GPU-side buffer objects**
(uploaded via WebGL). GC reclaims the JS heap entry but does **not** call `dispose()`, so
the GPU buffers remain allocated until the WebGL context is destroyed.

R3F's reconciler auto-disposes geometries declared as **JSX children**
(`<bufferGeometry>`, `<edgesGeometry>`), but **imperatively-created** objects passed as
`geometry={...}` props are the user's responsibility.

**Downstream risk (Step 8).** Step 4 renders a single frame; one leak per geometry type.
Tolerable. Step 8 introduces frame switching: every switch creates new geometries for the
new frame's detections without releasing the previous ones. For a 10-frame dataset with
5 detections per frame and frequent user navigation, this accumulates hundreds of leaked
GPU allocations — leading to browser "ran out of memory" / context loss.

**Fix.** Added a `useEffect` cleanup to each component that calls `geometry.dispose()`
when the memoized geometry instance is replaced or the component unmounts:

```ts
// PointCloud.tsx and BBox3D.tsx
useEffect(() => () => geometry.dispose(), [geometry]);
```

The cleanup runs:
1. Before the next render in which `geometry` has changed (old geometry disposed).
2. On component unmount (current geometry disposed).

**Why `useEffect` cleanup rather than inside `useMemo`.**
`useMemo` cleanup is not a React concept — `useMemo` has no destructor. Using
`useEffect(() => cleanup, [dep])` is the idiomatic React pattern for "run teardown
when dep changes or on unmount."

**Why not switch to declarative `<bufferGeometry>` JSX.**
`architecture.md` R3F Performance Rules explicitly requires `THREE.BufferGeometry`
used directly. Switching to the declarative form would also create a new
`BufferAttribute` instance on every render (before memoization stabilises it),
making the performance trade-off worse, not better.

**Inner `BoxGeometry` in BBox3D.** The `new THREE.BoxGeometry(...)` passed to
`EdgesGeometry` is CPU-only — it is consumed to compute edge indices and never
uploaded to GPU directly. It is safely GC'd once the `useMemo` callback returns.
No explicit dispose needed.

**Tests.** GPU disposal is untestable in the pure-function Vitest suite. Verification
is manual: use the browser DevTools WebGL memory inspector (or `THREE.WebGLRenderer.info`)
after navigating multiple frames in Step 8.

---

## Case 5 — `pointCloud` locked at `enrichFrame` time, ignores future filters (DOCUMENTED, defer to Step 7)

**Discovery.** Code review of `frame-enricher.ts` → `generatePointCloud` call chain.

**Root cause.** `enrichFrame` calls `generatePointCloud(detections3D, ...)` once and
stores the result in `Frame.pointCloud`. The `Point3D` type has no `detectionId`
field, so the viewer cannot match a point to a specific detection for filtering.
When Step 7 applies `confidenceThreshold` or `visibleClasses`, the wireframe boxes
disappear for hidden detections but the underlying point cloud points remain
(generated from the full, pre-filter detection set).

**Downstream risk.** Visual inconsistency: floating orphan points in the 3D scene
after filtering. No data corruption or crash.

**Future revisit (Step 7 Filters).**

| Option | Trade-off |
|---|---|
| A. Add `detectionId?: string` to `Point3D`; `PointCloud` prop receives a visible-id `Set` and filters on render | Minimal struct change; filtering at render time is cheap; preserves enrichment-time generation |
| B. Re-generate `pointCloud` from filtered `detections3D` on each filter change | No struct change; heavier re-computation per filter interaction |
| C. Redefine point cloud as scene-wide background scatter (not per-detection) | Solves the mismatch by removing the per-detection relationship entirely; changes the visual intent |

Recommended first candidate: **Option A**. Read `Edge_#4.md` Case 5 when starting Step 7.

---

## Case 6 — `OrbitControls` camera state persists across frame changes (DOCUMENTED, defer to Step 8)

**Discovery.** Code review of `Viewer3D.tsx` + `Scene.tsx` React tree structure.

**Root cause.** `<Canvas camera={{ position: [...] }}>` initialises the Three.js camera
**once** on mount; subsequent re-renders with the same prop value do nothing. The
`OrbitControls` component holds its own internal state (current camera position,
target, zoom). As long as the same `<Canvas>` stays mounted in the React tree, camera
state is never reset when the `frame` prop changes.

**Downstream risk.** In Step 8 (Frame Timeline), switching frames keeps the `<Canvas>`
mounted. A user who has orbited and zoomed into a detail of frame N will land in frame
N+1 with the camera aimed at empty space. If frame N+1 has a different `imageWidth` /
`imageHeight` (different aspect), the `SCENE_HALF_Y * aspect` x-range is also different,
potentially placing objects outside the lingering view frustum.

**Future revisit (Step 8 Frame Timeline).**

The right policy depends on Step 8's UX decision:

| UX decision | Implementation |
|---|---|
| Reset camera on every frame switch | `useEffect([selectedFrameId], () => { camera.position.set(0, 0, -10); orbitRef.current?.reset(); })` |
| Preserve camera per-frame | Store per-frame camera state in the Zustand store or a local ref map |
| "Fit to scene" button | Add a manual reset trigger in the toolbar; no auto-reset |
| Remount canvas per frame | `<Viewer3D key={frame.id} ... />` forces full remount; simplest but drops GPU texture cache |

Read `Edge_#4.md` Case 6 before implementing Step 8. Default recommendation:
start with remount-per-frame (`key={frame.id}`) for simplicity; optimise if flicker
is unacceptable.

---

## Summary

| # | Symptom | Root cause | Decision | Fix site |
|---|---------|-----------|----------|----------|
| 1 | Overlapping 2D bboxes: wrong object selected | SVG paint order = array order | **Defer to Step 6** (Object List provides non-spatial selection) | — |
| 2 | Large objects appear at back in 3D | Camera at +z; estimator z is distance (small=close), but +z camera reads small-z as far | **Fixed** | `Viewer3D.tsx` camera `[0,0,-10]` |
| 3 | Small/edge-of-image detections clipped from view | Same camera config creates narrow frustum near scene | **Fixed** (Case 2 fix resolves) | — |
| 4 | GPU memory leak on geometry changes / frame switch | Imperative `BufferGeometry`/`EdgesGeometry` never `dispose()`d | **Fixed** | `PointCloud.tsx`, `BBox3D.tsx` — `useEffect` cleanup |
| 5 | Post-filter: orphan points visible for hidden detections | `pointCloud` generated once at enrich; `Point3D` has no `detectionId` | **Defer to Step 7** | — |
| 6 | Camera state (orbit/zoom) carries over to next frame | `<Canvas>` camera is one-time init; `OrbitControls` owns state | **Defer to Step 8** | — |

Cases 2 and 3 share a single root cause (camera placement relative to scene scale).
Their joint fix is one line in `Viewer3D.tsx`. Cases 5 and 6 are deferred because
their resolution depends on decisions that belong to the consuming steps (filters and
timeline), following the same "defer to the step that has enough context" pattern
established in `Edge_#2.md` and `Edge_#3.md`.
