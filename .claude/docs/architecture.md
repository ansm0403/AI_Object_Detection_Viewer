# 데이터 구조, 상태 흐름
## 데이터 모델, 상태 흐름, 폴더 구조 상세

# Architecture

**Current Status: Steps 1–9 complete. Step 9.5 Phase 1 ✅ complete;
Phase 2 ✅ complete; Phase 3 ✅ complete. Next: Step 10 — README + Deploy.**
For step-by-step history and per-Step decisions, see `mvp-checklist.md`.
For the original vision behind these decisions, see `docs/PROJECT_DESIGN.md` (read-only).
For Step 9.5 UI feature candidates and adopt/exclude rationale, see `docs/etc/NEW_UI.md`.

## Folder Structure

The project is an **nx monorepo**. All Step 1–10 work happens inside the
`ai_detection_viewer_client` Next.js app. The backend app is out of MVP scope.

```
apps/ai_detection_viewer_client/
├── src/
│   ├── app/                # Next.js app router pages
│   │   └── page.tsx        # fetch → parseCoco → enrich all → auto-select frame → Header + Filters + Viewer2D + <Viewer3D key={id}/> + ObjectList + AnalyticsPanel + Timeline (after Step 9.5)
│   ├── components/
│   │   ├── viewer-2d/      # ✅ Step 2, 5 — 2D image + SVG overlay, selection sync
│   │   │   ├── Viewer2D.tsx    # props: frame, selectedId?, onSelect?
│   │   │   └── index.ts        # barrel
│   │   ├── viewer-3d/      # ✅ Step 4, 5 — R3F canvas, point cloud, 3D bboxes, selection sync
│   │   │   ├── Viewer3D.tsx    # props: frame, selectedId?, onSelect?; hosts Canvas
│   │   │   ├── Scene.tsx       # lights + PointCloud + BBox3D + OrbitControls; passes selection
│   │   │   ├── PointCloud.tsx  # THREE.BufferGeometry via useMemo + dispose
│   │   │   ├── BBox3D.tsx      # EdgesGeometry wireframe + invisible click mesh; selection highlight
│   │   │   └── index.ts        # barrel
│   │   ├── object-list/    # ✅ Step 6 — detection list panel; selection sync with 2D/3D
│   │   │   ├── ObjectList.tsx  # props: frame, selectedId?, onSelect?, visibleIds?
│   │   │   └── index.ts        # barrel
│   │   ├── filters/        # ✅ Step 7 — confidence slider + class toggles
│   │   │   ├── Filters.tsx           # props: classes, threshold, visibleClasses, callbacks
│   │   │   ├── ConfidenceSlider.tsx  # 0..1 range input
│   │   │   ├── ClassToggles.tsx      # color chips per class
│   │   │   └── index.ts              # barrel
│   │   ├── timeline/       # ✅ Step 8 — horizontal thumbnail strip
│   │   │   ├── Timeline.tsx     # props: frames, selectedFrameId, onSelectFrame
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
│   │   │   ├── frame-enricher.ts            # orchestrator: enrichFrame()
│   │   │   └── index.ts                     # barrel
│   │   ├── selectors/      # ✅ Step 7 — pure store derivations
│   │   │   ├── visible-detections.ts        # filter by threshold + visibleClasses
│   │   │   ├── visible-detections.test.ts   # 11 tests; locks permissive-empty semantic
│   │   │   ├── confidence-buckets.ts        # ✅ Step 9.5 Phase 3 — histogram buckets (BUCKET_COUNT=10)
│   │   │   ├── confidence-buckets.test.ts   # 7 tests; locks bucket count + boundary rules
│   │   │   ├── class-counts.ts              # ✅ Step 9.5 Phase 3 — class → count map (first-appearance order)
│   │   │   ├── class-counts.test.ts         # 5 tests; locks key-by-class + iteration order
│   │   │   └── index.ts                     # barrel
│   │   ├── ui/             # ✅ Step 9 — shared UI-layer constants (no React/Zustand/Three.js)
│   │   │   └── class-colors.ts              # CLASS_COLORS map, getClassColor(), DEFAULT_COLOR, SELECTED_COLOR
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
│       └── frame_001.jpg ~ frame_010.jpg
└── vitest.config.ts        # include: src/**/*.test.ts + tests/**/*.test.ts
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
  bbox3D: { center: [number, number, number]; size: [number, number, number] };
};

type Point3D = {
  x: number;
  y: number;
  z: number;
  detectionId: string;  // set by generatePointCloud; required for filter (Step 7)
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

  setSelectedFrame: (id: string) => void;
  setSelectedObject: (id: string | null) => void;
  setConfidenceThreshold: (v: number) => void;
  toggleClass: (className: string) => void;
  resetFilters: () => void;            // Step 9.5 Phase 2 — restore filters to defaults
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
| `resetFilters` | — | atomic: sets `confidenceThreshold = 0` and `visibleClasses = new Set()`; selection slice untouched |

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
| `Viewer3D` | Hosts R3F `<Canvas>`. Camera is one-time init; never remounts unless `key` changes. `onPointerMissed` deselects. Also mounts `<HintBox>` as a `<Canvas>` sibling for the corner controls overlay. |
| `Scene` | Camera target, lighting (ambient + hemisphere + directional), `<Grid>` floor, `<fog>` for depth, and scene root. The `<Grid>` mesh's `raycast` is no-oped at mount so it does not hijack `<Canvas onPointerMissed>` — without that, empty-space deselect from Step 5 silently breaks. See Edge_#9.5 Case A. Passes `isSelected`/`onClick` to each `BBox3D`. OrbitControls `rotateSpeed=0.5 / zoomSpeed=0.6 / panSpeed=0.6` are tuned here. |
| `PointCloud` | `THREE.BufferGeometry` + `THREE.Points`. Memoizes geometry; disposes on change/unmount. |
| `BBox3D` | `THREE.EdgesGeometry` wireframe + invisible click mesh. White color + scale pulse when selected. |
| `ObjectList` | Non-spatial selection panel. Shows all raw detections (class, confidence, id). Clicking a row sets `selectedObjectId`. Selected row highlighted with bg + ring. **Phase 2:** confidence rendered as a sky-tinted gauge bar; on `selectedId` change the selected row is scrolled into view by manually adjusting the `<ul>` `scrollTop` (NOT `Element.scrollIntoView` — that propagates to outer scroll containers and can move the page; see Edge_#9.5 Case C). |

`Viewer3D` receives an enriched `Frame` (output of `enrichFrame`). It does NOT call `enrichFrame` —
coordinate math is `lib/geometry/`'s responsibility.

Selection highlight: selected BBox3D renders in white (`#ffffff`) and pulses via `useFrame`
(scale ±4% at ~0.64 Hz). An invisible `<mesh><boxGeometry>` provides a reliable full-volume
click target (line segments alone are difficult to raycast in WebGL2).

For camera reset across frame switches, see `docs/edgecases/Edge_#4.md` Case 6 — resolved in Step 8 via `<Viewer3D key={frame.id} />` remount; `page.tsx` is the single wire point.

## Step 9.5 Component Contracts

All Step 9.5 components follow the same controlled-component pattern as
Step 5+ (props in, callbacks out; `page.tsx` is the single wire point).
Adopt/exclude rationale lives in `docs/etc/NEW_UI.md`.

| Component | Phase | Responsibility |
|---|---|---|
| `Header` | 2 ✅ | App title + frame meta (`Frame N/M · X detections`). Pure presentation; reads no store directly. |
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
| `lib/geometry/`  | 2D→3D math, point cloud generation     | Touch React / Zustand             |
| `lib/selectors/` | Pure store derivations: filters (Step 7) and aggregations for charts (Step 9.5) | Touch React / Zustand / Three.js  |
| `lib/ui/`        | Shared UI-layer constants (colors etc.) | Touch React / Zustand / Three.js |
| `store/`         | UI state (selection, filters)          | Hold frame data, do parsing       |
| `components/`    | Rendering, event handling              | Do parsing or coordinate math     |

## COCO Raw Schema Types

External COCO JSON is described by a separate type set in `lib/coco/types.ts`.
These are kept distinct from the internal `Frame` / `Detection2D` types so that
swapping the input dataset (e.g. KITTI in the future) does not leak through
the rest of the app.

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
