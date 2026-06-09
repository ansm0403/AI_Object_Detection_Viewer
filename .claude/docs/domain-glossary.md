# AI/3D 용어집
## Point Cloud, Bounding Box, COCO 등 용어 정의

# Domain Glossary

Beginner-friendly definitions of 3D and AI terms used in this project.
Always read this before explaining a 3D/AI concept to the user.

## AI / Detection Terms

**Object Detection**
The task of locating and classifying objects in an image. Output: list of
{class, confidence, location} per detected object.

**Bounding Box (bbox)**
A rectangular box marking where an object is.
- 2D bbox: rectangle on an image, usually `[x, y, width, height]` or `[x1, y1, x2, y2]`.
- 3D bbox: box in 3D space, usually `{center, size, rotation}`.

**Confidence (score)**
How sure the model is about a detection, from 0 to 1.
Filtering by threshold (e.g., 0.5) removes low-confidence predictions.

**Class / Category**
The label of a detected object (e.g., "car", "person").

**Annotation**
Human-created label data attached to an image, used for training or evaluation.
In this project, we consume annotations as if they were detection results.

**COCO (Common Objects in Context)**
A widely-used object detection dataset and JSON format.
Structure: `images[]`, `annotations[]`, `categories[]`. **2D only.**

## 3D / Graphics Terms

**Point Cloud**
A set of 3D points `{x, y, z}` representing space. Each point may have extra
attributes like intensity or color. Real point clouds usually come from LiDAR.
In this project there are TWO kinds: **COCO frames** show an *estimated* (fake)
cloud scattered inside each estimated bbox; **nuScenes frames** show a *real*
measured LiDAR cloud (F2-B). They are distinguished internally by `Point3D.detectionId`
— estimated points carry the owning bbox's id (and follow its filter), real LiDAR
points carry none (environment, always shown).

**LiDAR**
A sensor that measures distance with laser, producing a real point cloud (it spins,
firing laser beams and timing the reflections). nuScenes frames now show the real
LiDAR_TOP cloud (F2-B); COCO has no sensor so its cloud stays estimated.

**Three.js**
A JavaScript 3D library that wraps WebGL.

**WebGL**
A browser API for GPU-accelerated 3D rendering.

**React Three Fiber (R3F)**
A React renderer for Three.js. Lets you write 3D scenes using JSX components.

**@react-three/drei**
A helper library for R3F. Provides ready-made components like `<OrbitControls />`.

**OrbitControls**
A camera controller that lets users orbit, pan, and zoom around a target point with the mouse.

**`<Html>` (drei)**
A drei helper that pins a normal HTML/CSS node to a 3D coordinate inside the
scene. Each frame it projects that 3D point to screen space and moves the DOM
node there, so a styled `div` "hangs" off a point and tracks it as the camera
orbits/zooms — like a name tag over a game character or a map pin. Bridges the
2D (HTML/React) and 3D (WebGL) worlds without drawing text as 3D geometry.
- Without `distanceFactor` it keeps a constant on-screen size (a UI label);
  with it, the node scales with 3D distance.
- It renders a DOM overlay ON TOP of the `<canvas>`, so if it captures pointer
  events it can swallow the canvas's empty-space click (`onPointerMissed`) and
  silently break deselect — use `pointer-events-none` unless the label is meant
  to be interactive. `occlude` optionally hides it when geometry is in front.
Used in F1-C for bbox info labels (class + confidence). See Edge_F#1 Case 5.

**BufferGeometry**
A Three.js class storing geometry as raw arrays (positions, colors, etc.).
Efficient for large data like point clouds.

**Per-vertex Color Attribute**
A `color` array on a `BufferGeometry` holding one RGB triple (0..1, not 0..255)
per vertex/point, uploaded to the GPU alongside `position`. Lets every point
carry its own color instead of one uniform material color. Used in F1-A to color
each point cloud point by its depth.

**Vertex Colors (material flag)**
A material setting (`vertexColors` on `pointsMaterial`) that tells WebGL to shade
each vertex by its own color attribute. The material's base `color` is then
MULTIPLIED into the per-vertex color, so it must stay white (`#ffffff`, the
multiplicative identity) for the per-vertex colors to show unchanged.

**Color Ramp**
A gradient between two (or more) colors used to encode a scalar value as color —
here, mapping a point's depth `z` to a near→far color. F1-A normalizes `z` into
`[0,1]` and linearly interpolates between a "near" and a "far" color.

**Tone Mapping**
A final image step that compresses a scene's brightness range into what a screen
can show, often with a filmic curve (e.g. ACES) that desaturates bright colors
toward white for a cinematic look. Great for photoreal scenes, bad for data viz
where you want exact colors. R3F enables ACES by default; F1-A turns it off with
`<Canvas flat>` so the depth colors render true. See Edge_F#1 Case 3.

**Domain Fitting (ramp domain)**
The input value range a ramp is normalized over. If the domain is much wider than
where the data actually lies, the data maps to a tiny slice of the ramp and the
color variation becomes invisible. F1-A fits the domain PER FRAME to that frame's
real point-z `[min, max]` instead of the estimator's theoretical `[1, 8]`, so the
gradient fills the whole ramp. See Edge_F#1 Case 1.

**Raycaster**
A Three.js helper that shoots a virtual ray from a point (e.g. the mouse on the
screen) into the 3D scene and reports which meshes it intersects, nearest first.
R3F uses it every pointer move to decide which mesh the cursor is "over". Thin
line segments are hard to hit, so this project gives each 3D bbox an invisible
full-volume mesh as the ray target (Step 5 for clicks, reused in F1-B for hover).

**Pointer Events (R3F)**
Mouse/touch events R3F forwards to a mesh based on the raycaster: `onClick`,
`onPointerOver` (ray enters the mesh), `onPointerOut` (ray leaves it), etc.
`event.stopPropagation()` stops the event from also reaching meshes behind the
front one — used in F1-B so only the front box highlights when boxes overlap.
F1-B's hover state hangs off the same invisible click mesh.

**Mesh**
A 3D object made of geometry (shape) + material (color/texture).

**InstancedMesh**
A mesh that renders many copies of the same geometry efficiently in one draw call.
Useful for many similar objects (e.g., 50 3D bboxes).

## Real-3D / Coordinate Terms (F2 — nuScenes)

Introduced for the F2 nuScenes integration. Background: `docs/learning/REAL_3D_DATASET_STUDY.md`.

**Ego Vehicle (에고 차량)**
The vehicle carrying all the sensors — the car doing the recording. "Ego" is Latin for "self."
In autonomous-driving datasets, every other object's position is expressed *relative to the ego
vehicle* (see Ego Frame below). In this project the ego is always at the origin (0, 0, 0) of
the 3D viewer; other boxes appear at their measured distance and direction from it.
Distinct from the ego *frame* (which is the coordinate system): the ego vehicle is the physical
thing; the ego frame is the mathematical abstraction anchored to it.

**Coordinate Frame (좌표계)**
An agreed origin `(0,0,0)` and axis directions for measuring positions. The SAME real
point gets DIFFERENT numbers in different frames. A "transform" is the rule that converts
coordinates from one frame to another. Analogy: "2 m to my right" vs "2 m to my friend's
left" describe one outlet with different numbers.

**Global / Ego / Sensor Frame**
The three frames nuScenes uses. **Global** = fixed to the world/map. **Ego** = fixed to the
car (car at origin). **Sensor** = fixed to one device (a camera or the LiDAR). nuScenes
annotations live in the **global** frame, so rendering relative to the car needs a
`global → ego` transform (and `ego → sensor` to involve a specific camera/LiDAR).

**Calibration**
Knowing where each sensor sits and how it is oriented relative to the car, expressed as
transform matrices. Lets you convert a point from one sensor's frame to another's (or to the
car). In nuScenes this is split across `ego_pose` and `calibrated_sensor`.

**ego_pose**
A nuScenes record giving the car's position + orientation in the **global** frame at one
timestamp. Because the car moves, ego_pose differs every frame. Used for `global ↔ ego`.

**calibrated_sensor**
A nuScenes record giving a sensor's fixed position + orientation relative to the **car**,
plus (for cameras) the `intrinsic` matrix. Used for `ego ↔ sensor` and projection.

**Quaternion**
A 4-number `[x, y, z, w]` representation of a 3D rotation ("rotation axis + how much"). Used
instead of 3 Euler angles because angles suffer gimbal lock, order-dependence, and ugly
interpolation. Three.js is quaternion-native (`mesh.quaternion.set(x,y,z,w)`), and nuScenes
stores box orientation this way. A KITTI single yaw angle converts to a quaternion in one line.
Stored in this project as the optional `Detection3D.bbox3D.rotation`.

**Camera Intrinsics (intrinsic matrix, K)**
A 3×3 matrix describing a camera's lens (focal length, image centre). The final step that turns
a 3D point already in the camera's frame into a 2D pixel.

**Extrinsics**
The position + orientation of a camera relative to the world/car (the transform INTO the camera
frame). Intrinsics then map that to pixels. Extrinsics + intrinsics together = full projection.

**Projection (3D → 2D)**
Computing where a 3D point lands as a pixel on a camera image: transform the point into the
camera frame (extrinsics), then apply the intrinsic matrix and divide by depth. F2 projects each
3D bbox to get a 2D box, because nuScenes provides no 2D boxes — this is how the 2D↔3D sync
signature is preserved on nuScenes data. A point is "in front of" the camera when its
camera-frame depth (z) is positive; points behind (z ≤ 0) project to garbage and are culled.

**AABB (Axis-Aligned Bounding Box)**
The smallest upright (un-rotated) rectangle that contains a set of points — here, the min/max of
the eight projected 3D-box corners. F2 uses an AABB for the projected 2D box because our
`Detection2D.bbox {x, y, width, height}` is axis-aligned by definition, so it drops straight into
the existing SVG overlay. A tightly-rotated object is enclosed a little loosely, but selection and
2D↔3D sync are unaffected. (An *oriented* 2D box would need a different, 4-corner type.)

**Handedness (right-handed coordinate frame)**
Whether a frame's axes follow the right-hand rule (x × y = z). A transform with matrix determinant
+1 is a pure rotation and preserves handedness; a determinant of −1 mirrors it. The nuScenes→Three.js
axis flip is deliberately det = +1 so box orientations / quaternions are not accidentally mirrored.

**Prepped JSON (offline prep contract)**
The compact static JSON our offline build-time script (F2) emits from nuScenes-mini's relational
tables. It carries RAW nuScenes-native values (quaternion `[w,x,y,z]`, size `[w,l,h]`, GLOBAL-frame
boxes, `ego_pose`, `calibrated_sensor` + intrinsic, `instance` token) and does NO coordinate math —
all transforms live in `lib/` and are unit-tested (Immutable Rule #3). It is the contract the script
must satisfy; the browser parses it like COCO. Schema: `lib/nuscenes/types.ts`.

**track id / instance token**
A stable id for the SAME physical object across frames of a sequence. nuScenes' `instance` token
provides it. It is what lets `selectedObjectId` survive a frame change (F2-C) and makes [[autoplay]]
show real motion — COCO has no such cross-frame identity.

**autoplay** *(F2-C)*
Stepping through a frame sequence on a timer so the scene "plays" like a video. Here it advances the
selected keyframe every `AUTOPLAY_INTERVAL_MS = 500` ms (≈ nuScenes' real ~2 Hz keyframe cadence) and
loops at the end. The *which-frame-next* decision is the pure `nextFrameIndex` in `lib/sequence`; the
React `setInterval` only owns the timing. Meaningful only with a **track id** (so the same object is
seen moving) — wired for nuScenes, hidden on COCO (independent frames → a slideshow, not motion).

**tween / lerp / slerp** *(F2-C snap → F2-D-2 shipped)*
*Tween* (in-be**tween**ing) = generating smooth intermediate frames between two keyframes so motion
looks continuous instead of snapping. *lerp* (linear interpolation) blends two positions: `a + (b−a)·t`
for `t ∈ [0,1]`. *slerp* (spherical linear interpolation) is the rotation equivalent — it interpolates
between two **quaternions** along the shortest arc at constant angular speed (a plain lerp of
quaternions would distort orientation). F2-C shipped **snap**; **F2-D-2** adds the box tween: during
autoplay each box lerps its center + slerps its rotation between consecutive keyframes (pure
`lerpVec3`/`slerpQuat` in `lib/geometry/interpolation.ts`), paced by a `useFrame` clock advancing
`t ∈ [0,1]` over `AUTOPLAY_INTERVAL_MS`. **Honesty (Rule #6):** an interpolated in-between pose is NOT
a measurement, so the tween runs ONLY while playing — paused / scrubbing shows the exact measured
keyframe. The LiDAR cloud stays per-keyframe (box-smooth / points-snap dissonance, accepted). See
Edge_F#2 Case 8.

**Camera Follow (look-at target tracking)** *(F2-D-1)*
An opt-in 3D-viewer camera mode that keeps the SELECTED object centered as it moves across keyframes.
[[OrbitControls]] orbits the camera around a `target` (its look-at pivot); follow mode just moves that
pivot to the selected box's current center each frame, so the camera stays 3rd-person and
user-orbitable (the camera POSITION is unchanged — only the aim point tracks; this is NOT a
first-person / dashcam view). The pure lookup is `selectFollowTarget(detections3D, selectedId)` →
center | null; `null` (nothing selected, or the object isn't in this frame) falls back to the fixed
overview framing, so follow never aims at empty space. The default + fallback is the F2-C fixed camera.
Uses a [[track id / instance token]] indirectly (it follows whatever `selectedObjectId` points at,
which on nuScenes is a stable instance). See Edge_F#2 Case 7.

**nuScenes**
A modern (2019) autonomous-driving dataset: 360° cameras + LiDAR + radar, 3D annotations in the
global frame, organized as a relational token graph (`sample`, `sample_data`, `ego_pose`,
`calibrated_sensor`, `sample_annotation`, `instance`, `category`). Real measured 3D — the F2
upgrade from COCO's estimated 3D. **3D-only** (no 2D boxes; we project) and large (we use the
**mini** split, a few keyframes, prepped offline into static JSON).

**`.pcd.bin` (LiDAR sweep file)** *(F2-B)*
nuScenes stores each LiDAR sweep as a header-less binary blob: point after point, each point being
**5 `float32`** = `x, y, z, intensity, ring` (20 bytes/point, little-endian). A full sweep is ~34k
points. Decoding needs only Python's stdlib `struct` (unpack `'<fffff'` in a loop) — no numpy or
nuscenes-devkit. We keep `x, y, z` and drop intensity/ring. The points are in the LiDAR **sensor
frame** and must be transformed to align with the boxes (see Global / Ego / Sensor Frame,
`sensorToGlobal`).

**Decimation (point-cloud downsampling)** *(F2-B)*
Reducing a point cloud's size by keeping a representative subset. A 34k-point sweep × 10 frames is too
big/heavy to ship and draw, so the offline prep decimates each sweep to ~6.5k points. Decimation is
**subsampling, not a coordinate transform**, so doing it in the prep script does not violate Immutable
Rule #3 (the actual alignment math stays in `lib/`). Methods include uniform-random (simple, but
density follows the raw cloud — clumpy near the sensor) and voxel grid (even spatial density).

**Voxel Grid Downsampling** *(F2-B)*
A decimation method: overlay a 3D grid of cubic cells ("voxels", e.g. 0.6 m per side) and keep at most
one point per cell. This spreads the kept points evenly through space — near and far regions end up at
similar density — which reads cleaner than uniform-random sampling (where the already-dense near-sensor
returns stay dense). The cell size trades density for count: bigger cells → fewer, more-spread points.
A LiDAR sweep is spatially spread, so a fairly coarse 0.6 m voxel is what lands ~6.5k points.

## Camera Model Terms

**Pinhole Camera Model (핀홀 카메라 모델)**
The standard mathematical model of how a camera captures 3D space onto a 2D image. Imagine a
box with a single tiny hole (the "pinhole") in one wall: light from every point in the scene
travels through that hole and lands on the opposite wall, forming an image.

Key behaviors that matter for this project:
- **Distance → size**: an object twice as far away appears half as tall in the image.
  (A car at 10 m fills more of the frame than the same car at 30 m.)
- **FOV boundary**: anything outside the camera's angular cone is not captured at all —
  even a 1 m-tall sign *right beside* the car is invisible if it's outside the FOV angle.
- **Behind the camera**: objects with a negative depth (behind the pinhole) project to garbage
  and are culled. `projectCornersToBbox` in this project guards this case.
Real cameras use lenses (not a literal pinhole), but the same projection math applies once lens
distortion is corrected. The **intrinsic matrix K** encodes the pinhole parameters (focal
length, image centre). See also: Camera Intrinsics, Projection.

**Field of View (FOV, 시야각)**
The angular cone of the world a camera can capture. nuScenes CAM_FRONT is approximately 70°
horizontal. A physical object *inside* that cone is visible in the 2D image; one *outside* it
is invisible even if it is directly adjacent to the ego vehicle.
Consequence for this project: a 3D-measured box may have no 2D projection (it is outside the
70° FOV), so the 2D viewer shows nothing for that object while the 3D viewer still renders its
box. The `Selected` panel shows "—" for the 2D bbox row in this case (Edge_F#2 Case 1).

**Chase Cam (체이스 캠, 3인칭 추격 시점)**
The 3D viewer's default camera perspective: the Three.js camera is placed *behind and above*
the ego vehicle's box cloud, looking forward and downward at the scene — identical to the
"follow cam" used in car-racing video games. Computed by `frameBoxesForCamera`
(`lib/geometry/camera-framing.ts`): the camera sits at `cloud_centre + back + up`, where
`back` and `up` scale with the cloud's horizontal spread so the whole scene fits in view.

This is fundamentally different from the 2D camera (which is mounted on the ego, looking
horizontally forward at ~eye level). Because of that difference, the *same ego-relative
position* looks very different in the two views:

```
2D view (front camera):       3D view (chase cam):
┌──────────────────────┐      👁 (behind + above)
│  namu  [🚗]  namu    │        ╲
│    (car fills image) │         ╲
└──────────────────────┘     ─────[ego]──[🚗]─────
  car appears LARGE             car appears SMALL
```

This visual discrepancy is expected and is not a bug. The coordinate data is identical in both
views; only the camera vantage point differs.

## State Management Terms

**Zustand**
A small, simple state management library for React. Hook-based, no boilerplate.

**Single Source of Truth**
The principle that one piece of data lives in exactly one place.
In this project: `selectedObjectId` is the only place object selection state lives.

## Project-Specific Terms

**Estimated 3D**
3D coordinates inferred from 2D bbox data, not from real depth sensors.
This is the core simplification of this portfolio project.

**Frame**
A single unit of data: one image + its 2D detections + estimated 3D detections + estimated point cloud.

**2D ↔ 3D Synchronization**
When the user selects an object in the 2D view, the same object highlights in the 3D view,
and vice versa. Implemented via shared `selectedObjectId`.