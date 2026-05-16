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


## Step 4 — 3D Scene (basic)
- [ ] Goal: Render point cloud + 3D bboxes in R3F with OrbitControls.
- Scope: `components/viewer-3d/*`, `lib/geometry/*`.
- Done when:
  - `Detection2D` data is converted into `Detection3D` + `Point3D[]` via `lib/geometry/`.
  - Point cloud renders using `BufferGeometry`.
  - 3D bboxes render as wireframe boxes at estimated positions.
  - OrbitControls allows mouse navigation.
- Tests (required):
  - [ ] `lib/geometry/<estimator>.test.ts` — verify pure conversion functions:
    - id preservation: `Detection2D.id === Detection3D.id` for every input (Immutable Rule #1).
    - class/confidence pass through unchanged.
    - Larger bbox area produces a smaller `z` (closer-to-camera) than a smaller bbox area.
    - bbox center coordinates map to expected 3D `x`, `y` (document the mapping).
    - Point cloud generator returns the expected number of points and stays inside the bbox volume.
    - Empty `Detection2D[]` input returns empty `Detection3D[]` and `Point3D[]`.
  - Do not test the R3F canvas itself.

<!-- KO (move to a localized file)
- 테스트 (필수):
  - [ ] `lib/geometry/<estimator>.test.ts` — 순수 변환 함수 검증.
    - id 보존: 모든 입력에 대해 `Detection2D.id === Detection3D.id` (Immutable Rule #1).
    - class, confidence는 그대로 통과한다.
    - bbox 면적이 클수록 더 작은 `z`(카메라에 더 가까움)를 만든다.
    - bbox 중심 좌표가 예상한 3D `x`, `y`로 매핑된다 (매핑 방식은 문서화).
    - point cloud 생성기는 예상 개수의 포인트를 반환하고 bbox 부피 안에 머문다.
    - 빈 `Detection2D[]` 입력은 빈 `Detection3D[]`, `Point3D[]`를 반환한다.
  - R3F 캔버스 자체는 테스트하지 않는다.
-->


## Step 5 — 2D ↔ 3D Selection Sync
- [ ] Goal: Clicking an object in 2D highlights it in 3D, and vice versa.
- Scope: viewer-2d, viewer-3d, store.
- Done when:
  - Clicking a 2D bbox sets `selectedObjectId`.
  - Clicking a 3D bbox sets `selectedObjectId`.
  - The selected object highlights in BOTH views.
  - Clicking empty space deselects.
- Tests (integration starts here):
  - [ ] `tests/integration/selection-sync.test.ts` — wire the real store with the selector logic used by both viewers (not the canvases themselves).
    - Selecting an id "from 2D" produces the same `selectedObjectId` queried "from 3D".
    - Selecting the same id twice does not throw or duplicate state.
    - `setSelectedObject(null)` clears the selection (deselect path).
  - Still no DOM/canvas rendering tests. Verify the data contract only.

<!-- KO (move to a localized file)
- 테스트 (통합 테스트 시작):
  - [ ] `tests/integration/selection-sync.test.ts` — 두 뷰어가 공유하는 셀렉터 로직을 실제 store와 함께 검증 (캔버스 자체는 테스트하지 않음).
    - "2D에서" id를 선택하면 "3D에서" 조회한 `selectedObjectId`가 동일하다.
    - 같은 id를 두 번 선택해도 예외나 중복 상태가 발생하지 않는다.
    - `setSelectedObject(null)`로 선택이 해제된다.
  - DOM/캔버스 렌더링은 여전히 테스트하지 않는다. 데이터 계약만 검증한다.
-->


## Step 6 — Object List Panel
- [ ] Goal: Side panel listing detections in the current frame.
- Scope: `components/object-list/*`.
- Done when:
  - List shows class, confidence, id.
  - Clicking a list item selects that object (sync with 2D/3D).
  - Selected list item is visually highlighted.

## Step 7 — Filters
- [ ] Goal: Confidence threshold slider + class visibility toggles.
- Scope: `components/filters/*`, store.
- Done when:
  - Slider updates `confidenceThreshold` in store.
  - Class toggles update `visibleClasses` in store.
  - Both 2D and 3D viewers respect these filters.
- Tests (required):
  - [ ] Selector unit tests — given a `Frame` and store state, the visible-detections selector returns only detections that:
    - have `confidence >= confidenceThreshold`, AND
    - have `class` in `visibleClasses` (or `visibleClasses` empty means "show all" — pick one and lock it with a test).
  - Threshold = 0 returns all detections; threshold = 1 returns only confidence-1.0 detections.

<!-- KO (move to a localized file)
- 테스트 (필수):
  - [ ] 셀렉터 유닛 테스트 — `Frame`과 store 상태가 주어졌을 때, 가시 detections 셀렉터가 다음 조건을 모두 만족하는 detection만 반환한다.
    - `confidence >= confidenceThreshold`이고,
    - `class`가 `visibleClasses`에 포함된다 (또는 `visibleClasses`가 비었으면 "모두 표시" — 한 가지 의미로 정하고 테스트로 잠근다).
  - threshold = 0이면 모든 detection이, threshold = 1이면 confidence가 1.0인 것만 반환된다.
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