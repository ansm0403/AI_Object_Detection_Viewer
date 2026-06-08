# 데이터 구조, 상태 흐름
## 데이터 모델, 상태 흐름, 폴더 구조 상세

# Architecture

**Current Status: MVP (Steps 1–11) complete.** Post-MVP: **F1 ✅** (visual impact pass — point-cloud
depth color, 3D hover, `<Html>` labels). **F2-A ✅ Done** (nuScenes real-3D): lib core (transforms /
projection / parser), offline prep + sample data (`scripts/prep_nuscenes.py` →
`public/sample-data/nuscenes/`, scene-0916), **and UI integration** — dataset switcher +
Estimated/Measured badge (Header), measured 3D boxes with quaternion rotation, projected 2D boxes +
selection sync, a `lib/selectors` distance filter (per-dataset slider swap), and per-dataset 3D camera
framing + fog. **F2-B ✅ Done** (real LiDAR point cloud): offline `.pcd.bin` decode + voxel-grid
decimation in the prep script, `sensorToGlobal` transform, aligned `pointCloud` from the parser,
optional `Point3D.detectionId`, and the `selectVisiblePoints` selector (LiDAR/environment points always
shown). **F2-C ✅ Done** (sequence + tracking + autoplay): the `instance` token gives cross-frame
identity, so on nuScenes `selectedObjectId` SURVIVES a frame switch (tracking; COCO still clears —
unstable ids), a Timeline play/pause control steps the keyframes at ~2 Hz (pure `nextFrameIndex` in
`lib/sequence/`), and the nuScenes 3D camera no longer remounts/bounces per frame (dataset-aware
`Viewer3D` key + frozen initial framing). 190 tests. **F2 complete.**
For step-by-step history and per-Step decisions, see `mvp-checklist.md` (🔒 frozen).
Post-MVP feature work (in progress) is tracked in `post-mvp-checklist.md`.
For the original vision behind these decisions, see `docs/PROJECT_DESIGN.md` (read-only).
For Step 9.5 UI feature candidates and adopt/exclude rationale, see `docs/etc/NEW_UI.md`.

## Folder Structure

The project is an **nx monorepo**. All Step 1–10 work happens inside the
`ai_detection_viewer_client` Next.js app. The backend app is out of MVP scope.

```
apps/ai_detection_viewer_client/
├── src/
│   ├── app/                # Next.js app router pages
│   │   └── page.tsx        # per-dataset load (COCO: parseCoco→enrich / nuScenes: parseNuScenes, F2-A) → auto-select frame → Header(switcher+badge) + Filters + Viewer2D + <Viewer3D/> + ObjectList + AnalyticsPanel + Timeline. Derives 2D + 3D visible-id sets (∩ distance filter). F2-C: `tracksAcrossFrames` (nuScenes) drives dataset-aware frame-switch selection (keep vs clear) + dataset-aware `Viewer3D` key (stable vs `frame.id`) + an `isPlaying` autoplay timer (nextFrameIndex @ ~2 Hz).
│   ├── components/
│   │   ├── viewer-2d/      # ✅ Step 2, 5 — 2D image + SVG overlay, selection sync
│   │   │   ├── Viewer2D.tsx    # props: frame, selectedId?, onSelect?
│   │   │   └── index.ts        # barrel
│   │   ├── viewer-3d/      # ✅ Step 4, 5 — R3F canvas, point cloud, 3D bboxes, selection sync
│   │   │   ├── Viewer3D.tsx    # props: frame, selectedId?, onSelect?; hosts Canvas
│   │   │   ├── Scene.tsx       # lights + PointCloud + BBox3D + OrbitControls; passes selection
│   │   │   ├── PointCloud.tsx  # THREE.BufferGeometry via useMemo + dispose; per-vertex depth color (F1-A)
│   │   │   ├── BBox3D.tsx      # EdgesGeometry wireframe + invisible click mesh; selection highlight + hover tint (F1-B); mounts BBoxLabel (F1-C)
│   │   │   ├── BBoxLabel.tsx   # ✅ F1-C — drei <Html> info pill (class + confidence) anchored above the box; pointer-events-none
│   │   │   ├── HintBox.tsx     # ✅ Step 9.5 — corner mouse-controls overlay (plain HTML sibling of Canvas)
│   │   │   └── index.ts        # barrel
│   │   ├── object-list/    # ✅ Step 6 — detection list panel; selection sync with 2D/3D
│   │   │   ├── ObjectList.tsx  # props: frame, selectedId?, onSelect?, visibleIds?
│   │   │   └── index.ts        # barrel
│   │   ├── filters/        # ✅ Step 7 — confidence slider + class toggles
│   │   │   ├── Filters.tsx           # props: classes, threshold, visibleClasses, filterMode, maxDistance, callbacks
│   │   │   ├── ConfidenceSlider.tsx  # 0..1 range input (shown for COCO)
│   │   │   ├── DistanceSlider.tsx    # ✅ F2-A — metres range input (shown for nuScenes; swapped with ConfidenceSlider by filterMode)
│   │   │   ├── ClassToggles.tsx      # color chips per class
│   │   │   └── index.ts              # barrel
│   │   ├── timeline/       # ✅ Step 8 — horizontal thumbnail strip
│   │   │   ├── Timeline.tsx     # props: frames, selectedFrameId, onSelectFrame; (F2-C) optional isPlaying/onTogglePlay → play/pause button (nuScenes only)
│   │   │   └── index.ts         # barrel
│   │   ├── header/         # ✅ Step 9.5 Phase 2 — app title + frame meta line
│   │   │   ├── Header.tsx       # props: frameIndex, frameCount, detectionCount
│   │   │   └── index.ts
│   │   ├── analytics/      # ✅ Step 9.5 Phase 3 — right-rail analytics container
│   │   │   ├── AnalyticsPanel.tsx  # composes Inspector + charts
│   │   │   └── index.ts
│   │   ├── charts/         # ✅ Step 9.5 Phase 3 — pure SVG / CSS charts (no Recharts)
│   │   │   ├── ConfidenceHistogram.tsx  # SVG bars + slider-threshold overlay
│   │   │   ├── ClassCountBar.tsx        # CSS horizontal bars; clicking toggles class
│   │   │   └── index.ts
│   │   └── inspector/      # ✅ Step 9.5 Phase 3 — selected object info card
│   │       ├── SelectedObjectInfo.tsx   # class / confidence / bbox / frame; placeholder when none
│   │       └── index.ts
│   ├── lib/
│   │   ├── coco/           # COCO JSON parsing → internal Frame[]
│   │   │   ├── parser.ts
│   │   │   ├── parser.test.ts
│   │   │   ├── types.ts    # raw COCO schema types
│   │   │   └── index.ts    # barrel
│   │   ├── geometry/       # ✅ Step 4 — 2D bbox → 3D bbox/point cloud estimation
│   │   │   ├── bbox-estimator.ts            # Detection2D → Detection3D math
│   │   │   ├── bbox-estimator.test.ts       # 15 tests
│   │   │   ├── pointcloud-generator.ts      # scatter points within bbox volume
│   │   │   ├── pointcloud-generator.test.ts # 8 tests (incl. detectionId lock)
│   │   │   ├── depth-color.ts               # ✅ F1-A — pure depthToColor + depthRange (per-frame z domain)
│   │   │   ├── depth-color.test.ts          # 15 tests (endpoints, monotonic, clamp, degenerate, range)
│   │   │   ├── transforms.ts                # ✅ F2 — global→ego + axis convention z-up→y-up (THREE Quaternion/Matrix4)
│   │   │   ├── transforms.test.ts           # 13 tests — global→ego yaw, axis flip, quaternion order/absent, size reorder
│   │   │   ├── projection.ts                # ✅ F2 — ego→camera + intrinsic; 8-corner AABB; behind-camera/off-screen cull
│   │   │   ├── projection.test.ts           # 10 tests — known 3D→pixel, behind-camera null, off-screen clamp
│   │   │   ├── camera-framing.ts            # ✅ F2-A — frameBoxesForCamera(): fit 3D camera (pos+target) to the nuScenes box cloud
│   │   │   ├── camera-framing.test.ts       # 5 tests — center on cloud, behind+above, ground-cap, wider→farther
│   │   │   ├── frame-enricher.ts            # orchestrator: enrichFrame() (stamps source:'coco-estimated')
│   │   │   └── index.ts                     # barrel
│   │   ├── nuscenes/       # ✅ F2 (parser+types) — prepped nuScenes static JSON → internal Frame[]
│   │   │   ├── parser.ts                     # ✅ parseNuScenes: prepped JSON → Frame[] (NOT raw relational tables)
│   │   │   ├── parser.test.ts                # 10 tests — id share (Rule #1), source/confidence, behind-camera 2D drop, defensive
│   │   │   ├── types.ts                      # ✅ prepped-JSON schema (nuScenes-native: quat [w,x,y,z], size [w,l,h], global)
│   │   │   └── index.ts                      # barrel
│   │   ├── selectors/      # ✅ Step 7 — pure store derivations
│   │   │   ├── visible-detections.ts        # filter by threshold + visibleClasses (2D ids; + selectVisibleDetectionIds3D for the 3D viewer, F2-A)
│   │   │   ├── visible-detections.test.ts   # 11 tests; locks permissive-empty semantic
│   │   │   ├── distance-filter.ts           # ✅ F2-A — detectionDistance + selectIdsWithinDistance (pure)
│   │   │   ├── distance-filter.test.ts      # 10 tests — magnitude, inclusive boundary, NaN→empty
│   │   │   ├── confidence-buckets.ts        # ✅ Step 9.5 Phase 3 — histogram buckets (BUCKET_COUNT=10)
│   │   │   ├── confidence-buckets.test.ts   # 7 tests; locks bucket count + boundary rules
│   │   │   ├── class-counts.ts              # ✅ Step 9.5 Phase 3 — class → count map (first-appearance order)
│   │   │   ├── class-counts.test.ts         # 5 tests; locks key-by-class + iteration order
│   │   │   └── index.ts                     # barrel
│   │   ├── ui/             # ✅ Step 9 — shared UI-layer constants (no React/Zustand/Three.js)
│   │   │   ├── class-colors.ts              # CLASS_COLORS map (+truck/bus/motorcycle F2-A), getClassColor(), DEFAULT_COLOR, SELECTED_COLOR
│   │   │   └── distance.ts                  # ✅ F2-A — DISTANCE_MAX / DISTANCE_STEP (distance-filter slider + store default)
│   │   ├── sequence/       # ✅ F2-C — keyframe-sequence playback logic (pure; no React/Three.js)
│   │   │   ├── autoplay.ts                   # nextFrameIndex(index, count, {loop}) + AUTOPLAY_INTERVAL_MS (~2 Hz)
│   │   │   ├── autoplay.test.ts              # 8 tests — advance, loop-wrap, stop-at-end, not-found→0, single/empty/stale
│   │   │   └── index.ts                      # barrel
│   │   └── types/          # Frame, Detection2D, Detection3D, Point3D
│   └── store/          # ✅ Step 3 — Zustand store (UI state only)
│       ├── viewer-store.ts
│       ├── viewer-store.test.ts
│       └── index.ts        # barrel
├── tests/
│   └── integration/        # ✅ Step 5, 8 — cross-module contract tests
│       ├── selection-sync.test.ts  # 5 tests
│       └── frame-switch.test.ts    # 3 tests — Edge_#5 Case 6 contract
├── public/
│   └── sample-data/        # sample COCO JSON + frame images
│       ├── sample.json
│       ├── frame_001.jpg ~ frame_010.jpg
│       └── nuscenes/       # ✅ F2 — offline-generated (scripts/prep_nuscenes.py)
│           ├── nuscenes.json    # prepped (scene-0916, 10 keyframes, 583 boxes + ~6.5k LiDAR pts/frame); NuScenesPrepped schema. Compact (no indent) — the inline lidar.points arrays dominate size (~1.4 MB).
│           └── cam_front/       # 10 CAM_FRONT keyframe jpgs
└── vitest.config.ts        # include: src/**/*.test.ts + tests/**/*.test.ts

scripts/                    # ✅ F2 — offline, build-time only (repo root, like Step 11's
  prep_nuscenes.py          #   generate_predictions.py). Stdlib-only (NO nuscenes-devkit/numpy): JOINs
                            #   the nuScenes-mini tables (sample/sample_data/ego_pose/calibrated_sensor/
                            #   sample_annotation/instance/category) → public/sample-data/nuscenes/.
                            #   F2-B: also decodes LIDAR_TOP .pcd.bin (struct, 5×float32/pt) and
                            #   voxel-grid decimates it. Copies RAW values only, no coordinate math
                            #   (Rule #3; decimation is subsampling, not a transform). NOT a runtime backend.
```

Path alias `@/*` resolves to `apps/ai_detection_viewer_client/src/*`
(declared in the app's `tsconfig.json`).

## Core Data Types

```ts
type Frame = {
  id: string;
  imageUrl: string;
  imageWidth: number;   // original pixel width from CocoImage.width
  imageHeight: number;  // original pixel height from CocoImage.height
  detections2D: Detection2D[];
  detections3D: Detection3D[];
  pointCloud: Point3D[];
  // (F2 ✅ added; UI badge pending) Provenance of the 3D data. Drives the UI
  // "Estimated" vs "Measured" badge so we never misrepresent depth source
  // (Immutable Rule #6 honored across datasets, not dropped). COCO frames =
  // 'coco-estimated'; nuScenes frames = 'nuscenes-measured'. Optional, so
  // existing COCO frames (which omit it) are unaffected.
  source?: 'coco-estimated' | 'nuscenes-measured';
};

type Detection2D = {
  id: string;        // shared with Detection3D.id
  class: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
};

type Detection3D = {
  id: string;        // shared with Detection2D.id
  class: string;
  confidence: number;
  bbox3D: {
    center: [number, number, number];
    size: [number, number, number];
    // (F2 ✅ added) Orientation as a quaternion [x, y, z, w] (Three.js order).
    // Absent = no rotation (identity), so existing COCO estimated boxes stay
    // valid and F1 tests don't break. Three.js + nuScenes are quaternion-native
    // (nuScenes stores [w,x,y,z]; the parser reorders). See domain-glossary.
    rotation?: [number, number, number, number];
  };
};

type Point3D = {
  x: number;
  y: number;
  z: number;
  // (F2-B) Optional. COCO's estimated points set it (generatePointCloud) so they
  // filter by their owning bbox (Step 7 / Edge_#4 Case 5). Real LiDAR points
  // (nuScenes) have NO detectionId — they are environment, not owned by any one
  // detection — and are always shown (selectVisiblePoints).
  detectionId?: string;
  intensity?: number;
};
```

## Data Flow

```
COCO JSON
   ↓ lib/coco/parser.ts
Frame[] (parsed: id, imageUrl, imageWidth, imageHeight, detections2D)
   ↓ lib/geometry/frame-enricher.ts  (enrichFrame)
Frame[] (enriched: + detections3D + pointCloud)
   ↓ loaded into React state (top-level page component)
   ↓
Zustand store (selection / filters)
   ↓                                      ↓
   ↓   lib/selectors/visible-detections   ↓
   ↓   (frame, threshold, classes) →      ↓
   ↓        visibleIds: Set<string>       ↓
   ↓                                      ↓
   ↓→  Filters  Viewer-2D  Viewer-3D  ObjectList
```

The Zustand store holds UI state only. Frame data lives in React state at the page level.

## Zustand Store Schema

```ts
type ViewerStore = {
  selectedFrameId: string | null;
  selectedObjectId: string | null;     // shared between 2D and 3D
  confidenceThreshold: number;         // 0.0 ~ 1.0
  visibleClasses: Set<string>;
  maxDistance: number;                 // F2-A — metres; nuScenes distance filter. Default DISTANCE_MAX (90, "off"). Inert on COCO (no distance slider shown).

  setSelectedFrame: (id: string) => void;
  setSelectedObject: (id: string | null) => void;
  setConfidenceThreshold: (v: number) => void;
  toggleClass: (className: string) => void;
  setMaxDistance: (v: number) => void; // F2-A
  resetFilters: () => void;            // Step 9.5 Phase 2 — restore filters to defaults (incl. maxDistance → DISTANCE_MAX)
};
```

### Store Validation Rules

See `docs/edgecases/Edge_#3.md` for discovery history.

| Setter | Input | Behavior |
|---|---|---|
| `setSelectedObject` | `null` | clear selection |
| `setSelectedObject` | nonexistent string | stored as-is; no highlight rendered (component id match is always false); see Edge_#5 Case 5 |
| `setSelectedFrame` | `string` only | no `null` deselect path — Step 8 finalized as intentional (always-one-frame policy); see Edge_#3 Case 3 |
| `setConfidenceThreshold` | finite number | clamp to `[0, 1]` |
| `setConfidenceThreshold` | `NaN` / `±Infinity` | `console.warn`, keep previous value |
| `toggleClass` | any string | toggle membership; emit a new `Set` instance |
| `setMaxDistance` | finite number | clamp to `[0, ∞)` (`Math.max(0, v)`) |
| `setMaxDistance` | `NaN` / `±Infinity` | `console.warn`, keep previous value (mirrors confidence; NaN would hide every box) |
| `resetFilters` | — | atomic: sets `confidenceThreshold = 0`, `visibleClasses = new Set()`, `maxDistance = DISTANCE_MAX`; selection slice untouched |

`visibleClasses` semantic (locked by `lib/selectors/visible-detections.test.ts`):
**empty Set means "show all classes"** (permissive empty). The initial state is
`new Set<string>()` so the user's first paint shows everything. A non-empty Set
acts as a whitelist.

## 2D → 3D Estimation Strategy

Because COCO has no real depth data, we estimate 3D coordinates from 2D bounding boxes.
This is a visualization approximation, not real perception.

- Larger bbox area → object is closer (smaller world z)
- bbox center maps to world x/y (aspect-corrected; y-axis flipped)
- Box size scales proportionally to bbox pixel dimensions
- A pseudo point cloud is generated by scattering points within each estimated bbox volume

Mapping constants (`SCENE_HALF_Y`, `MIN_Z`, `MAX_Z`, `MIN_SIZE_WORLD`) and formulas live
in `lib/geometry/bbox-estimator.ts`.

> **Note (F1-A finding).** The estimator compresses typical COCO detections toward the FAR
> end: `z = MAX_Z − areaRatio·(MAX_Z−MIN_Z)`, and COCO objects are small relative to the
> image, so on the sample data ~85% of detections land in `z∈[7,8]`. Depth-color therefore
> does NOT color over the fixed `[MIN_Z, MAX_Z]` (that used only the top ~15% of the ramp and
> looked flat); it fits the ramp per frame to the frame's actual point-z range. See the
> PointCloud contract and Edge_F#1.

### Camera setup (`components/viewer-3d/Viewer3D.tsx`)

Camera at `(0, 0, -10)` with OrbitControls target `(0, 0, 4.5)` — looks in the **+z** direction.
Smaller `world_z` = closer to camera, matching the estimator convention (larger bbox → smaller z).
For the full rationale, see `docs/edgecases/Edge_#4.md` Case 2.

## R3F Performance Rules

- Point cloud uses `THREE.BufferGeometry` directly. Manage it via `useRef`, not React state.
- Avoid re-creating geometries on every render. Memoize with `useMemo`.
- Imperatively-created geometries (`new THREE.BufferGeometry()`, `new THREE.EdgesGeometry()`, etc.)
  must be explicitly disposed — R3F only auto-disposes JSX-declared geometries.
  Pattern: `useEffect(() => () => geometry.dispose(), [geometry])`.
- Wrap heavy 3D components in `<Suspense>` where appropriate.
- Use `instancedMesh` if rendering many similar 3D bboxes.

## 3D Viewer Component Contract

```ts
type Viewer3DProps = {
  frame: Frame;           // must be enriched (has detections3D + pointCloud)
  selectedId?: string | null;              // highlights the matching bbox (Step 5)
  onSelect?: (id: string | null) => void;  // wire to store.setSelectedObject in Step 5
  visibleIds?: Set<string>;                // Step 7 — filters out hidden bboxes + points
};
```

| Component | Responsibility |
|---|---|
| `Viewer3D` | Hosts R3F `<Canvas>`. Camera is one-time init; never remounts unless `key` changes (**F2-C:** the `key` is dataset-aware — COCO uses `frame.id` so it remounts/resets per frame as before, nuScenes uses one stable key so the Canvas + OrbitControls persist across frames and autoplay; the nuScenes framing is also **frozen to the mount frame** via `useRef`+`useMemo` so the OrbitControls `target` doesn't re-aim each frame. Extension seam for camera-follow: pass the selected box center as `target` per frame. See Edge_F#2 Case 6). `onPointerMissed` deselects. Also mounts `<HintBox>` as a `<Canvas>` sibling for the corner controls overlay. **F1-A:** `<Canvas flat>` disables ACES tone mapping so the point-cloud depth colors (and bbox wires) render with true, un-desaturated color — verified by screenshot, see Edge_F#1 Case 3. **F2-A:** the camera is **dataset-aware**. COCO keeps `position=[0,0,-10]` looking +z with `far=100`. nuScenes (`frame.source==='nuscenes-measured'`) fits the camera to the measured box cloud via `frameBoxesForCamera(centers)` (behind+above, looking forward/−z), widens `far=600`, and passes `target`+`fog={false}` to `Scene`. Without this the COCO camera faces away from the nuScenes cloud and the COCO fog occludes it — see Edge_F#2 Case 3. |
| `Scene` | Camera **target** (prop; default COCO `[0,0,SCENE_CENTER_Z]`, nuScenes = fitted target), lighting (ambient + hemisphere + directional), `<Grid>` floor, optional `<fog>` for depth (prop `fog`, default on; nuScenes passes `false`), and scene root. The `<Grid>` mesh's `raycast` is no-oped at mount so it does not hijack `<Canvas onPointerMissed>` — without that, empty-space deselect from Step 5 silently breaks. See Edge_#9.5 Case A. Passes `isSelected`/`onClick` to each `BBox3D`. OrbitControls `rotateSpeed=0.5 / zoomSpeed=0.6 / panSpeed=0.6` are tuned here. |
| `PointCloud` | `THREE.BufferGeometry` + `THREE.Points`. Memoizes geometry; disposes on change/unmount. **F1-A:** each point carries a per-vertex `color` attribute from `depthToColor(z, zMin, zMax)` (`lib/geometry/depth-color.ts`); `<pointsMaterial vertexColors>` with a white base (multiplicative identity) shades each point by depth. The `[zMin, zMax]` domain is `depthRange(points)` fit to the **full frame** point-z range (computed pre-filter, so class toggles do NOT recolor — only frame switches do). The visible set comes from `selectVisiblePoints(points, visibleIds)`, and the color attribute rides the same geometry the dispose `useEffect` already cleans up. Base point `size` is `0.2` (with `sizeAttenuation`) and palette is **cyan→violet**; both were finalized by render verification (smaller points / dark-far-end / ACES tone mapping all made the gradient invisible). See Edge_F#1 Case 3. **F2-B:** the cloud is now real LiDAR for nuScenes frames (COCO stays estimated). `selectVisiblePoints` (in `lib/selectors`, pure) keeps points whose `detectionId` is in `visibleIds` (COCO's owned points) AND **always keeps points with no `detectionId`** (LiDAR environment points), so the box filters (distance slider / class toggles) never thin the measured cloud. Real `z` drives the depth color; `size`/decimation density were render-verified legible at the nuScenes scale (Edge_F#2 Case 4). |
| `BBox3D` | `THREE.EdgesGeometry` wireframe + invisible click mesh. White color + scale pulse when selected. **F1-B:** `onPointerOver`/`onPointerOut` on the same invisible mesh drive a local `hovered` state; a non-selected hovered box renders a lightened class tint (`THREE.Color(classColor).lerp(white, 0.6)`) + a static `1.06` scale (no pulse — kept distinct from the selected white+pulse look, whose scale stays in `0.96–1.04`; selection wins when both apply). Tint/scale strengths were render-verified (the initial `0.45`/`1.02` barely read on the near-black bg with 1px wires). Cursor → `pointer` while hovered via an effect whose cleanup also fires on unmount, so a hovered box that disappears (frame switch / filtered out) before `onPointerOut` still resets the cursor. Hover is 3D-local only — no store field, no 2D/ObjectList sync (Immutable Rule #2). See Edge_F#1 Case 4. **F1-C:** split into an outer (position-only) group and an inner (pulse/hover-scaled) group; when `isSelected || hovered`, mounts `<BBoxLabel>` on the OUTER group at the box top (`size.y/2 + pad`) so the selected-box pulse doesn't jitter the label anchor. **F2-A:** the inner group also carries `quaternion={bbox3D.rotation ?? [0,0,0,1]}` — measured nuScenes boxes render at their real heading; absent (COCO) → identity, so estimated boxes / F1 are unchanged. Rotation and the uniform pulse/hover scale compose independently; the label stays on the unrotated outer group so it hangs upright. |
| `BBoxLabel` | **F1-C:** drei `<Html>` info pill anchored to a 3D point, re-projected each frame so it tracks the box as the camera orbits/zooms. Constant on-screen size (no `distanceFactor`). Shows class-color dot + class + `confidence` as a percent. `pointer-events-none` on both the `<Html>` container and the inner node so empty-space clicks still reach `<Canvas onPointerMissed>` (deselect). `occlude` OFF for F1. Shown only for selected/hovered boxes (≤2 at once) to avoid clutter; it's an in-scene complement to `SelectedObjectInfo`, not a replacement. See Edge_F#1 Case 5. |
| `ObjectList` | Non-spatial selection panel. Shows all raw detections (class, confidence, id). Clicking a row sets `selectedObjectId`. Selected row highlighted with bg + ring. **Phase 2:** confidence rendered as a sky-tinted gauge bar; on `selectedId` change the selected row is scrolled into view by manually adjusting the `<ul>` `scrollTop` (NOT `Element.scrollIntoView` — that propagates to outer scroll containers and can move the page; see Edge_#9.5 Case C). |

`Viewer3D` receives an enriched `Frame` (output of `enrichFrame`). It does NOT call `enrichFrame` —
coordinate math is `lib/geometry/`'s responsibility.

Selection highlight: selected BBox3D renders in white (`#ffffff`) and pulses via `useFrame`
(scale ±4% at ~0.64 Hz). An invisible `<mesh><boxGeometry>` provides a reliable full-volume
click target (line segments alone are difficult to raycast in WebGL2).

For camera reset across frame switches, see `docs/edgecases/Edge_#4.md` Case 6 — resolved in Step 8 via `<Viewer3D key={frame.id} />` remount; `page.tsx` is the single wire point. **F2-C** then made this `key` dataset-aware: nuScenes uses a *stable* key (no remount → the camera holds during tracking/autoplay), COCO keeps `frame.id` (remount-reset). See Edge_F#2 Case 6.

### Frame-switch selection policy (dataset-aware, F2-C)

`page.tsx`'s `handleSelectFrame` clears or keeps the object selection based on `tracksAcrossFrames`
(true on nuScenes):
- **COCO** clears `selectedObjectId` on every switch — ids are `imageId-annId`, unstable across frames,
  so a kept id could ghost-highlight or match a different object (Edge_#5 Case 6).
- **nuScenes** KEEPS it — the id is an `instance` token, stable for the same object across frames, so
  keeping it tracks that object; absence in a frame just draws no highlight, and re-appearance
  re-highlights correctly (Edge_F#2 Case 5).
Either way it is one `selectedObjectId` (Immutable Rule #2) — only *when* it clears differs.

### Autoplay (F2-C)

An `isPlaying` flag in `page.tsx` drives a `setInterval` (`AUTOPLAY_INTERVAL_MS = 500` ≈ the real
nuScenes ~2 Hz cadence). Each tick reads the current frame via `useViewerStore.getState()` (no stale
closure) and advances using the pure `nextFrameIndex(index, count, {loop:true})` from `lib/sequence`
(loops at the end; a hard stop would flip `isPlaying` off). On nuScenes, advancing keeps the tracked
selection (no clear). The play/pause control is passed to the Timeline **only on nuScenes** (COCO's
independent frames make playback a meaningless slideshow). The boxes snap between keyframes (decision
4-A; the LiDAR cloud is per-keyframe too) — `Scene` keys each `BBox3D` on the stable instance id, so
the component persists frame to frame and is the seam for a future box-tween (lerp/slerp in
`lib/geometry`).

## Step 9.5 Component Contracts

All Step 9.5 components follow the same controlled-component pattern as
Step 5+ (props in, callbacks out; `page.tsx` is the single wire point).
Adopt/exclude rationale lives in `docs/etc/NEW_UI.md`.

| Component | Phase | Responsibility |
|---|---|---|
| `Header` | 2 ✅ | App title + frame meta (`Frame N/M · X detections`, X = `detections3D.length` — the 3D main view's count, F2-A). Pure presentation; reads no store directly. **F2-A:** also hosts the dataset switcher (segmented `COCO \| nuScenes`, props `datasetId`/`onSelectDataset`) and the Estimated/Measured badge driven by `Frame.source` (amber = estimated, emerald = measured) — provenance is surfaced here, app-level, not in the per-frame Filters. |
| `HintBox` (inside `Viewer3D`) | 1 ✅ | Small overlay in the 3D viewer corner showing mouse controls. Static text; no state. Mounted as a sibling of `<Canvas>` inside `Viewer3D`'s `relative` wrapper; `pointer-events-none` so OrbitControls still receives drag events over the hint area. |
| `AnalyticsPanel` | 3 ✅ | Right-rail container that composes `SelectedObjectInfo`, `ConfidenceHistogram`, `ClassCountBar`. Holds no state of its own. Has no background-deselect handler — deselection stays scoped to Filters / ObjectList / Viewer empty-space (information panels deselecting on background click feels accidental). |
| `SelectedObjectInfo` | 3 ✅ | Renders class / confidence / 2D bbox / 3D bbox / frame id / detection id of the selected detection. Shows a placeholder card when `selectedObjectId` is null OR when the id is not found in the current frame (defensive — `handleSelectFrame` already clears on frame switch). |
| `ConfidenceHistogram` | 3 ✅ | Pure SVG bars over `BUCKET_COUNT=10` buckets of `[0..1]`. Bars above the current `confidenceThreshold` render in sky; below-threshold bars in zinc. Threshold itself drawn as a dashed vertical line. Bucket data comes from `selectConfidenceBuckets(frame)`. |
| `ClassCountBar` | 3 ✅ | CSS-only horizontal bars (one row per class), iteration order = `selectClassCounts` Map order (first-appearance). Clicking a row dispatches `toggleClass`, the same action `ClassToggles` uses — the chart is a second entry point to the same store slice. Permissive-empty visual matches `ClassToggles`. |

### Charting Policy (Step 9.5)

- **Recharts is NOT adopted in Step 9.5.** With ≤10 detections per frame and
  ≤5 chart elements at any time, hand-rolled SVG/CSS is simpler and avoids a
  new dependency. PROJECT_DESIGN.md lists Recharts but as a possible stack
  item, not a binding choice. Re-evaluate only when KITTI or multi-frame
  aggregation arrives.
- `ConfidenceHistogram` uses SVG so the slider-threshold overlay shares the
  same coordinate system as the bars.
- `ClassCountBar` uses CSS `flex` + width-% bars so it remains a single
  scannable row per class. Donut/pie was rejected: 3-class dataset makes the
  arcs hard to compare, and arc math adds SVG complexity for no readability
  win.

### Layout (after Step 9.5)

Proposal B is the adopted layout, in place since Phase 3. `page.tsx`
switched from the Step 6 three-column grid to a 12-column grid with two
content rows:

```
[ Header (col-span-12) ]
[ Filters (col-span-12) ]
[ Viewer2D (md:col-span-5) | Viewer3D (md:col-span-7) ]
[ Timeline (md:col-span-12) ]
[ ObjectList (md:col-span-5) | AnalyticsPanel (md:col-span-7) ]
```

The 5/7 split intentionally promotes `Viewer3D` as the main view
(Immutable Rule #5). Timeline sits directly under the viewers, not at the
page bottom, so frame-switch controls stay within reach of the viewers
they drive — the downstream `ObjectList` / `AnalyticsPanel` follow below.
On mobile (`< md`) all cells stack to full width. Both viewers share
`aspect-[4/3]`, which is what stabilizes the Timeline position across
frames — see "2D Viewer SVG Contract" below.

## Separation of Concerns

| Layer            | Responsibility                         | Must NOT do                       |
|------------------|----------------------------------------|-----------------------------------|
| `lib/coco/`      | Parse COCO JSON into `Frame[]`         | Touch React / Zustand             |
| `lib/nuscenes/`  | (F2 ✅) Parse the offline-prepped nuScenes static JSON into `Frame[]` (`parseNuScenes`) | Touch React / Zustand; traverse raw relational tables (the prep script flattens those) |
| `lib/geometry/`  | 2D→3D math, point cloud generation; (F2) coordinate-frame transforms (global→ego, **sensor→global** for LiDAR, axis convention), 3D→2D projection, and 3D camera framing (`frameBoxesForCamera`) | Touch React / Zustand             |
| `lib/selectors/` | Pure store derivations: filters (Step 7), chart aggregations (Step 9.5), (F2) distance filter, (F2-B) `selectVisiblePoints` (point-cloud visibility: owned points obey the box filter, environment points always show) | Touch React / Zustand / Three.js  |
| `lib/ui/`        | Shared UI-layer constants (colors etc.) | Touch React / Zustand / Three.js |
| `lib/sequence/`  | (F2-C) Pure keyframe-sequence playback logic — `nextFrameIndex` (which frame is next, loop/stop) + the autoplay cadence constant | Touch React / Zustand / Three.js; own the timer (the `setInterval` lives in `page.tsx`) |
| `store/`         | UI state (selection, filters)          | Hold frame data, do parsing       |
| `components/`    | Rendering, event handling              | Do parsing or coordinate math     |
| `scripts/`       | (F2 ✅ `prep_nuscenes.py`) **Offline, build-time only** — flatten chosen nuScenes-mini frames into static JSON + copy assets; (F2-B) decode LIDAR_TOP `.pcd.bin` and voxel-grid **decimate** the points. NOT runtime. Mirrors Step 11's `generate_predictions.py`. | Run at request time / be a backend server; do coordinate math (decimation is subsampling, not a transform — the real transforms live in `lib/`, tested) |

## COCO Raw Schema Types

External COCO JSON is described by a separate type set in `lib/coco/types.ts`.
These are kept distinct from the internal `Frame` / `Detection2D` types so that
adding another input dataset (nuScenes — see "nuScenes Integration" below) does
not leak through the rest of the app. nuScenes is added *alongside*
COCO (a dataset switcher), not as a replacement, so the Step 11 YOLO / confidence
work stays live.

```ts
type CocoDataset = {
  images: CocoImage[];
  annotations: CocoAnnotation[];
  categories: CocoCategory[];
};

type CocoImage = { id: number; file_name: string; width: number; height: number };
type CocoAnnotation = {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number];   // [x, y, width, height]
  score?: number;                            // optional; absent for ground truth
};
type CocoCategory = { id: number; name: string; supercategory?: string };
```

## nuScenes Integration (F2-A ✅, F2-B ✅, F2-C ✅ Done)

Structure/contract notes only; per-feature progress + decisions live in
`post-mvp-checklist.md` (F2). nuScenes replaces *estimated* 3D with *measured* 3D.

**Status (F2-A complete):** pure `lib/` core (`lib/geometry/transforms.ts` +
`projection.ts` + `camera-framing.ts`, `lib/nuscenes/parser.ts` + `types.ts`),
offline prep + sample data (`scripts/prep_nuscenes.py` → `public/sample-data/
nuscenes/nuscenes.json` + `cam_front/`, scene-0916), **and the full UI**: a
Header dataset switcher + Estimated/Measured badge (`Frame.source`), `BBox3D`
rotation, projected 2D + selection sync, a `lib/selectors` distance filter
(`detectionDistance` + `selectIdsWithinDistance`) surfaced via a per-dataset
slider swap, and per-dataset 3D camera framing + fog. Two visible-id sets are
derived in `page.tsx` (2D for Viewer2D/ObjectList, 3D for Viewer3D) so measured
3D-only boxes still render (Edge_F#2 Case 2). Render-verified via Playwright.
The app **opens on nuScenes by default** (`page.tsx` initial `datasetId =
'nuscenes'`) so the landing view is the measured-3D headline; the Header switcher
flips to COCO.

**Status (F2-B complete):** the empty `pointCloud` is replaced by the frame's real
**LiDAR_TOP** points. The prep script decodes the `.pcd.bin` sweep (stdlib `struct`,
5×`float32`/point) and **voxel-grid decimates** it (~6.5k pts/frame), carrying the
raw sensor-frame points inline in `nuscenes.json` (`lidar.points`, flat array) plus
the LiDAR `ego_pose` + `calibrated_sensor`. `parseNuScenes` aligns each point to the
boxes — `sensorToGlobal` → `globalToEgo` → `egoToThree` — and emits `Point3D`s with
**no** `detectionId`. Those environment points are always shown
(`selectVisiblePoints`), independent of the box filters. Render-verified: the
concentric LiDAR rings centre on the ego/sensor origin and the boxes sit embedded in
the surrounding cloud. **Next:** F2-C (sequence + tracking).

**Transform pipeline (implemented).** Two outputs are derived from one
GLOBAL-frame annotation, both pure math in `lib/geometry`:
- *3D render coords:* `globalToEgo` (`R_ego⁻¹·(p−t_ego)`, physical z-up) → axis
  flip `egoToThree` `(x,y,z)→(-y,z,-x)` (det=+1 pure rotation: up→y, fwd→−z;
  preserves handedness so quaternions/orientation stay correct). Rotation:
  `globalQuatToEgo` then `egoQuatToThree` (= `q_flip · q_ego`). Size `[w,l,h]`
  (nuScenes) → `[l,w,h]` local-axis order (`nuSizeToLocal`).
- *2D box:* the SAME physical-ego box is projected (`egoToCamera` + intrinsic
  `cameraToPixel`) and the AABB of its 8 projected corners becomes the
  `Detection2D.bbox`. Projection stays in the physical convention (NOT the
  render-flipped frame). A box with any corner behind the camera, or that falls
  fully off-screen, yields **no 2D box but still renders in 3D** — Rule #1 is
  "same object ⇒ same id", not "every 3D has a 2D". See Edge_F#2 Case 1.

- *LiDAR points (F2-B):* points are born in the **LiDAR sensor frame**, so they take
  an extra hop before joining the boxes: `sensorToGlobal` (LiDAR `calibrated_sensor`
  → LiDAR `ego_pose`, the inverse direction of `globalToEgo`) → `globalToEgo` (the
  frame's **CAM_FRONT** `egoPose`, the frame the boxes live in) → `egoToThree`.
  Routing through GLOBAL is deliberate: the LiDAR and camera fire at slightly
  different times, so their `ego_pose`s differ; going via the fixed global frame
  absorbs that offset and keeps points on the boxes (applying the LiDAR calibration
  alone would leave the cm-scale mismatch).

Quaternion order: nuScenes is `[w,x,y,z]`; Three.js / `Detection3D.rotation` is
`[x,y,z,w]`. `quatNuToThree` is the single conversion point (absent → identity).

**Why a prep step at all.** nuScenes is a relational token graph
(`sample → sample_data → {ego_pose, calibrated_sensor}`, `sample_annotation →
instance → category`) and ships large LiDAR files. Traversing/decoding that in the
browser at runtime is impractical and we run no backend. So a **one-time offline
script** (`scripts/`, build-time only — like Step 11's `generate_predictions.py`)
selects a few keyframes from **nuScenes-mini**, flattens the tables, copies the few
camera images, and emits a compact static JSON the browser parses like COCO.

**Where the coordinate math lives.** The prep script does *no* coordinate math — it
only flattens and copies **raw** values. All transforms live in `lib/` TypeScript
(Immutable Rule #3) and are Vitest-tested. The prepped JSON therefore carries the
raw inputs the transforms need:
- 3D boxes in the **global** frame (center, size, rotation quaternion),
- `ego_pose` (global→ego) and `calibrated_sensor` (ego→sensor + camera `intrinsic`),
- the `instance` token per annotation (→ stable id; also the F2-C track id),
- (F2-B) `lidar`: decimated sensor-frame points (flat `[x,y,z,…]`) + the LiDAR's own
  `ego_pose` and `calibrated_sensor` (the two extra poses `sensorToGlobal` consumes).

**Two facts that shape the first slice (verified during planning):**
1. nuScenes annotations are in the **global** frame, so even "boxes only" needs a
   real transform (global→ego) + the z-up→y-up axis convention. There is **no**
   zero-transform path like KITTI Level 1.
2. nuScenes core annotations are **3D-only** — no 2D boxes. To keep the 2D↔3D sync
   signature, `lib/` **projects** each 3D box into the camera image (intrinsic +
   extrinsics) to produce the `Detection2D`. 2D and 3D derive from the **same
   `instance` annotation**, so they share one id → Immutable Rule #1 preserved.

**Phasing** (see F2 in `post-mvp-checklist.md`):
- **F2-A** — measured 3D boxes (global→ego + axis) + projected 2D boxes + 2D↔3D
  sync; `bbox3D.rotation` quaternion; distance filter; `source` badge. `pointCloud`
  stays empty (no fake points). No sequence.
- **F2-B** ✅ — real LiDAR point cloud: decode/decimate `pcd.bin` (offline, voxel grid),
  align in `lib/` via `sensorToGlobal` → `globalToEgo` → `egoToThree`. Environment
  points (no `detectionId`) always render via `selectVisiblePoints`.
- **F2-C** ✅ — sequence + tracking + autoplay: the `instance` token gives cross-frame identity, so
  on nuScenes `selectedObjectId` SURVIVES a frame switch (tracking) and a Timeline play/pause control
  steps the keyframes at ~2 Hz showing the same object move; the 3D camera is held stable (no
  per-frame remount + frozen framing). COCO is unchanged (clears selection, remount-resets). Logic
  split: pure `nextFrameIndex` in `lib/sequence` (Rule #3), timer + dataset-aware policy in `page.tsx`.
  Boxes snap between keyframes (no tween); seams for box-tween and camera-follow are left clean. See
  Edge_F#2 Case 5 (selection persistence) + Case 6 (camera stability).

**Filter (F2-A ✅):** a pure **distance** selector in `lib/selectors/distance-filter.ts`
(`detectionDistance` = `|bbox3D.center|`; `selectIdsWithinDistance(detections3D, max)`).
Because the ego→three axis flip is a pure rotation (det = +1), `|center|` is the real
distance in metres from the ego vehicle. The UI **swaps** the slider per dataset
(`filterMode`): nuScenes shows the **Distance** slider (metres, store `maxDistance`,
default `DISTANCE_MAX=90` = "All"); COCO shows the **Confidence** slider. A metre
filter is never shown over COCO's *estimated* depth, and no fake confidence is
injected on nuScenes (confidence = 1.0 annotation) — Immutable Rule #6.

## Parser Validation Rules

`parseCoco(raw)` follows these defensive rules. See `docs/edgecases/Edge_#1.md`
for the discovery history.

| Input shape | Behavior |
|---|---|
| `null` / `undefined` / non-object / missing arrays | `console.warn` and return `[]` |
| `{ images: [], annotations: [], categories: [] }` | return `[]` **without** warn (empty is not an error) |
| `bbox` not array, length ≠ 4, or any entry fails `Number.isFinite` | skip that detection, warn |
| `category_id` with no matching category | skip that detection, warn |
| `score` missing or not finite | confidence falls back to `1.0` |
| Duplicate `Detection2D.id` within a frame | keep the first, skip the rest, warn |
| Duplicate `image.id` across the dataset | keep the first, skip the rest, warn |

`Detection2D.id` is generated deterministically as `` `${imageId}-${annotationId}` ``
so that the same input JSON always produces the same ids — critical for the
2D↔3D selection invariant.


## 2D Viewer SVG Contract

`Viewer2D` renders via `<svg viewBox="0 0 {frame.imageWidth} {frame.imageHeight}">`.
COCO bbox coordinates (`x, y, width, height`) map directly to SVG `<rect>` attributes
with no arithmetic — the browser scales the vector to fit the container automatically.

**Fixed aspect wrapper (Step 9.5 Phase 1 ✅).** `Viewer2D` is wrapped in an
`aspect-[4/3]` container (mirroring `Viewer3D`), and the SVG uses
`w-full h-full` with `preserveAspectRatio="xMidYMid meet"` so the image is
letter- or pillar-boxed inside a stable cell. The grid row height is
deterministic and the Timeline no longer jitters when frames are switched.

The deselect handler (`onClick={() => onSelect?.(null)}`) lives on the
wrapper `<div>` — **not** on the `<svg>`. This is so that clicks on the
letterbox/pillarbox bands (which appear when the image's aspect ratio
differs from 4:3) also clear the selection; the `<svg>` itself only covers
the inner content area and would miss those bands. `<rect>` (bbox) clicks
still call `stopPropagation`, so bbox clicks resolve to select-only and
never inadvertently bubble to deselect. See `docs/edgecases/Edge_#9.5.md`
Case B for the routing-bug discovery.

Before Phase 1 the SVG used `w-full h-auto`, so the row height tracked each
image's aspect ratio and produced visible Timeline jitter on frame switches.

`Viewer2D` props:
```ts
type Viewer2DProps = {
  frame: Frame;
  selectedId?: string | null;              // highlights the matching bbox (Step 5)
  onSelect?: (id: string | null) => void;  // wire to store.setSelectedObject in Step 5
  visibleIds?: Set<string>;                // Step 7 — only render bboxes whose ids are in the set
};
```

`onSelect` receives `setSelectedObject` from the Zustand store (wired in `page.tsx`).
`selectedId` comes from `store.selectedObjectId`. Passing `null` to `onSelect` is the
deselect path ("Clicking empty space deselects" — Step 5 Done when).

Selection highlight: selected bbox renders with white stroke (`#ffffff`), strokeWidth 4,
and a native SVG `feGaussianBlur` glow filter (defined once in `<defs>`, applied per-element).

For known edge cases in the 2D viewer (label overflow, click ambiguity in overlapping
bboxes, etc.), see `docs/edgecases/Edge_#2.md`.

## Sample Data

Sample COCO JSON lives at `public/sample-data/sample.json`. It is a 10-image
subset of **MS COCO val2017** containing only the `person`, `bicycle`, and
`car` classes. Bounding boxes are the original COCO annotations, not synthetic.

- 10 images (real JPEG, ~150–280 KB each)
- 49 annotations (4–6 per image)
- 3 categories (`person`, `bicycle`, `car`)
- Each `image.coco_url` records the upstream source for traceability.

The accompanying `frame_001.jpg ~ frame_010.jpg` files are downloaded copies
of those upstream images, kept under `public/sample-data/` so the dev server
can serve them without an internet round-trip.

## Testing Boundaries

Tests follow the same layer boundaries as "Separation of Concerns". Each layer has a designated test style.

| Layer            | Test style                | What to verify                                                  |
|------------------|---------------------------|-----------------------------------------------------------------|
| `lib/coco/`      | Unit                      | COCO JSON → `Frame[]` conversion correctness and edge cases     |
| `lib/geometry/`  | Unit                      | 2D bbox → 3D bbox / point cloud math correctness                |
| `lib/selectors/` | Unit                      | Filter semantics; locked invariants (e.g. permissive-empty)     |
| `store/`         | Unit                      | Actions update state correctly; selectors return expected data  |
| `components/`    | (MVP) none                | Rendering is verified manually. Only extracted pure functions are tested |
| Integration      | Starting Step 5           | store + 2D + 3D respond to the same `selectedObjectId`          |

### Invariants the tests must lock down

The two invariants below come from the Immutable Rules. Whenever related code is touched, add a test that pins them.

- `Detection2D.id` and `Detection3D.id` are identical for the same object.
  → In `lib/geometry/`, lock the 2D→3D function's id passthrough with a test.
- `selectedObjectId` is the single source of truth for selection.
  → In store tests, confirm that "2D selection" and "3D selection" mutate the same field.

### Test file location

Place test files in the same directory as the module under test. Do not create a separate `__tests__/` folder.

```
src/lib/coco/
├── parser.ts
├── parser.test.ts         ← same directory
├── types.ts
└── index.ts
```

Reasons:
- The test follows the file when refactored.
- It is obvious at a glance which modules are tested.
- Import paths stay short (`./parser`).

**Exception: cross-module integration tests** live in `tests/integration/` (not co-located with any single module). `vitest.config.ts` covers both paths: `src/**/*.test.ts` and `tests/**/*.test.ts`.

<!-- KO (move to a localized file)
## 테스트 경계

테스트도 "관심사 분리" 표와 같은 레이어 경계를 따른다. 어떤 레이어를 어떤 방식으로 테스트할지가 정해져 있다.

| 레이어            | 테스트 종류         | 무엇을 검증하는가                                  |
|------------------|------------------|--------------------------------------------------|
| `lib/coco/`      | 유닛               | COCO JSON → `Frame[]` 변환의 정확성과 엣지 케이스    |
| `lib/geometry/`  | 유닛               | 2D bbox → 3D bbox / point cloud 수학의 정확성       |
| `store/`         | 유닛               | 액션 호출 시 상태가 올바르게 갱신되는가, 셀렉터 결과   |
| `components/`    | (MVP) 안함         | 렌더링 자체는 수동 확인. 추출된 순수 함수만 테스트    |
| 통합              | Step 5부터         | store + 2D + 3D가 같은 `selectedObjectId`에 반응    |

### 테스트가 잠가야 할 불변 조건

다음 두 가지는 Immutable Rules에서 비롯된 핵심 불변 조건이다. 관련 코드를 만질 때마다 해당 조건을 검증하는 테스트를 추가한다.

- `Detection2D.id`와 `Detection3D.id`는 같은 객체에 대해 동일하다.
  → `lib/geometry/`에서 2D→3D 변환 함수가 id를 그대로 전달하는지 테스트로 잠근다.
- `selectedObjectId`는 선택의 단일 진실 공급원이다.
  → store 테스트에서 2D 선택과 3D 선택이 같은 필드를 갱신하는지 확인.

### 테스트 파일 위치

테스트 파일은 테스트 대상 모듈과 같은 디렉토리에 둔다. 별도 `__tests__/` 폴더는 만들지 않는다.

이렇게 두는 이유:
- 리팩토링 시 파일과 테스트가 함께 이동한다.
- 어떤 모듈이 테스트되고 있는지 한눈에 보인다.
- import 경로가 짧다 (`./parser`).
-->

```
