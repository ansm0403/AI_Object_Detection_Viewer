# MVP 진행 체크리스트
## MVP 1~10번 진행 상태 추적

# MVP Checklist

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


## Step 8 — Frame Timeline
- [ ] Goal: Horizontal timeline to switch between frames.
- Scope: `components/timeline/*`.
- Done when:
  - All frames are listed.
  - Clicking a frame sets `selectedFrameId`.
  - Current frame is visually highlighted.

## Step 9 — UI Cleanup
- [ ] Goal: Polish layout, spacing, colors, responsive behavior.
- Scope: all components, Tailwind classes.
- Done when:
  - Layout looks clean on desktop.
  - No visible debug logs or temporary styles.

## Step 10 — README & Deployment
- [ ] Goal: Write README, deploy to Vercel.
- Done when:
  - README explains project goal, tech stack, how to run, and known limitations
    (especially: 3D data is estimated, not real LiDAR).
  - Live demo URL works on Vercel.

---

## How to Use This Checklist

When asking Claude Code to work on a step, say something like:
> "Let's work on Step 4. Read the architecture doc first. Show me the file plan before coding."

Do not jump steps. Each step builds on previous ones.
If a step reveals a problem in an earlier step, fix the earlier step before continuing.