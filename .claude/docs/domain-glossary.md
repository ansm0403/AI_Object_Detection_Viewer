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
Not used in this project.

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