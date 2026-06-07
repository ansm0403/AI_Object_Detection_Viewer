# MVP 진행 체크리스트
## MVP 1~10번 진행 상태 추적

# MVP Checklist

> 🔒 **FROZEN — MVP completion record (Steps 1–11).** The MVP is done; this file is now a
> read-only baseline, treated like `docs/PROJECT_DESIGN.md`. Do NOT append new work here.
> Post-MVP feature work lives in `.claude/docs/post-mvp-checklist.md`.

Track MVP progress here. Each step has a goal, scope, and "done when" criteria.
Work on ONE step at a time. Mark with [x] when complete.

## Step 1 — COCO Parsing ✅ Complete
- [x] Goal: Convert COCO JSON into internal `Frame[]` structure.
- Scope: `lib/coco/parser.ts`, `lib/coco/types.ts`, `lib/coco/index.ts`, `lib/types/index.ts`.
- Done when:
  - [x] Sample COCO JSON loads without errors.
  - [x] Each `Frame` has correct `detections2D` populated.
  - [x] `Detection2D.id` is generated and unique within a frame.
  - [x] Invalid/empty inputs return `[]` with a console.warn, not a crash.
- Tests (required):
  - [x] Set up Vitest (`vitest.config.ts`, npm `test` script).
  - [x] `lib/coco/parser.test.ts` — verifies the following with inline fixtures (25 tests passing):
    - Valid input: well-formed images/categories/annotations produce a correct `Frame[]`.
    - Empty / invalid root: empty object, `null`, or missing arrays returns `[]`.
    - Unknown category: annotations whose `category_id` has no matching category are skipped.
    - Invalid bbox: bbox length ≠ 4 or non-finite entries are skipped (incl. `NaN`, `Infinity`).
    - Invalid score: non-finite `score` falls back to confidence `1.0`.
    - Zero-annotation frame: a Frame is still created with `detections2D = []`.
    - id uniqueness: all `detections2D[].id` within a single frame are distinct.
    - Duplicate `image.id`: keep the first, skip the rest with warn.
- Edge cases discovered and fixed: see `docs/edgecases/Edge_#1.md`.
- Sample data: 10-image MS COCO val2017 subset (`person`, `bicycle`, `car`), real bboxes.


<!-- KO (move to a localized file)
- 테스트 (필수):
  - [ ] Vitest 도입 (`vitest.config.ts`, npm script `test`).
  - [ ] `lib/coco/parser.test.ts` — 다음 케이스를 인라인 fixture로 검증.
    - 정상 입력: 이미지/카테고리/어노테이션이 올바르면 `Frame[]`이 만들어진다.
    - 빈 / 잘못된 루트: 빈 객체, `null`, 배열 누락이면 `[]`을 반환한다.
    - 알 수 없는 카테고리: 매칭되는 카테고리가 없는 어노테이션은 건너뛴다.
    - 잘못된 bbox: 길이가 4가 아니거나 숫자가 아닌 값이 있으면 해당 어노테이션을 건너뛴다.
    - 어노테이션 0개 프레임: 어노테이션이 없어도 Frame은 만들어지고 `detections2D`가 `[]`이다.
    - id 유일성: 같은 프레임 안의 모든 `detections2D[].id`는 서로 다르다.
-->


## Step 2 — 2D Image Viewer ✅ Complete
- [x] Goal: Display image + 2D bounding boxes via SVG overlay.
- Scope: `components/viewer-2d/*`. Also modified: `lib/types/index.ts`,
  `lib/coco/parser.ts`, `lib/coco/parser.test.ts`, `app/page.tsx`.
- Done when:
  - [x] Image renders with bboxes positioned correctly.
  - [x] Each bbox is clickable (placeholder `onSelect` logs to console; signature
        matches Step 5's `setSelectedObject(id: string | null)` — wire-ready).
  - [x] Bbox labels show class name and confidence.
- Type change (required for SVG viewBox coordinate system):
  - `Frame` extended with `imageWidth: number` and `imageHeight: number`.
  - `parser.ts` populates these from `CocoImage.width` / `CocoImage.height`.
  - `parser.test.ts`: 2 assertions added to the existing "valid input" test.
    Test case count unchanged — **25 tests passing**.
- Implementation notes:
  - `<svg viewBox="0 0 {imageWidth} {imageHeight}">` — COCO bbox coordinates
    map to `<rect>` attributes with no arithmetic; browser handles scaling.
  - Class color map: `person` → green, `bicycle` → yellow, `car` → red (fallback: blue).
  - Nx welcome template and Step 1 verification probe in `page.tsx` removed.
    Page now: fetch → parseCoco → `<Viewer2D frame={frames[0]} />`.
- Edge cases (see `docs/edgecases/Edge_#2.md` — 6 cases discovered):
  - Fixed: label clips past bottom edge (id=9-40), label clips past right edge
    (id=2-11, id=10-49). Both are latent in Step 2 (only frame_001 renders)
    and will manifest in Step 8 timeline navigation.
  - Documented without fix: click selection ambiguity in overlapping bboxes,
    label text click-through, missing image-load fallback, tiny bbox click difficulty.
    Primary mitigation for most: Step 6 Object List (non-spatial selection path).

## Step 3 — Zustand Store ✅ Complete
- [x] Goal: Set up global UI state.
- Scope: `store/viewer-store.ts`, `store/viewer-store.test.ts`, `store/index.ts`.
  Also modified: `apps/ai_detection_viewer_client/package.json` (added `zustand@^5.0.13`).
- Done when:
  - [x] Store exposes `selectedFrameId`, `selectedObjectId`, `confidenceThreshold`, `visibleClasses`.
  - [x] Setters work and trigger re-renders (new `Set` instance from `toggleClass` is the re-render signal).
  - [x] Frame data is NOT stored here.
- Tests (required):
  - [x] `store/viewer-store.test.ts` — actions called directly (no React); **18 tests passing**, suite total **43/43**.
    - `setSelectedObject(id)` updates `selectedObjectId`; passing `null` clears it.
    - `setSelectedFrame(id)` updates `selectedFrameId`.
    - `setConfidenceThreshold(v)` clamps to `[0, 1]`; non-finite inputs (`NaN`, `±Infinity`) are rejected with a warn and keep the previous value.
    - `toggleClass(name)` adds/removes the class in `visibleClasses` and emits a new `Set` instance.
    - Independent state slices do not mutate each other (3 cross-checks).
    - `createInitialState()` factory returns a fresh `Set` on every call.
- Implementation notes:
  - Zustand `^5.0.13`, React 19 compatible. Installed in the app workspace only.
  - `initialState` literal was refactored into a `createInitialState()` factory
    during the edge case audit — see Edge_#3 Case 2.
- Edge cases (see `docs/edgecases/Edge_#3.md` — 3 cases discovered):
  - Fixed: NaN/±Infinity poisoning the threshold (Case 1), shared `Set` reference in the initial state (Case 2).
  - Documented without fix: `setSelectedFrame` has no `null` deselect path (Case 3, defer to Step 8).

<!-- KO (move to a localized file)
- 테스트 (필수):
  - [ ] `store/viewer-store.test.ts` — React 없이 액션을 직접 호출해 상태 결과를 검증.
    - `setSelectedObject(id)`가 `selectedObjectId`를 갱신하고, `null`을 넘기면 선택이 해제된다.
    - `setConfidenceThreshold(v)`가 값을 올바르게 반영한다.
    - `toggleClass(name)`이 `visibleClasses`에서 추가/제거를 토글한다.
    - 서로 다른 상태 슬라이스는 서로 변경하지 않는다.
-->


## Step 4 — 3D Scene (basic) ✅ Complete
- [x] Goal: Render point cloud + 3D bboxes in R3F with OrbitControls.
- Scope: `components/viewer-3d/*`, `lib/geometry/*`.
  Also added: `lib/geometry/frame-enricher.ts` (orchestrator), `lib/geometry/index.ts` (barrel).
  Modified: `app/page.tsx` (enrichFrame + Viewer3D side-by-side with Viewer2D).
  Installed: `three@^0.184.0`, `@react-three/fiber@^9.6.1`, `@react-three/drei@^10.7.7`, `@types/three@^0.184.1`.
- Done when:
  - [x] `Detection2D` data is converted into `Detection3D` + `Point3D[]` via `lib/geometry/`.
  - [x] Point cloud renders using `BufferGeometry`.
  - [x] 3D bboxes render as wireframe boxes at estimated positions.
  - [x] OrbitControls allows mouse navigation.
- Tests (required):
  - [x] `lib/geometry/bbox-estimator.test.ts` — 15 tests:
    - id preservation: `Detection2D.id === Detection3D.id` for every input (Immutable Rule #1).
    - class/confidence pass through unchanged.
    - Larger bbox area produces a smaller `z` (closer-to-camera) than a smaller bbox area.
    - bbox center coordinates map to expected 3D `x`, `y` (documented in bbox-estimator.ts header).
    - 0-area bbox: size clamped to `MIN_SIZE_WORLD`; center/area/z unchanged.
    - Empty `Detection2D[]` input returns empty `Detection3D[]`.
  - [x] `lib/geometry/pointcloud-generator.test.ts` — 7 tests:
    - Returns expected count (N detections × pointsPerDetection).
    - All points stay inside their source bbox volume.
    - Reproducible with seeded rng; different seeds produce different output.
    - Empty `Detection3D[]` input returns `Point3D[]`.
  - [x] Do not test the R3F canvas itself.
- Implementation notes:
  - Mapping: `cxN/cyN → world x/y` (y flipped), `area → z` (larger area → smaller z). See `bbox-estimator.ts` header.
  - 0-width/0-height bbox (parser allows them): `size` clamped to `MIN_SIZE_WORLD=0.05`; center/area untouched.
  - Camera at `(0,0,-10)` targeting `(0,0,4.5)` (looks in +z direction; smaller z = closer per spec).
  - `frame-enricher.ts` supports optional `rng`/`pointsPerDetection` overrides for testability.
  - `next build` passed (✓ Compiled successfully).
- Suite total: **65/65** (43 prior + 15 bbox-estimator + 7 pointcloud-generator).
- Edge cases (see `docs/edgecases/Edge_#4.md` — 6 cases discovered):
  - Fixed: 3D depth direction inverted — camera was at +z causing large objects to appear at back
    (Case 2, Path A: camera moved to `[0,0,-10]`). Frustum clipping resolved as a side effect (Case 3).
    `BufferGeometry`/`EdgesGeometry` not disposed — GPU memory leak on re-renders (Case 4,
    `useEffect` cleanup added to `PointCloud.tsx` and `BBox3D.tsx`).
  - Documented without fix: SVG bbox click priority (Case 1, defer to Step 6 — read Edge_#4 Case 1
    before starting Step 6). `pointCloud` locked at enrich time, ignores filters (Case 5, defer to
    Step 7 — read Edge_#4 Case 5 before starting Step 7). Camera state persists across frame changes
    (Case 6, defer to Step 8 — read Edge_#4 Case 6 before starting Step 8).

<!-- KO (move to a localized file)
- 테스트 (필수):
  - [x] `lib/geometry/bbox-estimator.test.ts` — 순수 변환 함수 검증 (15개 테스트).
    - id 보존: 모든 입력에 대해 `Detection2D.id === Detection3D.id` (Immutable Rule #1).
    - class, confidence는 그대로 통과한다.
    - bbox 면적이 클수록 더 작은 `z`(카메라에 더 가까움)를 만든다.
    - bbox 중심 좌표가 예상한 3D `x`, `y`로 매핑된다 (매핑 방식은 문서화).
    - 0-area bbox: size가 `MIN_SIZE_WORLD`로 클램핑된다.
    - 빈 `Detection2D[]` 입력은 빈 `Detection3D[]`를 반환한다.
  - [x] `lib/geometry/pointcloud-generator.test.ts` — point cloud 생성기 검증 (7개 테스트).
    - 예상 개수의 포인트를 반환하고 bbox 부피 안에 머문다.
    - seeded rng로 재현 가능하고, 다른 seed는 다른 결과를 생성한다.
    - 빈 `Detection3D[]` 입력은 빈 `Point3D[]`를 반환한다.
  - R3F 캔버스 자체는 테스트하지 않는다.
-->


## Step 5 — 2D ↔ 3D Selection Sync ✅ Complete
- [x] Goal: Clicking an object in 2D highlights it in 3D, and vice versa.
- Scope: `components/viewer-2d/Viewer2D.tsx`, `components/viewer-3d/` (Viewer3D, Scene, BBox3D),
  `app/page.tsx`. Also created: `tests/integration/selection-sync.test.ts`. Modified: `vitest.config.ts`.
- Done when:
  - [x] Clicking a 2D bbox sets `selectedObjectId`.
  - [x] Clicking a 3D bbox sets `selectedObjectId`.
  - [x] The selected object highlights in BOTH views.
  - [x] Clicking empty space deselects.
- Tests (integration starts here):
  - [x] `tests/integration/selection-sync.test.ts` — wire the real store with the selector logic used by both viewers (not the canvases themselves). **5 tests added; suite total 70/70**.
    - Selecting an id "from 2D" produces the same `selectedObjectId` queried "from 3D".
    - Selecting an id "from 3D" produces the same `selectedObjectId` queried "from 2D".
    - Selecting the same id twice does not throw or duplicate state.
    - `setSelectedObject(null)` clears the selection (deselect path).
    - `setSelectedObject` with a nonexistent id does not throw; id is stored as-is (Case 5 in Edge_#5.md).
  - Still no DOM/canvas rendering tests. Verified data contract only.
- Implementation notes:
  - Selection is prop-based (controlled component): `selectedId` + `onSelect` props added to both viewers. `page.tsx` is the single wire point.
  - **2D highlight**: white stroke (`#ffffff`) + strokeWidth 4 + native SVG `feGaussianBlur` glow filter (defined in `<defs>`; applied only to the one selected element — no performance impact).
  - **3D highlight**: white wireframe color + `useFrame` scale pulse (±4% at ~0.64 Hz). `linewidth` is skipped — WebGL2 ignores it. An invisible `<mesh><boxGeometry>` provides a full-volume click target (line segments are unreliable for raycasting).
  - **Empty-space deselect**: 2D via `<svg onClick={() => onSelect?.(null)}>` (rects use `e.stopPropagation()`); 3D via R3F's `<Canvas onPointerMissed>`.
  - Glow impact assessment: 3D Bloom (via `@react-three/postprocessing`) was rejected — new package + scope expansion. SVG glow and `useFrame` pulse have no compatibility issues.
  - `vitest.config.ts` updated: `include` now also covers `tests/**/*.test.ts`.
  - `THREE.DoubleSide` on invisible click mesh ensures clicks register when camera orbits inside a bbox volume (Edge_#5 Case 11).
- Edge cases (see `docs/edgecases/Edge_#5.md` — 12 cases analyzed):
  - Fixed: invisible click mesh used default `FrontSide` — clicks from inside bbox volume didn't register (Case 11; `THREE.DoubleSide` applied to `meshBasicMaterial`).
  - Test added: `setSelectedObject` with nonexistent id stores id as-is and doesn't throw (Case 5).
  - Deferred: stale `selectedObjectId` persists when switching frames (Case 6, defer to Step 8 — read Edge_#5 Case 6 before starting Step 8).

<!-- KO (move to a localized file)
- 테스트 (통합 테스트 시작):
  - [x] `tests/integration/selection-sync.test.ts` — 두 뷰어가 공유하는 셀렉터 로직을 실제 store와 함께 검증 (캔버스 자체는 테스트하지 않음). **5개 테스트 추가; 전체 70/70**.
    - "2D에서" id를 선택하면 "3D에서" 조회한 `selectedObjectId`가 동일하다.
    - "3D에서" id를 선택하면 "2D에서" 조회한 `selectedObjectId`가 동일하다.
    - 같은 id를 두 번 선택해도 예외나 중복 상태가 발생하지 않는다.
    - `setSelectedObject(null)`로 선택이 해제된다.
    - 존재하지 않는 id로 `setSelectedObject`를 호출해도 예외 없이 id가 그대로 저장된다 (Edge_#5 Case 5).
  - DOM/캔버스 렌더링은 여전히 테스트하지 않는다. 데이터 계약만 검증한다.
-->


## Step 6 — Object List Panel ✅ Complete
- [x] Goal: Side panel listing detections in the current frame.
- Scope: `components/object-list/*` (ObjectList.tsx, index.ts).
  Modified: `app/page.tsx` (3-column grid + wire), `components/viewer-3d/Viewer3D.tsx`
  (defensive `relative overflow-hidden` on wrapper — see Edge_#6 Case 1).
- Done when:
  - [x] List shows class, confidence, id.
  - [x] Clicking a list item selects that object (sync with 2D/3D).
  - [x] Selected list item is visually highlighted.
- Tests: None added — UI component (no unit/render tests per policy). Integration test not added:
  ObjectList calls the same `setSelectedObject(id)` as Viewer2D/3D, no new contract to lock.
  **Suite: 70/70**.
- Implementation notes:
  - Props: `frame`, `selectedId?`, `onSelect?` — same controlled-component pattern as Viewer2D/Viewer3D.
    Single wire point: `page.tsx` passes same `selectedObjectId`/`setSelectedObject` to all three.
  - **No filtering** — displays all raw `frame.detections2D`. Step 7 owns confidence/class filters.
    Primary mitigation for `Edge_#4.md` Case 1: list provides non-spatial, unambiguous selection
    for any detection regardless of 2D bbox overlap.
  - Selected row: `bg-gray-700` + `ring-1 ring-white/60` inset border.
  - Each row: class color dot (mirrors `Viewer2D` class colors — inlined for now, Step 9 extracts) + class + confidence + id.
  - Empty state: "No objects detected in this frame." (CLAUDE.md Error Defaults).
  - Deselect: panel container `onClick → onSelect(null)`; row `onClick` uses `e.stopPropagation()`.
  - Layout: grid template lives as a JSX literal in `page.tsx` (`md:grid-cols-[1fr_1fr_280px]`)
    with a one-line comment showing alternates. Earlier `LAYOUT_CLASS` const was removed
    because Tailwind JIT extraction of arbitrary-value classes from a const string is unreliable
    (Edge_#6 Case 1).
- Edge cases (see `docs/edgecases/Edge_#6.md` — 4 cases):
  - Fixed: 2D viewer hidden behind 3D Canvas (Case 1) — Tailwind JIT + R3F absolute canvas
    overflow combined. Two-part fix in `page.tsx` and `Viewer3D.tsx`.
  - Deferred to Step 9: mobile list scrolling (Case 2), header click deselects (Case 3).
  - Latent only, no fix needed now: id column overflow risk (Case 4).

<!-- KO (move to a localized file)
- 테스트: UI 컴포넌트이므로 테스트 없음. 통합 테스트 미추가 — Viewer2D/3D와 동일한 `setSelectedObject(id)` 호출이라 새로운 계약이 없음. **70/70**.
- 구현 메모:
  - Props: `frame`, `selectedId?`, `onSelect?` — Viewer2D/Viewer3D와 동일한 controlled 패턴. `page.tsx` 단일 wire.
  - 필터링 없이 모든 raw detections 표시. Step 7이 필터 담당. `Edge_#4` Case 1의 1차 해소.
  - 선택된 행: `bg-gray-700` + `ring-1 ring-white/60`.
  - 레이아웃: grid 클래스는 `page.tsx` JSX className에 직접 기입 (`md:grid-cols-[1fr_1fr_280px]`).
    이전 `LAYOUT_CLASS` 상수는 Tailwind JIT arbitrary value 추출 신뢰성 문제로 제거 (Edge_#6 Case 1).
- 엣지 케이스 (`docs/edgecases/Edge_#6.md` — 4건):
  - 해결: 2D 뷰어가 3D Canvas 뒤로 숨음 (Case 1) — `page.tsx` + `Viewer3D.tsx` 2단 fix.
  - Step 9로 미룸: 모바일 리스트 스크롤 (Case 2), 헤더 클릭 시 선택 해제 (Case 3).
  - 현재 트리거 없음, 향후 관찰: id 컬럼 오버플로 (Case 4).
-->

## Step 7 — Filters ✅ Complete
- [x] Goal: Confidence threshold slider + class visibility toggles.
- Scope: `components/filters/*` (Filters, ConfidenceSlider, ClassToggles),
  `lib/selectors/*` (visible-detections), `lib/types/index.ts` (`Point3D.detectionId`),
  `lib/geometry/pointcloud-generator.ts` (+ test). Modified for `visibleIds` wiring:
  `components/viewer-2d/Viewer2D.tsx`, `components/viewer-3d/{Viewer3D, Scene, PointCloud}.tsx`,
  `components/object-list/ObjectList.tsx`, `app/page.tsx` (header row + grid restructure).
- Done when:
  - [x] Slider updates `confidenceThreshold` in store.
  - [x] Class toggles update `visibleClasses` in store.
  - [x] Both 2D and 3D viewers respect these filters.
  - [x] Point cloud points for filtered-out detections are removed too (Edge_#4 Case 5 Option A).
  - [x] ObjectList keeps showing all detections but dims hidden rows (preserves Edge_#4 Case 1 path).
- Tests (required):
  - [x] `lib/selectors/visible-detections.test.ts` — **11 tests**:
    - threshold = 0 + visibleClasses = ∅ returns all detections (permissive-empty semantic locked).
    - threshold = 1 returns only confidence-1.0 detections.
    - threshold drops `confidence < threshold` detections.
    - non-empty `visibleClasses` acts as a whitelist (single class, multi-class union).
    - threshold AND class filter combine (logical AND).
    - empty result when `visibleClasses` contains no matching class.
    - empty input returns empty output.
    - detection identity (object refs) is preserved through the filter.
    - `selectVisibleDetectionIds` returns the id Set of survivors.
  - [x] `lib/geometry/pointcloud-generator.test.ts` — 1 added: every generated `Point3D` carries
    its source detection id (locks Edge_#4 Case 5 Option A contract).
- Decisions:
  - **`visibleClasses` semantic: permissive empty.** Empty Set = show all. Initial state is
    an empty Set so the first paint isn't blank. Locked by selector test.
  - **Point cloud filtering: Option A** (Edge_#4 Case 5). `Point3D.detectionId` is now required;
    `PointCloud` filters its `BufferGeometry` at render time by the same `visibleIds` set.
    Filter changes only rebuild the geometry; `useEffect` cleanup disposes the previous one
    (Edge_#4 Case 4 pattern continues to apply).
  - **ObjectList stays unfiltered.** Hidden rows render at `opacity-40` instead of being removed,
    so the non-spatial selection path from Edge_#4 Case 1 still works for filtered detections.
  - **ClassToggles UI: color chips.** Each class is a pill with its viewer color (matches the
    2D / 3D / list color map). When `visibleClasses` is empty, all chips render as active —
    visualizing the "show all" state.
  - **Filters layout: header row** (top of page, above the 3-column grid). Step 9 may move it.
- Implementation notes:
  - Selector lives in a new `lib/selectors/` layer (added to Separation of Concerns table).
    Pure function, no React/Zustand/Three.js imports.
  - `visibleIds` prop is optional on all consumers (`undefined` = no filter), keeping each
    component usable standalone for tests/demos.
  - `page.tsx` is the single wire point: it reads store state, calls the selector once, and
    passes the resulting `visibleIds: Set<string>` to every consumer.
- Suite total: **82/82** (70 prior + 11 selector + 1 pointcloud detectionId).
- Follow-up (manual verification): `Edge_#2.md` Case 1 / `Edge_#4.md` Case 1
  resolved. Discovery path was hands-on use (clicking the bicycle's front
  wheel selected the person bbox). Fix is a one-line sort by `bbox.width *
  bbox.height` ascending in `Viewer2D.tsx`, so the 2D paint order matches the
  3D estimator's "larger area → smaller z → closer" convention. Long-form
  walkthrough: `docs/etc/blog-svg-paint-order-and-click-priority.md`.
- Edge cases (see `docs/edgecases/Edge_#7.md` — 2 deferred):
  - Defer to Step 8: `Filters` derives chip set from current frame only; with
    persistent `visibleClasses` this leaves toggled-on classes unreachable in
    frames that lack them. **Read `Edge_#7.md` Case 1 before starting Step 8.**
    Recommended: derive `classes` from the union across all frames.
  - Defer to Step 9: clicking the Filters bar background does not deselect
    (inconsistent with Viewer2D / Viewer3D / ObjectList). UX consistency call
    that fits the Step 9 polish pass.

<!-- KO (move to a localized file)
- 결정:
  - `visibleClasses` 의미는 **permissive empty** — 빈 Set이면 모두 표시. 초기 상태가 빈 Set이라 첫 페인트가 빈 화면이 되지 않게.
  - 포인트 클라우드 필터링은 Edge_#4 Case 5의 **Option A** 채택. `Point3D.detectionId` 필수 필드로 추가, `PointCloud`가 렌더 시 필터.
  - ObjectList는 **전체 표시 유지 + hidden 행은 opacity-40** — Edge_#4 Case 1의 비공간 선택 경로 보존.
  - ClassToggles UI는 **색상 칩**. 클래스별 뷰어 색상과 일치.
  - Filters 레이아웃은 **header row** (페이지 상단). Step 9에서 조정 가능.
- 테스트 (필수): selector 11개 + pointcloud detectionId 1개. 전체 **82/82**.
-->


## Step 8 — Frame Timeline ✅ Complete
- [x] Goal: Horizontal timeline to switch between frames.
- Scope: `components/timeline/*` (Timeline, index). Modified: `app/page.tsx`
  (eager enrich + auto-select + `handleSelectFrame` + classes union + Viewer3D
  remount key + Timeline placement), `components/filters/Filters.tsx`
  (props: `frame` → `classes`). New test: `tests/integration/frame-switch.test.ts`.
- Done when:
  - [x] All frames are listed.
  - [x] Clicking a frame sets `selectedFrameId`.
  - [x] Current frame is visually highlighted.
- Tests (required):
  - [x] `tests/integration/frame-switch.test.ts` — **3 tests; suite total 85/85**:
    different-frame switch clears `selectedObjectId`; same-frame click is idempotent
    (preserves object selection); no-prior-selection switch doesn't throw.
    Locks the Edge_#5 Case 6 contract.
- Decisions (full rationale: `docs/edgecases/Edge_#8.md` + linked earlier cases):
  - **Initial frame**: always exactly one selected; `setSelectedFrame: (id: string)`
    signature final (Edge_#3 Case 3 option a). `page.tsx` auto-select effect
    self-heals stale ids by checking existence in `enrichedFrames`.
  - **Camera**: `<Viewer3D key={currentFrame.id}>` remount per frame (Edge_#4
    Case 6). GPU dispose already wired in Edge_#4 Case 4.
  - **Frame-switch object clear**: `handleSelectFrame` in `page.tsx` calls
    `setSelectedFrame(id); setSelectedObject(null);`. Same-id early-return preserves
    selection. Store stays single-purpose (Edge_#5 Case 6).
  - **Class chips union**: `page.tsx` computes union of all frames' classes;
    `Filters` takes `classes: string[]` (Edge_#7 Case 1 Option A).
  - **Eager enrich**: `frames.map((f) => enrichFrame(f))` once. Trivial memory at
    MVP scale; pins point-cloud RNG output per frame.
- Implementation notes:
  - Timeline UI: 96px wide thumbnails (4:3), `ring-2 ring-white` on active,
    placed at page bottom. Native `<img loading="lazy">` (next/image needs
    domain config; no benefit at this size).
- Suite total: **85/85** (82 prior + 3 frame-switch).
- Manual verification:
  - frame_001: Step 7 paint-order fix (bicycle front wheel) ✓.
  - frame_009 id=9-40, frame_002 id=2-11, frame_010 id=10-49: Edge_#2 Case 2/3
    label fallbacks render correctly ✓.
  - 10 frames × 10 roundtrip: no visible regressions. GPU
    `WebGLRenderer.info.memory` numerical audit deferred to Step 9.
- Edge cases (see `docs/edgecases/Edge_#8.md`):
  - Fixed: stale `selectedFrameId` self-heal (Case 1).
  - Deferred to Step 9: fetch `AbortController` (Case 2, pre-existing from Step 1),
    Timeline image-load fallback (Case 3, mirrors `Edge_#2.md` Case 5).
  - Cross-resolved earlier defers: `Edge_#3.md` Case 3, `Edge_#4.md` Case 6,
    `Edge_#5.md` Case 6, `Edge_#7.md` Case 1.

<!-- KO (move to a localized file)
- 결정 (전체 근거는 Edge_#8.md):
  - 초기 frame: 항상 하나 선택. `setSelectedFrame: (id: string)` 시그니처 최종.
    auto-select effect가 stale id도 자가복구.
  - 카메라: `<Viewer3D key={id}>` remount.
  - 선택 클리어: page.tsx의 `handleSelectFrame`이 `setSelectedFrame + setSelectedObject(null)`.
  - 클래스 union: 모든 프레임 클래스 합집합. `Filters`는 `classes: string[]` 받음.
  - Eager enrich: 메모리 무시 가능, RNG 안정성 확보.
- 테스트: frame-switch 통합 3개. **85/85**.
- 수동 검증: frame_001/009/002/010 정상. GPU 누수 수치 audit은 Step 9.
- 엣지 케이스 (Edge_#8.md — 3건):
  - 해결: stale frameId 자가복구 (Case 1).
  - Step 9로 미룸: fetch AbortController, Timeline image fallback.
  - 이전 defer 해결: Edge_#3 Case 3, Edge_#4 Case 6, Edge_#5 Case 6, Edge_#7 Case 1.
-->


## Step 9 — UI Cleanup ✅ Complete
- [x] Goal: Polish layout, spacing, colors, responsive behavior.
- Scope: `lib/ui/class-colors.ts` (new), `app/page.tsx`, `app/global.css`,
  `app/layout.tsx`, `components/viewer-2d/Viewer2D.tsx`,
  `components/viewer-3d/{BBox3D, Scene}.tsx`,
  `components/object-list/ObjectList.tsx`,
  `components/filters/{Filters, ClassToggles}.tsx`,
  `components/timeline/Timeline.tsx`.
- Done when:
  - [x] Layout looks clean on desktop.
  - [x] No visible debug logs or temporary styles.
- Decisions:
  - **CLASS_COLORS → `lib/ui/class-colors.ts`**: 4-file inline duplication removed.
    `getClassColor()`, `DEFAULT_COLOR`, `SELECTED_COLOR` exported from one place.
  - **Deselect consistency**: ObjectList header `stopPropagation` (Edge_#6 Case 3);
    Filters bar background deselects (Edge_#7 Case 2, decided: consistent with other panels).
  - **Fetch cleanup**: `AbortController` added to `page.tsx` fetch; `AbortError` silenced (Edge_#8 Case 2).
  - **Image fallback (shared visual language)**: Viewer2D — `imageError` state + SVG placeholder;
    Timeline — HTML `onError` + `span` placeholder. Each inline; same gray/text aesthetic.
    Resolves Edge_#2 Case 5 and Edge_#8 Case 3 together.
  - **Loading/Error UI**: `animate-pulse` skeleton replaces "Loading…"; centered error + Retry button.
  - **Mobile**: ObjectList `max-h-[60vh] md:max-h-none` (Edge_#6 Case 2).
  - **Global CSS**: Body dark background; NX scaffold dead CSS removed. Title → "AI Detection Viewer".
- Tests: None added (UI polish, no pure functions extracted). **Suite: 85/85**.
- GPU audit (Step 8 deferred): `geometries` oscillated 9 ↔ 13 across 10-frame
  round-trip — matches per-frame detection count variance. No monotonic growth.
  Dispose pattern (`useEffect` cleanup in BBox3D/PointCloud + `key` remount) confirmed effective.
- Edge cases: see `docs/edgecases/Edge_#9.md`.

<!-- KO (move to a localized file)
- 결정: CLASS_COLORS → lib/ui/ 통합; deselect 일관화; AbortController; 이미지 fallback 동일 시각 언어;
  Loading skeleton/Error UI; ObjectList 모바일 높이 제한; body 다크 배경; NX CSS 제거.
- GPU audit: geometries 9↔13 진동, 누수 없음 확인.
- 테스트: 신규 없음. 85/85.
-->


## Step 9.5 — UI Density & Polish

UI density and visual completeness pass before Step 10 ships. Rationale, full
candidate list, and adopt/exclude reasoning live in `docs/etc/NEW_UI.md`.
Architecture impact is recorded in `.claude/docs/architecture.md`
("Step 9.5 Component Contracts (planned)" + "Layout (after Step 9.5)").

**Step 9.5 stop-points are intentionally aligned with phase boundaries.**
Each phase is self-contained: after Phase 1 the project can ship to Step 10
even if Phase 2/3 are skipped.

### Phase 1 — Stabilization + Tone ✅ Complete

- [x] Goal: Remove the blue cast, stabilize Timeline position across frames,
  and give the 3D viewer real spatial cues.
- Scope: Viewer2D `aspect-[4/3]` wrapper; gray → zinc/neutral 3-layer dark +
  sky accent; class colors retuned one step; 3D `<Grid>` + `<fog>` +
  hemisphere light; OrbitControls sensitivity props; `HintBox` overlay.
- Done when:
  - [x] Switching frames no longer moves the Timeline vertically.
  - [x] No `bg-gray-*` blue-cast classes remain; panels share zinc/neutral; `sky` is the single accent.
  - [x] 3D viewer shows a grid floor; objects feel grounded.
  - [x] Mouse interaction with the 3D scene feels noticeably less twitchy.
- Decisions:
  - 3-layer dark: page `zinc-950` / panels `zinc-900` / 3D canvas `neutral-950`. `SELECTED_COLOR = #ffffff` kept (white = "selected object", sky = "active container").
  - Class colors `person/bicycle/car` `-400` → `-300`; `DEFAULT_COLOR` blue-400 → sky-400.
  - Viewer2D deselect handler moved from `<svg>` to wrapper `<div>` so letterbox bands also deselect (Edge_#9.5 Case B).
  - drei `<Grid>` raycast no-oped (`mesh.raycast = () => {}` via ref) so it doesn't hijack `<Canvas onPointerMissed>` (Edge_#9.5 Case A).
  - OrbitControls `rotateSpeed=0.5 / zoomSpeed=0.6 / panSpeed=0.6`.
  - `<fog args={['#0a0a0a', 10, 28]}>` matches canvas background; `<hemisphereLight>` added on top of existing ambient/directional.
  - `HintBox` mounts as `<Canvas>` sibling with `pointer-events-none`.
- Tests: None added. **Suite: 85/85**.
- Edge cases (see `docs/edgecases/Edge_#9.5.md` — 2 cases, both fixed):
  - Case A: drei `<Grid>` raycast steals 3D empty-space deselect.
  - Case B: Viewer2D letterbox bands outside `<svg>` couldn't trigger SVG `onClick`.

### Phase 2 — Identity + Interaction ✅ Complete

- [x] Goal: Give the app a visible identity and tighten interaction feedback
  on the non-spatial selection path.
- Scope: new `components/header/Header.tsx`; ObjectList confidence gauge bar
  + selected-row auto-scroll; Filters `Reset` button + `N/total visible`
  counter; Timeline per-thumbnail detection-count badge; new
  `resetFilters` store action.
- Done when:
  - [x] Brand and per-frame meta are always visible above the fold.
  - [x] Confidence values in the object list are visually scannable, not only textual.
  - [x] A single click restores filters to "show everything".
  - [x] Each timeline thumbnail shows how many detections live in that frame.
- Decisions:
  - Reset surface lives in the store (`resetFilters`) — atomic two-slice
    init inside the filters domain. Different from Edge_#5 Case 6's
    `handleSelectFrame` (cross-domain composite stays in `page.tsx`).
  - Detection count split: Header shows raw `frame.detections2D.length`;
    Filters counter shows filtered `visibleIds.size / total`. Avoids two
    competing widgets.
  - Timeline badge renders for count = 0 too — consistency over noise.
- Tests: `resetFilters` 2 unit tests (restore + slice independence). **Suite: 87/87**.
- Edge cases (see `docs/edgecases/Edge_#9.5.md` Phase 2 section — 1 case):
  - Case C: ObjectList `scrollIntoView({ block: 'nearest' })` chained up to
    outer scroll containers and could move the page on short viewports.
    Replaced with manual `ul.scrollTop` adjustment scoped to the list.


### Excluded from Step 9.5 (rationale: see `docs/etc/NEW_UI.md`)

- Light-theme switch — would force re-design of 2D class colors,
  `SELECTED_COLOR`, and the SVG glow filter at the same time as the rest
  of Step 9.5; scope blows up.
- Recharts adoption — overkill for ≤10 detections per frame and ≤5 chart
  elements; hand-rolled SVG/CSS keeps the dependency surface small.
- Donut chart for class composition — arc math adds SVG complexity for no
  readability win at 3 classes; horizontal bar is more scannable and
  scales naturally to KITTI's 8 classes.
- Per-frame detection-count line chart — current sample frames are
  independent COCO val2017 images, not a video sequence; a time axis would
  invite misreading. The Timeline detection-count badge (Phase 2) covers
  the same information without implying continuity.
- Inter-frame object tween — COCO has no `Detection2D.id` continuity
  across frames; tween requires real tracking.
- Heuristic / fake tracking — would conflict with Step 4/5/8 contracts
  (camera reset on key remount, selection clear on frame switch, GPU
  dispose) and adds risk for a portfolio gain that is undermined by the
  word "fake".
- 3D fade transition on frame switch — would force replacing the
  `<Viewer3D key={frame.id}>` remount strategy adopted in Step 8
  (Edge_#4 Case 6); cost outweighs the visual gain.

<!-- KO (move to a localized file)
- Phase 1 — 안정화 + 톤: Viewer2D fixed-aspect, 다크 톤 zinc/neutral 베이스로 교체 + sky 액센트, 3D Scene grid/fog/hemisphere light, 카메라 민감도 완화, 3D hint box.
- Phase 2 — 정체성 + 인터랙션: Header, ObjectList 신뢰도 게이지 + hover/selected ring, Filters reset 버튼 + 가시 카운트, Timeline 객체 수 뱃지.
- Phase 3 — Analytics: 12-col 5/7 레이아웃, SelectedObjectInfo, ConfidenceHistogram(SVG, 슬라이더 overlay), ClassCountBar(CSS, 클릭 시 toggleClass), lib/selectors에 confidence-buckets / class-counts 추가 + unit test.
- 제외(요약): 라이트 테마 / Recharts / 도넛 / 프레임 라인 차트 / 객체 tween / 가짜 tracking / 3D fade.
-->



## Step 10 — README + Deploy

- [x] Goal: Write README, deploy to Vercel.
- Scope: `README.md` (new content), `vercel.json` (new).
- Done when:
  - [x] README explains project goal, tech stack, how to run, and known limitations
    (especially: 3D data is estimated, not real LiDAR).
  - [ ] Live demo URL works on Vercel. ← 사용자가 배포 후 URL 교체
- Decisions:
  - **Deployment model: `vercel.json` at repo root (Root Directory = `.`).**
    Nx monorepo with empty root `scripts` and no `dev`/`build`/`start` scripts
    on the app's package.json → Vercel needs an explicit build command pointing
    at `npx nx build ai_detection_viewer_client`. Setting Root Directory to the
    app folder would fail because workspace deps are hoisted to repo root.
  - **README language: Korean only.** Portfolio target audience reads Korean;
    English canonical spec lives in `.claude/docs/` for the internal spec triangle.
  - **Live demo URL: placeholder until deploy completes.** User replaces
    `https://ai-detection-viewer.vercel.app` with actual Vercel URL after first deploy.
  - **No new feature work.** KITTI ingestion and detectron2 prediction swap are post-MVP.
- Tests: None added. Suite stays at **99/99**.
- Manual verification (사용자가 직접 수행):
  - [ ] Vercel 프로젝트 생성 → GitHub 저장소 연결
  - [ ] vercel.json에 의해 framework / build command 자동 인식 확인
  - [ ] 첫 배포 후 sample-data 정적 자원 로드 확인
  - [ ] 2D↔3D 선택 동기화 동작 확인
  - [ ] README Live demo URL placeholder를 실제 URL로 교체

<!-- KO (move to a localized file)
- 결정:
  - 배포: 루트 vercel.json + Root Directory = `.`. Nx monorepo의 hoisted deps 때문에
    app dir을 Root로 잡으면 install이 실패함.
  - README 언어: 한국어 단일. 영문 canonical은 `.claude/docs/` 스펙 삼각형에 이미 존재.
  - Live URL: placeholder로 시작, 사용자가 배포 후 직접 교체.
  - 신규 기능 없음. KITTI / prediction swap은 post-MVP.
- 테스트: 신규 없음. **99/99**.
- 수동 검증: Vercel 프로젝트 생성 → GitHub 연결 → 자동 배포 → URL 교체.
-->

## Step 11 — Prediction Data ✅ Complete

- [x] Goal: Replace ground-truth `sample.json` with model prediction output
  so that `score` fields are populated, making the confidence slider and histogram meaningful.
- Scope: `public/sample-data/sample.json` replacement + `scripts/generate_predictions.py` (new).
  No frontend code changes — `CocoAnnotation.score?: number` and the
  `confidence = Number.isFinite(ann.score) ? ann.score : 1.0` fallback already existed.
- Done when:
  - [x] `sample.json` contains prediction annotations with varied `score` values (0.0–1.0 range).
  - [x] `npm test` (app dir) still passes **99/99** with new data.
  - [x] Confidence histogram shows a real distribution (not a plateau at 1.0).
- Implementation:
  - Model: YOLOv8n (ultralytics 8.4.51, CPU inference). Model file 6.2MB, auto-downloaded.
  - Classes kept: person(0→1) / bicycle(1→2) / car(2→3). Other COCO-80 classes filtered out.
  - Confidence threshold: 0.25. Results: 47 annotations across 10 frames.
  - Score distribution: min=0.274 / max=0.904 / mean=0.577. Low(0.25~0.5): 20, Mid(0.5~0.9): 26, High(0.9+): 1.
  - Original GT data backed up to `public/sample-data/sample.gt_backup.json`.
  - Script is idempotent; re-running creates a fresh backup and overwrites `sample.json`.
- Tests: None added (data swap, no new code). Suite: **99/99**.
- Note: `npx nx test` fails with a pre-existing Nx/vitest-v4 runner resolution issue unrelated
  to this step. `npm test` from the app directory is the correct test command.

---

## How to Use This Checklist

When asking Claude Code to work on a step, say something like:
> "Let's work on Step 4. Read the architecture doc first. Show me the file plan before coding."

Do not jump steps. Each step builds on previous ones.
If a step reveals a problem in an earlier step, fix the earlier step before continuing.