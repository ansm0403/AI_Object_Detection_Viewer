# Edge Case Log F#2 — nuScenes Real-3D Integration (F2-A lib core)

> Cases discovered while implementing the **pure `lib/` core** of F2-A (measured
> 3D boxes + projected 2D + sync). No data download and no UI this session —
> TDD against synthetic fixtures. See `post-mvp-checklist.md` → F2-A and
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

## Notes on decisions that did NOT become edge cases

- **Axis convention** `(x,y,z)→(-y,z,-x)`: chosen up front (det = +1, handedness
  preserved). The residual "which way is forward initially" is a camera-framing
  concern for the UI session, not a correctness issue — no edge case.
- **Quaternion order** `[w,x,y,z]` (nuScenes) vs `[x,y,z,w]` (Three.js): handled
  at a single conversion point (`quatNuToThree`); absent rotation → identity.
  Locked by tests, not an in-the-wild surprise.
