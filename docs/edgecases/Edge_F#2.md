# Edge Case Log F#2 — nuScenes Real-3D Integration (F2-A)

> Case 1 was discovered implementing the **pure `lib/` core** of F2-A (TDD,
> synthetic fixtures, no UI). Cases 2–3 were discovered during the **UI
> integration** session (wiring the prepped data into the live app + Playwright
> render verification). See `post-mvp-checklist.md` → F2-A and
> `architecture.md` → "nuScenes Integration".

## Context

- Affected modules (all new):
  - `lib/geometry/transforms.ts` (+ `transforms.test.ts`, 13 tests)
  - `lib/geometry/projection.ts` (+ `projection.test.ts`, 10 tests)
  - `lib/nuscenes/types.ts`, `lib/nuscenes/parser.ts` (+ `parser.test.ts`, 10 tests)
  - `lib/types/index.ts` (`Frame.source?`, `Detection3D.bbox3D.rotation?`)
- Test suite: **114 → 147 passing** (33 new pure-logic tests). No render tests
  (no UI this session), per Testing Policy.

---

## Case 1 — A 3D box can have NO 2D box (behind camera / off-screen), and that is correct

**Discovery (by design, surfaced while wiring the parser).** COCO gives every
object a 2D box, so the codebase implicitly assumed `detections2D` and
`detections3D` are 1:1. nuScenes has **no 2D boxes** — we *project* each 3D box
into the camera. But a box can sit **behind the camera** (camera-frame depth
`z ≤ 0`, e.g. an object beside/behind the car for a CAM_FRONT view) or project
**fully off-screen**. There is then no meaningful 2D rectangle.

**Why naive projection is wrong, not just empty.** A point behind the camera has
`z ≤ 0`; dividing by it flips/explodes the pixel coordinates, so the AABB of the
corners would be garbage rather than absent. So culling must happen *before*
forming the box, keyed on depth sign.

**Resolution.**
- `projectCornersToBbox` returns `null` when **any** of the 8 corners is behind
  the camera (`inFront === false`), or when the image-clamped AABB is empty
  (fully off-screen). It does NOT emit a degenerate/garbage box.
- `parseNuScenes` therefore **always pushes the `Detection3D`** (the box still
  renders in the 3D viewer, which orbits freely around the car) but **only pushes
  a `Detection2D` when projection succeeds**. Result: `detections2D.length ≤
  detections3D.length` on nuScenes frames.

**Immutable Rule #1 is still satisfied.** Rule #1 is "the same object's
`Detection2D.id` and `Detection3D.id` are identical", NOT "every 3D box has a 2D
box". When both exist they share the `instance`-derived id (locked by a parser
test). A 3D-only box simply has no 2D counterpart to highlight in the 2D view;
selection via `selectedObjectId` still works (the 2D viewer shows nothing
selected, which is the honest result for an object outside the camera image).

**Test coverage.** `projection.test.ts` — behind-camera → `null`, fully
off-screen → `null`, edge-straddling → clamped (not dropped). `parser.test.ts` —
a front box + a behind-camera box yields `detections3D.length === 2` but
`detections2D.length === 1`, and the surviving 2D id matches its 3D id.

**Deferred / to watch (next sessions).** Partial-visibility boxes (some corners
in front, some behind) are currently dropped wholesale rather than near-plane
clipped — accepted for F2-A (chosen decision: "all 8 in front or skip 2D"). If a
real nuScenes-mini frame shows too many large boxes vanishing at the image edge,
revisit with near-plane clipping. Also unverified until real data lands: whether
GLOBAL coordinates of large magnitude introduce float precision issues in
`globalToEgo` (synthetic fixtures use small numbers).

---

## Case 2 — The 3D viewer's visible-id set must be built from `detections3D`, not `detections2D`

**Discovery (wiring the distance/visibility filters in `page.tsx`).** The whole
filter pipeline computes `visibleIds = selectVisibleDetectionIds(frame, …)`,
which filters **`detections2D`**, and the 3D viewer (`Scene`) renders
`frame.detections3D.filter(d => visibleIds.has(d.id))`. On COCO this is fine —
every 3D box has a 1:1 2D box, so the 2D-derived id set covers all 3D boxes. On
nuScenes it is **wrong**: a measured 3D box can have no 2D projection (Case 1),
so its id is absent from the 2D-derived set and the box **silently fails to
render in the 3D viewer** — exactly the boxes the feature exists to show. On the
sample's frame 0, only 13 of 40 boxes have a 2D projection, so ~27 measured
boxes would vanish.

**Resolution.** Added a parallel pure selector `selectVisibleDetectionIds3D`
(filters `detections3D` with the same confidence + permissive-empty class rules).
`page.tsx` now derives **two** visible-id sets: a 2D set (Viewer2D + ObjectList)
and a 3D set (Viewer3D), each intersected with the distance-filter set. Because
shared objects have equal 2D/3D ids (Rule #1) and COCO is 1:1, the two sets
coincide on COCO — no behavior change there; they diverge only on nuScenes,
where the 3D set is the superset.

**Why not just build the 2D set from `detections3D`?** The 2D viewer + ObjectList
iterate `detections2D`; feeding them 3D-only ids is harmless (those ids aren't in
`detections2D`) but conflating the two sets hides the intent. Two named selectors
keep "what the 2D views show" and "what the 3D view shows" explicit.

---

## Case 3 — The COCO-tuned camera + fog hide the entire nuScenes box cloud (found by rendering)

**Discovery (Playwright render verification).** First nuScenes screenshot showed
an almost-empty 3D viewer — only ~2 of 40 boxes visible. Two COCO-tuned scene
constants were the cause, both invisible in unit tests:
1. **Camera direction.** The estimator packs COCO boxes into `z∈[1,8]`, so the
   camera sits at three `(0,0,−10)` looking toward **+z**. nuScenes forward is
   three **−z** (`egoToThree` maps ego +x forward → −z), and boxes spread to
   `z≈−25` ahead and ±tens of metres laterally. The camera literally faced
   *away* from them — 23/40 boxes sat behind it.
2. **Fog.** `<fog args={['#0a0a0a', 10, 28]}>` is opaque by 28 *camera-units*.
   A camera fit to the nuScenes cloud sits ~60 units back, so every box (35–90
   units away) was **fully fogged out** even after the direction was fixed. Plus
   `far=100` clipped the farther boxes.

**Resolution.** Branch the camera/scene on `frame.source`:
- nuScenes: `frameBoxesForCamera(centers)` (pure, `lib/geometry/camera-framing.ts`,
  tested) fits the camera *behind + above* the box cloud's horizontal centre,
  looking forward/down; `far` widened to 600; **fog disabled** (its depth cue is
  COCO-specific, and `pointCloud` is empty in F2-A so depth-color isn't in play).
- COCO: unchanged — keeps the tuned `(0,0,−10)`→`+z` camera, `far=100`, and fog
  (Edge_#4 Case 2, F1-A depth color). Verified by screenshot that the COCO 3D
  scene is pixel-wise the same as before F2.

**Lesson reinforced.** "3D looks plausible but is easy to get wrong" — this was
invisible to the 147 passing unit tests (all the *math* was correct); only
rendering the real data surfaced that the *view* was pointed the wrong way and
fogged. (Project memory: verify visual/3D changes by screenshotting the running
app, not by reasoning.)

**Deferred / to watch.** `frameBoxesForCamera` fits to the full box cloud, so a
single far lateral outlier backs the camera off and shrinks the main cluster;
acceptable for an overview (the user can orbit). If a future frame frames poorly,
consider fitting to a percentile of boxes or to the distance-filtered set.

---

## Notes on decisions that did NOT become edge cases

- **Axis convention** `(x,y,z)→(-y,z,-x)`: chosen up front (det = +1, handedness
  preserved). The residual "which way is forward initially" is a camera-framing
  concern for the UI session, not a correctness issue — no edge case.
- **Quaternion order** `[w,x,y,z]` (nuScenes) vs `[x,y,z,w]` (Three.js): handled
  at a single conversion point (`quatNuToThree`); absent rotation → identity.
  Locked by tests, not an in-the-wild surprise.
