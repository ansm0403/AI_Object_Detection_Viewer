# Edge Case Log F#2 — nuScenes Real-3D Integration (F2-A / F2-B / F2-C / F2-D)

> Case 1 was discovered implementing the **pure `lib/` core** of F2-A (TDD,
> synthetic fixtures, no UI). Cases 2–3 were discovered during the **UI
> integration** session (wiring the prepped data into the live app + Playwright
> render verification). Case 4 is **F2-B** (real LiDAR point cloud — alignment +
> render verification). Cases 5–6 are **F2-C** (sequence + tracking + autoplay —
> dataset-aware selection persistence + camera stability). Cases 7–8 are **F2-D**
> (motion/camera polish — camera-follow fallback + box-tween honesty). See
> `post-mvp-checklist.md` → F2-A / F2-B / F2-C / F2-D and `architecture.md` →
> "nuScenes Integration".

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

## Case 4 — LiDAR points must route through GLOBAL to align with the boxes (F2-B, render-verified)

**Discovery (F2-B, designing the alignment + Playwright verification).** The boxes
live in the **CAM_FRONT ego frame** (the F2-A parser transforms each global box
with the *camera* `sample_data`'s `ego_pose`). The real LiDAR points are born in
the **LIDAR_TOP sensor frame** and ship with their *own* `calibrated_sensor` AND
their *own* `ego_pose` — the LiDAR fires at a slightly different timestamp than the
camera, so the car has moved a few cm and the two `ego_pose`s differ.

**Why the naive path is subtly wrong.** Applying only the LiDAR calibration
(sensor → ego) and dropping the points straight into the box ego frame ignores that
ego_pose mismatch, leaving a small but real offset between points and boxes.

**Resolution.** Align via the fixed world frame:
`sensorToGlobal` (LiDAR calib → LiDAR `ego_pose`) → `globalToEgo` (the frame's
CAM_FRONT `ego_pose`) → `egoToThree`. Going through GLOBAL cancels the
LiDAR-vs-camera capture-time offset because GLOBAL is the one frame both ego poses
are expressed in. `sensorToGlobal` is the new pure transform (the inverse direction
of `globalToEgo`); the parser composes the three, all unit-tested.

**Render verification (the decisive check).** Unit tests prove the math but not the
*alignment* (same lesson as Case 3). The Playwright screenshot was conclusive: the
decimated cloud shows the characteristic **concentric LiDAR rings centred on the
ego/sensor origin**, with the measured boxes embedded in the surrounding point
field. A broken transform (wrong calibration, skipped ego hop, axis error) would
have put the rings off-origin or the cloud in a different region than the boxes; the
co-location confirms correctness. The cm-scale ego_pose correction itself is below
visual resolution, but is correct by construction and cheap, so it was kept.

**Rule #3 note — decimation is not a transform.** The prep script voxel-grid
*decimates* the sweep (keeps ≤1 point per spatial cell) and copies the raw
sensor-frame coordinates. That is subsampling, not coordinate math, so it stays in
the offline script without violating Immutable Rule #3 — every actual frame
transform lives in `lib/geometry` and is tested. (Voxel binning uses the raw coords
only to *group* points, never to move them.)

**Deferred / to watch.** Point `size` (`0.2`) and decimation density (~6.5k/frame,
voxel 0.6 m) were render-tuned on scene-0916; a denser scene or different camera may
want a smaller size or finer voxel (`--voxel-size`). Depth color reuses F1-A
unchanged — on the wide nuScenes cloud the gradient is real but reads subtler than
on COCO's compact scene; revisit only if a future frame looks flat.

---

## Case 5 — Frame-switch must KEEP the selection on nuScenes (the inverse of Edge_#5 Case 6) (F2-C)

**Discovery (F2-C, wiring tracking).** Step 8 made `handleSelectFrame` clear
`selectedObjectId` on *every* frame switch (Edge_#5 Case 6). The reason was
COCO-specific: COCO ids are `imageId-annId`, **unstable across frames**, so a
kept id could ghost-highlight a stale object or accidentally match a *different*
object that happens to share the generated id. For F2-C this clear is exactly
wrong: nuScenes ids are `instance` tokens — **stable for the SAME physical object
across frames** — so clearing on switch throws away the cross-frame identity that
makes tracking (and meaningful autoplay) possible.

**Why not just "stop clearing".** COCO still needs the clear (its premise is
unchanged). So the behavior has to branch on the dataset, not flip globally.

**Resolution.** A single `tracksAcrossFrames` flag (`datasetId === 'nuscenes'`) in
`page.tsx` gates the `setSelectedObject(null)` call: COCO clears, nuScenes keeps.
Keeping the id means:
- if the same object is in the next frame → it stays highlighted (tracking);
- if the object is briefly out of view → no id match, so nothing is highlighted
  (the honest result), and it **re-highlights when the object returns** — correct
  here precisely because re-appearance is the SAME object (unlike COCO, where it
  would be a coincidence). This is decision **1-A**.

**Immutable Rule #2 preserved.** There is still exactly one `selectedObjectId`;
only *when* it is cleared differs by dataset. No `selected2D/3D`, no per-dataset
selection field.

**Test + render coverage.** `tests/integration/frame-switch.test.ts` parametrizes
the mirrored `handleSelectFrame` by `tracksAcrossFrames`: COCO-clears (3 retained
cases) + nuScenes-keeps (switch keeps id, multi-frame walk keeps id, same-frame
re-select no-ops). Render-verified: a `person` instance stayed selected across a
manual frame 1→2 switch (the SELECTED panel showed the same id); on COCO the panel
went back to its placeholder after a switch.

**Deferred / to watch.** The kept id can point at an object with no 2D projection
in the current frame (Case 1), so `SelectedObjectInfo` (which looks the id up in
`detections2D`) shows its placeholder even though the 3D box is still highlighted —
expected, but if it ever reads as "lost selection" to a user, surface the 3D-only
selection in the panel.

---

## Case 6 — Camera: remount-for-reset (Step 8) fights no-remount-for-stability (autoplay) (F2-C)

**Discovery (F2-C, camera stabilization).** Step 8 resolved Edge_#4 Case 6 by
remounting the whole `<Canvas>` on every frame switch (`<Viewer3D key={frame.id}>`)
so OrbitControls resets cleanly — good for a *deliberate* COCO frame jump. But
autoplay switches frames every 500 ms, so the remount **resets the camera ~2×/s**:
the view bounces and any orbit the user set is wiped each frame. The very thing
that gives COCO a clean reset makes the nuScenes sequence unwatchable.

**A second, subtler trap.** Simply making the `key` stable (no remount) is not
enough. `Viewer3D` fits the camera to the box cloud with `frameBoxesForCamera`
and passes the result as OrbitControls `target`. If that is recomputed each frame
from the *moving* boxes, the `target` changes every frame and OrbitControls
**re-aims** — the camera drifts/re-frames per frame even without a remount,
defeating the goal.

**Resolution (decision 3-A, fixed camera).**
- **Dataset-aware key:** COCO keeps `key={frame.id}` (remount-reset, unchanged);
  nuScenes uses one **stable** key so the Canvas + OrbitControls persist across
  frames and autoplay — the camera holds and the boxes move within a still view
  (the "objects move" effect).
- **Freeze the framing:** the nuScenes `frameBoxesForCamera` result is captured at
  **mount** (`useRef(frame).current` + `useMemo`) so `target` is stable across
  frames; the short scene's box cloud is consistent enough that frame 0's fit
  frames the whole sequence.

**Render verification.** Across two autoplay screenshots (Frame 6 → Frame 10) the
camera viewpoint/grid/orientation are pixel-stable while the box cloud clearly
changed — camera fixed, boxes moving. COCO frame switches still reset as before.

**Extension seam (camera-follow, 3-B, deferred).** `target` is the single aim
point. To make the camera FOLLOW the selected object later, compute `target` from
the selected box's current center each frame instead of the frozen framing — no
other wiring changes, since the prop already flows to OrbitControls. Left
commented, not built (no speculative code, per CLAUDE.md).

---

## Case 7 — Camera follow must FALL BACK to fixed, and only the pivot moves (F2-D-1)

**Discovery (F2-D-1, wiring the follow mode).** F2-D-1 adds an opt-in camera that
keeps the selected object centered by aiming OrbitControls `target` at it each
frame (the seam left in Case 6). Two ways this could misbehave if built naively:

1. **Aiming at nothing.** The selected instance can be absent in the current
   frame — it left the camera, was distance/class-filtered out, or nothing is
   selected at all. Feeding OrbitControls a `target` of "the selected box center"
   would then be `undefined`/garbage and the camera would jump to the origin or
   crash.
2. **Moving the camera, not just the pivot.** It would be easy to also move the
   camera POSITION toward the object (a chase cam). That breaks the "3rd-person,
   user-orbitable" intent and fights the user's orbit/zoom.

**Resolution (decision: toggle + snap + fixed fallback).**
- A pure `selectFollowTarget(detections3D, selectedId)` returns the selected box's
  center, or **`null`** when there is no selection or the id is absent in this
  frame (unit-tested). `Viewer3D` does `target = followTarget ?? frozenFraming`,
  so follow **degrades to the F2-C fixed camera** whenever there is nothing to
  follow — no jump to empty space, no crash. The fixed mode is the default and the
  fallback, so the hard edges resolve to already-verified behavior.
- Only `target` (the OrbitControls pivot) tracks; the camera **position** stays
  the one-time `<Canvas>` init. OrbitControls then keeps the camera in place and
  re-aims at the new pivot (its `update()` recomputes the offset from the new
  target within the same frame), so the view stays 3rd-person and orbitable.
- Follow is a separate page-level **VIEW flag** (`cameraMode`), never a selection
  field → Immutable Rule #2 (single `selectedObjectId`) is untouched.

**Accepted limitation.** Because the position is frozen, an object that travels a
long way still **recedes** (the camera re-aims but doesn't chase). Fine for the
short scene-0916 sequence; a position-tracking chase cam was out of scope.

**Render verification.** Toggling Follow visibly re-aims the camera onto the
selected box (the box cloud shifts so the selected box moves toward centre);
selection persists across frames (F2-C tracking) so it stays centred as frames
advance; toggling back to Fixed restores the frozen overview; the Follow button is
hidden on COCO. (Pure `selectFollowTarget` is unit-tested; the camera itself is UI,
render-verified — same policy as Case 3/6.)

---

## Case 8 — Box tween must stay honest: smooth only while playing; points stay snapped (F2-D-2)

**Discovery (F2-D-2, the reason tween was deferred twice).** F2-D-2 interpolates
each box between keyframes (`lerpVec3` position + `slerpQuat` rotation) so autoplay
glides instead of snapping. But an interpolated in-between pose is **invented**, not
measured — nuScenes only measures the ~2 Hz keyframes. Showing a made-up pose as if
it were data would violate Immutable Rule #6 (never misrepresent 3D provenance), and
the frame still wears a **"Measured"** badge. This honesty cost is exactly why tween
was deferred at Step 9.5 and again at F2-C.

**A second, physical dissonance.** The boxes can be tweened, but the **LiDAR cloud
is a single per-keyframe sweep** — there is no honest way to interpolate raw sensor
returns. So if both moved, they'd desync; if the box glides while the points snap,
they visibly disagree for 0.5 s.

**Resolution (decision: tween only while playing; points snap; all boxes).**
- The tween is **gated on `playing`**. During autoplay boxes glide; the moment the
  user **pauses or scrubs**, every box snaps to its EXACT current measured keyframe
  pose (the `useFrame` branch falls through to the measured pose, `t` effectively
  0). So every *statically-viewed* pose is a real measurement, and the "Measured"
  badge keeps referring to the keyframe data — the made-up poses exist only as
  motion, never as an inspectable state. No extra "interpolating" label was needed
  (the honesty is structural, not a disclaimer).
- The per-box clock **resets on each keyframe switch** (`frameId` change) and on a
  play restart, so a tween always *starts* on a measured pose and *ends* on the next
  measured pose (`t` clamped to `[0,1]`) — continuity holds because the next frame's
  `detection.center` is what this frame tweened toward.
- The **LiDAR cloud stays per-keyframe snap** (accepted box-smooth / points-snap
  dissonance — documented, the truthful choice).
- Objects with **no match in the next keyframe** (appear / disappear) simply hold
  their current pose (the next-pose Map lookup is `undefined` → tween skipped) — no
  jump, no NaN. **All** visible boxes tween (cost negligible at ~58 boxes).

**Rule #3 note.** The interpolation math is pure `lib/geometry/interpolation.ts`
(`lerpVec3` hand-rolled; `slerpQuat` a thin wrapper over `THREE.Quaternion.slerp`
for correct shortest-arc), unit-tested; the `useFrame` clock + data threading are UI
(render-verified).

**Render verification.** Under autoplay the boxes advance with the sequence while
points + boxes stay co-located; pausing leaves boxes on clean measured poses; COCO
(no tween props, no `playing`) is unchanged. The glide itself is a per-frame
animation not captured in stills — its correctness rests on the unit-tested math +
the play-gated wiring.

---

## Notes on decisions that did NOT become edge cases

- **Axis convention** `(x,y,z)→(-y,z,-x)`: chosen up front (det = +1, handedness
  preserved). The residual "which way is forward initially" is a camera-framing
  concern for the UI session, not a correctness issue — no edge case.
- **Quaternion order** `[w,x,y,z]` (nuScenes) vs `[x,y,z,w]` (Three.js): handled
  at a single conversion point (`quatNuToThree`); absent rotation → identity.
  Locked by tests, not an in-the-wild surprise.
