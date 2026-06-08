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
In this project, point clouds are estimated (fake), not real LiDAR.

**LiDAR**
A sensor that measures distance with laser. Produces real point clouds.
Point clouds are estimated (fake) today; real LiDAR points are planned in F2 (nuScenes).

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
provides it. It is what lets `selectedObjectId` survive a frame change (F2-C) and makes autoplay
show real motion — COCO has no such cross-frame identity.

**nuScenes**
A modern (2019) autonomous-driving dataset: 360° cameras + LiDAR + radar, 3D annotations in the
global frame, organized as a relational token graph (`sample`, `sample_data`, `ego_pose`,
`calibrated_sensor`, `sample_annotation`, `instance`, `category`). Real measured 3D — the F2
upgrade from COCO's estimated 3D. **3D-only** (no 2D boxes; we project) and large (we use the
**mini** split, a few keyframes, prepped offline into static JSON).

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