# Post-MVP 기능 체크리스트
## MVP 완료 이후 추가 기능 진행 상태 추적

# Post-MVP Checklist

> **Active progress log.** The MVP (Steps 1–11) shipped; `mvp-checklist.md` is now a 🔒 frozen
> baseline. All new feature work is tracked here.

## How this doc works

- **Unit is a loose "Feature", not a strict "Step."** Post-MVP work is optional and may be
  reordered or dropped (e.g. KITTI is still undecided). Features are numbered `F1`, `F2`, … in
  the order they are *started*, not in any mandatory sequence.
- **Per-feature template** (carried over from the MVP checklist):
  Goal / Scope / Done when / Tests / Decisions / Edge case refs.
- **Living spec stays in `architecture.md`.** Update it (data model, folder structure, component
  contracts) when a feature lands — this doc is the *log*, `architecture.md` is the *current truth*.
- **New domain terms → `domain-glossary.md` immediately.**
- **Edge cases → `docs/edgecases/Edge_F#N.md`** (F = Feature), created only when a feature actually
  surfaces edge cases, and cross-referenced from the feature's entry below.
- **Testing Policy unchanged:** test only pure logic in `lib/coco`, `lib/geometry`, `lib/selectors`,
  `store/`. Do NOT test React/R3F rendering. UI-only features add no tests.

---

## F1 — Visual Impact Pass ✅ Done (1A + 1B + 1C)

A bundle of three independent 3D-viewer enhancements chosen for high visual payoff and (near-)zero
domain-learning cost. Goal: make the 3D viewer read as genuinely three-dimensional and interactive
in a demo screenshot/video, before deciding whether to take on KITTI.

No new dependencies — `@react-three/drei` (already installed) provides `<Html>`.

Sub-features can ship independently; recommended order **1A → 1B → 1C** (1C reuses 1B's hover state).

### F1-A — Point cloud depth color encoding ✅ Done

- [x] Goal: Color each point by its depth so the cloud looks 3D instead of a flat gray blob.
- Scope: `lib/geometry/depth-color.ts` (new, pure) + `depth-color.test.ts`;
  `components/viewer-3d/PointCloud.tsx` (add per-vertex `color` BufferAttribute, set
  `vertexColors` on `<pointsMaterial>`).
- Background (beginner): a `BufferGeometry` can carry a **per-vertex color attribute** — an array
  with one RGB triple per point, uploaded to the GPU alongside `position`. Setting
  `vertexColors` on the material tells WebGL to shade each point by its own color. We map a point's
  `z` (depth) through a **color ramp** (a gradient between two colors) so near points and far points
  read differently.
- Done when:
  - [x] Each point's color is derived from its `z` via a pure `depthToColor(z, minZ, maxZ)` function
        living in `lib/` (NOT in the component — Immutable Rule #3 spirit: conversion logic outside
        React). → `lib/geometry/depth-color.ts`.
  - [x] The cloud shows a visible near→far gradient in the viewer (per-vertex `color` BufferAttribute
        + `vertexColors` on `<pointsMaterial>`).
  - [x] `visibleIds` filtering still works (colors computed on `visiblePoints`, the filtered set).
  - [x] GPU dispose pattern preserved (the color attribute lives on the same geometry that
        `useEffect` already disposes — Edge_#4 Case 4).
- Decisions made during impl:
  - **z range source (REVISED after visual review):** initially reused estimator's fixed `[1,8]`, but
    the gradient was invisible. **Measured cause:** the estimator compresses COCO objects to the far end
    — ~85% of the 47 sample detections sit in `z∈[7,8]`, so `[1,8]` used only the top ~15% of the ramp
    (mean normalized `t ≈ 0.93`). **Fix:** fit the ramp **per frame** to that frame's actual point-z range
    via `depthRange(points)` (pure, in `depth-color.ts`), computed pre-filter so class toggles don't
    recolor. Trade-off accepted: same object may shade differently across frames (depth is an approximation,
    Rule #6). Even "all-similar-depth" frames (e.g. span ≈ 0.9) now fill the full ramp. See Edge_F#1 Case 1.
  - **Ramp colors (finalized after render verification):** **Cyan → Violet** (`#22d3ee` → `#a855f7`)
    — cool/on-theme and clearly readable. Two constraints learned by screenshotting the live app
    (Edge_F#1 Case 3): both ends must be bright (a dark far end vanishes on the near-black bg) AND
    differ in hue (two light-blues read as one color). `cyanMagenta` (higher punch) and `skyIndigo`
    alternates kept; swap via the one-line `ACTIVE_PALETTE`.
  - **Point size (finalized after render verification):** `0.04 → 0.2` (with `sizeAttenuation`).
    At small sizes the per-point color was unreadable specks; verified by screenshot.
  - **Tone mapping:** added `flat` to `Viewer3D`'s `<Canvas>` — R3F's default ACES tone mapping
    desaturated the colors toward white. A scene-wide change, appropriate for data-viz. (Edge_F#1 Case 3.)
  - **Degenerate range:** `minZ === maxZ` (all-equal z) → returns the **ramp midpoint** (`t = 0.5`),
    no divide-by-zero. Clamping is also retained as defense. Base material color kept white so
    `vertexColors` multiply shows the ramp unchanged.
- Tests (done — pure fn): `depth-color.test.ts`, **15 tests** — `depthToColor`: exact ramp endpoints,
  channel-wise monotonic mapping (smaller z → near end), clamping outside `[minZ, maxZ]`, degenerate
  `minZ === maxZ` midpoint + stability, all channels ∈ `[0,1]`; `depthRange`: min/max, single point,
  all-equal (→ midpoint), negatives, empty placeholder.
- Edge cases: `Edge_F#1.md` Case 1 (domain mismatch [1,8] → per-frame fit), Case 2 (degenerate range → midpoint).

### F1-B — 3D hover highlight ✅ Done

- [x] Goal: Hovering a 3D bbox highlights it and the cursor signals "clickable."
- Scope: `components/viewer-3d/BBox3D.tsx` (add `onPointerOver` / `onPointerOut` on the existing
  invisible click mesh, local `hovered` state, hover wire tint, cursor change). **Single file —
  no Scene/store/type change.**
- Background (beginner): R3F forwards pointer events to 3D meshes. `onPointerOver` /
  `onPointerOut` fire when the raycaster enters/leaves a mesh. We already have an invisible
  full-volume click mesh for reliable clicking (Step 5) — hover hangs off the same mesh.
- Done when:
  - [x] Hovering a non-selected bbox visibly highlights it (distinct from the selected look:
        selected = white + scale pulse; hover = lighter class tint + static `1.02` scale, no pulse).
  - [x] Cursor becomes `pointer` over a bbox, resets on leave.
  - [x] Hover does not fight selection: a selected box keeps its selected look while hovered
        (selection branch wins in both color and scale).
- Decisions made during impl:
  - **Hover look = lighter class tint + static +6% scale (no pulse).** Tint is
    `THREE.Color(getClassColor(class)).lerp(white, 0.6)`, memoized so the material isn't handed a
    fresh `THREE.Color` per render. A static scale was added (over tint-only) for a touch more
    pop while staying clearly separate from the selected white+pulse look (whose scale stays in
    `0.96–1.04`, so the static `1.06` is also size-distinguishable). Priority is
    **selected > hovered > normal** in both `wireColor` and the `useFrame` scale branch.
    **Render-verified bump:** started at `0.45`/`1.02`, but a Playwright hover screenshot showed it
    barely read on the near-black bg with 1px wires (same lesson as F1-A Case 3) → raised to
    `0.6`/`1.06`. The cursor→`pointer` change is the primary, unambiguous hover affordance; tint+scale
    are secondary polish.
  - **Cross-view hover sync is OUT of scope.** Syncing hover to 2D/ObjectList would need a new
    `hoveredObjectId` store field — that is scope expansion (touches Immutable Rule #2's
    single-selection design). Hover is kept local to the 3D viewer. Noted as a possible later
    feature.
  - **`stopPropagation` on `onPointerOver`/`onPointerOut`** (matching the existing `onClick`), so
    only the front box highlights when boxes overlap.
  - **Cursor reset (defensive, Edge_F#1 Case 4):** cursor is driven by an effect that only acts
    when `hovered` is true (`document.body.style.cursor = 'pointer'`) and whose cleanup resets to
    `'auto'`. That cleanup also runs on unmount, so a hovered box that disappears (frame switch /
    filtered out) before `onPointerOut` fires still resets the cursor. React runs cleanups before
    new effects, so moving pointer box→box never leaves the cursor stuck on `'auto'`.
- Tests: none (UI interaction, no pure logic — per Testing Policy). Suite unchanged at **114/114**.
  **Render-verified via Playwright** (headless chromium/SwiftShader): probed a click to locate a
  bbox, then hovered it (move, no click) — confirmed cursor `auto`→`pointer`→`auto` (incl. reset on
  leave), the hovered box stays non-selected, and the tint+scale read against the no-hover crop.
- Edge cases: `Edge_F#1.md` Case 4 (cursor reset when a hovered box unmounts before `onPointerOut`;
  also notes the tint/scale render-verification).

### F1-C — 3D `<Html>` anchor labels ✅ Done

- [x] Goal: A floating info label anchored to a bbox in 3D space, following it as the camera
  orbits. Directly satisfies the earlier wish: "click an object → an info box appears at it."
- Scope: `components/viewer-3d/BBoxLabel.tsx` (new — drei `<Html>` pill) + `BBox3D.tsx` (group
  split + conditional mount). No store/type/Scene change.
- Background (beginner): drei's **`<Html>`** renders ordinary HTML/CSS and pins it to a 3D
  coordinate, so a normal styled `div` "hangs" off a point in the scene and tracks it through
  camera rotation/zoom (like a map pin or a name tag over a game character). This bridges the
  2D (HTML/React) and 3D (WebGL) worlds without drawing text as 3D geometry.
- Done when:
  - [x] Selected (and hovered, reusing F1-B state) bboxes show a label with class + confidence
        (`● class NN%`). Data comes straight off `Detection3D` (class + confidence) — no 2D lookup.
  - [x] The label tracks the box as the camera orbits/zooms (render-verified: orbit screenshot
        shows the pill following its box).
  - [x] The label never breaks deselect: `pointer-events-none` on both the `<Html>` container and
        the inner node; render-verified that empty-space click still fires `onPointerMissed`.
- Decisions made during impl:
  - **Label size = constant on-screen (no `distanceFactor`).** Reads at any zoom; a name-tag look.
  - **Group split to stabilize the anchor.** `BBox3D` now nests an inner (pulse/hover-scaled) group
    inside an outer (position-only) group, and the label mounts on the OUTER group. Without this the
    selected-box pulse (±4%) would jitter the label. The click/hover mesh + wireframe stay on the
    inner group (their scale behavior is unchanged).
  - **Which boxes get labels:** selected + hovered only (`isSelected || hovered`) — one label per
    box, ≤2 on screen at once, no clutter. Always-on rejected.
  - **Anchor point:** box top (`size.y/2 + LABEL_Y_PAD`, pad `0.15` world units) so the pill sits
    just above the wireframe; the pill's own CSS `translate(-50%, -120%)` lifts it clear of the edge.
  - **Occlusion (`<Html occlude>`):** OFF for F1 — acceptable with ≤2 labels; revisit if a label
    behind geometry looks wrong on a denser dataset.
  - **Relation to `SelectedObjectInfo`:** panel card kept; the `<Html>` label is an *additional*
    in-scene affordance, not a replacement.
  - **Extensibility — intentionally minimal now (class + confidence only).** `BBoxLabel` takes flat
    scalar props (`label`, `confidence`, `color`) to match the current scope; NOT generalized for
    arbitrary fields (avoiding speculative generalization, per CLAUDE.md). This is cheap to extend
    later because `BBox3D` already holds the whole `detection: Detection3D` object, so adding a field
    is ~1–2 lines in `BBoxLabel.tsx` + one passthrough line in `BBox3D.tsx` (plus whatever
    data-model/enricher change the new field itself needs — a cost paid regardless of label shape).
    The label depends only on the internal `Detection3D` (not COCO raw schema), so a KITTI swap
    won't break its contract — just enrich `Detection3D` and read the new field (conditional render
    for optional KITTI-only fields like distance / 3D dims / truncation).
    **🔖 Refactor trigger (refactor-on-second-use):** when the FIRST extra info field is added
    (likely during a KITTI migration), switch `BBoxLabel` from scalar props to taking the
    `detection` object directly — after that, further fields touch only `BBoxLabel.tsx` (no
    passthrough). Do NOT pre-do this refactor; the second-field moment is the trigger.
- Tests: none (UI — per Testing Policy). Suite unchanged at **114/114**. Render-verified via
  Playwright: label appears on select + hover, tracks through an orbit drag, stays constant-size,
  box stays unselected on hover, and empty-space click still deselects (label count 1→0).
- Edge cases: `Edge_F#1.md` Case 5 (`<Html>` overlay vs `onPointerMissed` deselect — guarded by
  `pointer-events-none`, render-verified).

### F1 — to fill on completion
- Files changed / added:
  - F1-A: **added** `lib/geometry/depth-color.ts` (`depthToColor` + `depthRange`),
    `lib/geometry/depth-color.test.ts`; **changed** `lib/geometry/index.ts` (barrel exports
    `depthToColor`, `depthRange`), `components/viewer-3d/PointCloud.tsx` (per-vertex color +
    `vertexColors`, per-frame `depthRange` domain, point size `0.04→0.2`, dropped unused `color` prop),
    `components/viewer-3d/Viewer3D.tsx` (`flat` tone mapping). Final look render-verified via screenshot.
  - F1-B: **changed** `components/viewer-3d/BBox3D.tsx` only — local `hovered` state,
    `onPointerOver`/`onPointerOut` (+`stopPropagation`) on the invisible click mesh, lightened
    class-tint wire (`lerp(white, 0.6)`) + static `1.06` hover scale, cursor `pointer`↔`auto`
    via hover effect (cleanup doubles as defensive unmount reset). No store/type/Scene change.
    Render-verified (Playwright); tint/scale raised from `0.45`/`1.02` after the screenshot review.
  - F1-C: **added** `components/viewer-3d/BBoxLabel.tsx` (drei `<Html>` info pill, constant size,
    `pointer-events-none`); **changed** `components/viewer-3d/BBox3D.tsx` (outer position-only group +
    inner scaled group, conditional `<BBoxLabel>` mount on select/hover at box top). No store/type/
    Scene change. Render-verified: tracking on orbit + deselect intact.
- Suite total: **114/114 passing** (F1-B and F1-C add no tests — UI only, per Testing Policy).
- Edge cases (Edge_F#1.md): Case 1 (ramp domain mismatch [1,8] → per-frame fit), Case 2 (degenerate
  range → midpoint), Case 3 (point size + tone mapping, render-verified), Case 4 (F1-B hover cursor
  reset on unmount + tint/scale render-review), Case 5 (F1-C `<Html>` overlay vs `onPointerMissed`
  deselect, guarded by `pointer-events-none`).
- Architecture.md updates made: PointCloud contract (depth color), BBox3D contract (F1-B hover +
  F1-C group split/label), new `BBoxLabel` contract row, `viewer-3d/` folder listing
  (`BBoxLabel.tsx`, `HintBox.tsx`), `lib/geometry/` listing (`depth-color.ts` + `.test.ts`).
  domain-glossary.md: per-vertex color attribute, vertex colors, color ramp, tone mapping, domain
  fitting, Raycaster, Pointer Events (R3F), `<Html>` (drei).

<!-- KO (move to a localized file)
## F1 — 시각적 임팩트 묶음 (계획)
3D 뷰어가 데모에서 "진짜 3D + 인터랙티브"하게 보이도록 하는 3종 묶음. 도메인 학습 부담 거의 0,
신규 의존성 없음(`<Html>`은 이미 설치된 drei 제공). 권장 순서 1A → 1B → 1C.

- **1A 점 구름 깊이 색상**: 점마다 z(깊이)로 색을 매겨 평면 회색 덩어리 → 입체감.
  - per-vertex color attribute(점마다 RGB 한 개)를 BufferGeometry에 올리고 `vertexColors` 켬.
  - 변환 로직은 컴포넌트 밖 `lib/geometry/depth-color.ts` 순수 함수로(규칙 #3 정신) → 유닛 테스트.
  - z 범위는 estimator의 MIN_Z=1 ~ MAX_Z=8 재사용(프레임 간 색 안정). minZ===maxZ 0division 가드.
  - 램프 색은 zinc/sky 테마 유지(가까움=밝은 sky/cyan, 멀음=어두운 deep-blue 제안).
- **1B 3D 호버 강조**: bbox 위에 마우스 올리면 강조 + 커서 pointer.
  - 기존 invisible click mesh에 onPointerOver/Out + 로컬 hovered 상태.
  - 선택(흰색+펄스)과 구분되는 호버 룩(밝은 클래스 틴트). 2D/리스트 호버 동기화는 범위 밖(store 확장).
- **1C 3D `<Html>` 앵커 라벨**: 객체에 매달려 카메라 따라다니는 정보 말풍선.
  - drei `<Html>`로 평범한 HTML을 3D 좌표에 고정. "클릭 위치에 정보 박스" 욕구 해소.
  - 선택+호버 객체에만 표시(클러터 방지). pointer-events-none으로 deselect 안 막게.
  - 기존 SelectedObjectInfo 패널은 유지(추가 affordance지 대체 아님).
- 테스트: 1A만 순수 함수 유닛 테스트. 1B/1C는 UI라 테스트 없음(Testing Policy).
-->

---

## F2 — nuScenes Real-3D Integration ✅ Done (F2-A ✅, F2-B ✅, F2-C ✅)

Replace *estimated* 3D (COCO → invented depth) with *measured* 3D from **nuScenes**,
added **alongside** COCO via a dataset switcher (not a replacement — the Step 11 YOLO /
confidence / histogram work stays live). This removes the project's headline weakness
("3D is estimated") for nuScenes frames while keeping the estimated-3D story for COCO.

Decided in the F2 study + planning sessions (`docs/learning/REAL_3D_DATASET_STUDY.md`):
nuScenes over KITTI/Waymo. Web-friendly JSON, modern/360°, leverages the user's relational-DB
experience; KITTI was the cheap stepping-stone to learn label structure + coordinate frames.

Structure/contract notes live in `architecture.md` ("nuScenes Integration").

### Two facts that shape the whole feature (verified in planning — do not re-litigate)
1. **No zero-transform path.** nuScenes annotations are in the **global** frame, so even
   "boxes only" needs a real `global→ego` transform + the z-up→y-up axis convention. Unlike
   KITTI Level 1, there is no calibration-free path.
2. **No 2D boxes in nuScenes.** Core annotations are 3D-only. To keep the 2D↔3D sync signature,
   `lib/` **projects** each 3D box into the camera image. 2D + 3D come from the same `instance`
   annotation → they share one id → **Immutable Rule #1 preserved**.

### Locked decisions (from the planning AskUserQuestion)
- **A. First slice = F2-A only:** measured 3D boxes + projected 2D boxes + 2D↔3D sync.
  No real point cloud (F2-B), no sequence (F2-C).
- **B. Pipeline = offline prep → static JSON, transforms in `lib/` TS.** One-time build-time
  script (`scripts/`, like Step 11's `generate_predictions.py`) flattens nuScenes-mini's
  relational tables and emits a compact static JSON carrying **raw** values (global boxes +
  `ego_pose` + `calibrated_sensor` + camera `intrinsic` + `instance` token). The browser parses
  it like COCO; **all coordinate math stays in `lib/` and is Vitest-tested** (Rule #3). No runtime
  backend → Vercel-static identity intact.
- **C. Filter = add a distance(z) selector; keep confidence for COCO.** Real metres now exist, so
  "hide beyond 50 m" is a real filter. Confidence slider is a no-op on nuScenes (annotation = 1.0)
  but stays live for COCO/YOLO. **No fake confidence injected** (Rule #6).
- **D. rotation = optional quaternion** `bbox3D.rotation?: [x,y,z,w]`. Absent = identity, so COCO
  estimated boxes / F1 / existing tests are untouched.
- **(default, no objection) Coexistence via dataset switcher**, not replacement.
- **(default, no objection) Rule #6 → `source` flag.** `Frame.source: 'coco-estimated' |
  'nuscenes-measured'` drives an "Estimated"/"Measured" UI badge. Rule #6's spirit (never
  misrepresent depth provenance) is upheld across both datasets, not dropped.

### Immutable Rule interactions
- **#1 (2D.id == 3D.id):** preserved — projected 2D + source 3D share the `instance`-derived id.
  The projection step MUST carry the id through unchanged.
- **#3 (conversion logic outside React/store):** all transforms/projection in `lib/`
  (`lib/geometry/transforms.ts`, `projection.ts`) + `lib/nuscenes/parser.ts`. The offline script
  only flattens/copies — it does no coordinate math.
- **#6 (3D estimated, never claim real):** scoped, not dropped. COCO frames keep "Estimated";
  nuScenes frames are truthfully "Measured" via the `source` flag. Injecting fake confidence is
  still forbidden.
- **#7 (COCO is 2D-only):** untouched. nuScenes has its own parser; we never read 3D from COCO JSON.

### F2-A — Measured 3D boxes + projected 2D + sync ✅ Done (lib + data + UI)

- [x] Goal: A nuScenes keyframe renders real measured 3D boxes (with rotation) in the 3D viewer
      and projected 2D boxes on the camera image, fully selection-synced — picked via the dataset
      switcher, badged "Measured".
- Scope (planned): `scripts/` offline prep; `public/sample-data/nuscenes/`; `lib/nuscenes/`
  (parser + prepped-JSON types); `lib/geometry/transforms.ts` + `projection.ts` (+ tests);
  `lib/types` (`Frame.source`, `bbox3D.rotation?`); `lib/selectors/` distance filter (+ test);
  a dataset-source switcher + "Estimated/Measured" badge in the UI; `BBox3D` reads `rotation`.
- Done when:
  - [x] A dataset switcher toggles between the COCO sample and the nuScenes sample. (Segmented
        control in the Header; switching clears selection + `resetFilters()`, frame auto-re-homes.)
  - [x] nuScenes 3D boxes render at measured positions with correct orientation (quaternion).
        (`BBox3D` applies `bbox3D.rotation` as the inner-group quaternion; render-verified — parked
        cars show consistent diagonal headings.)
  - [x] Projected 2D boxes appear on the camera image and select-sync with the 3D boxes (shared id).
        (13/40 project on frame 0; the rest are 3D-only, Edge_F#2 Case 1. Sync via shared
        `selectedObjectId`, render-verified 2D→3D.)
  - [x] Distance filter hides boxes beyond a threshold (metres); confidence slider no-ops gracefully.
        (Per-dataset slider swap: nuScenes shows the Distance slider, COCO the Confidence slider —
        no fake-confidence metre filter over estimated depth, Rule #6. Render-verified 40→19 @ 25 m.)
  - [x] The frame shows a "Measured" badge; COCO frames still show "Estimated".
        (`enrichFrame` now stamps `source: 'coco-estimated'`; nuScenes parser stamps
        `'nuscenes-measured'`. Both render-verified.)
  - [x] COCO path, F1 visuals, and the full suite are unaffected. (`source`/`rotation` are optional →
        existing COCO frames and F1 tests untouched; full suite 114 → 147 → **166 passing**. COCO
        camera/fog/depth-color render-verified unchanged.)
- Tests (required — pure logic): `transforms.test.ts` (global→ego round-trip, axis convention,
  quaternion identity when absent), `projection.test.ts` (known 3D point → expected pixel; behind-camera
  cull), `lib/selectors` distance-filter test, `lib/nuscenes/parser` test (prepped JSON → Frame, id
  shared across 2D/3D). UI (switcher/badge/rotation render) — no tests, per Testing Policy.

#### Progress — lib pure core ✅ Done (this session); data + UI ⏳ next

The coordinate math + parser landed first, TDD with synthetic fixtures (no real nuScenes data, no
download, no UI). **Done this session:**
- [x] `lib/geometry/transforms.ts` (+13 tests) — `quatNuToThree` ([w,x,y,z]→[x,y,z,w], absent→identity),
      `globalToEgo` (`R_ego⁻¹·(p−t_ego)`), `globalQuatToEgo`, `egoToThree` axis flip `(x,y,z)→(-y,z,-x)`
      (det=+1, up→y, fwd→−z), `egoQuatToThree`, `nuSizeToLocal` ([w,l,h]→[l,w,h]).
- [x] `lib/geometry/projection.ts` (+10 tests) — `egoToCamera`, `cameraToPixel` (K·p, in-front=z>0),
      `boxCornersEgo` (8 corners), `projectCornersToBbox` (AABB of projected corners; behind-camera or
      fully off-screen → `null`; image-edge clamp).
- [x] `lib/nuscenes/types.ts` — prepped static-JSON schema (the contract the future offline script must
      satisfy). Carries RAW nuScenes-native values (quaternion [w,x,y,z], size [w,l,h], global boxes,
      `ego_pose`, `calibrated_sensor`+intrinsic, `instance` token); no coordinate math (Rule #3).
- [x] `lib/nuscenes/parser.ts` (+10 tests) — `parseNuScenes(raw)→Frame[]`, COCO-parser defensive style.
      id = `instanceToken` shared by 2D+3D (**Rule #1 locked by test**); `confidence=1.0` (annotation,
      **Rule #6** — no fake score); `source='nuscenes-measured'`; `pointCloud:[]`; behind-camera/off-screen
      box → 3D kept, 2D dropped; small `CATEGORY_MAP` (`vehicle.car→car`, `human.pedestrian.*→person`,
      `vehicle.bicycle→bicycle`; unmapped → raw passthrough).
- [x] `lib/types`: `Frame.source?`, `Detection3D.bbox3D.rotation?` added (optional → no breakage).
- [x] Barrels: `lib/nuscenes/index.ts` (new), `lib/geometry/index.ts` (+transforms/projection exports).

**Offline prep + sample data ✅ Done (follow-up session):**
- [x] `scripts/prep_nuscenes.py` — stdlib-only (NO nuscenes-devkit; Python 3.13 + a beginner, so the
      heavy devkit install was avoided). JOINs the nuScenes-mini tables by token and flattens to the
      `NuScenesPrepped` schema; copies RAW values only, **no coordinate math** (Rule #3). CLI:
      `--dataroot` (default `C:\data\sets\nuscenes`), `--scene-index` (0), `--num-keyframes` (10).
- [x] Generated `public/sample-data/nuscenes/nuscenes.json` + `cam_front/` (10 jpgs) from
      **scene-0916** (first 10 keyframes, 583 boxes — daytime parking lot/intersection).
- [x] **Real-data validation** (temp test, since removed): `parseNuScenes` on the real JSON → 10 frames,
      583 3D boxes, **200** project into CAM_FRONT (the rest behind/off-screen → 2D dropped, 3D kept;
      Edge_F#2 Case 1 confirmed on real data). 2D ⊆ 3D, shared ids, rotation present, source measured.
- **Scene choice** was data-driven: surveyed all 10 mini scenes' first-10-keyframe class composition
      and picked **scene-0916** for variety + cleanliness — car 253 / person 217 / bicycle 19 (all three
      palette classes) with near-zero clutter (10 boxes) and daytime lighting. The initial scene-0061 was
      rejected (dense construction: ~100 boxes/frame, ~half `barrier`/`trafficcone`). Swap any time via
      `--scene-index` (the prep script clears `cam_front/` on re-run). Density is still ~58/frame → the
      distance filter (next) earns its keep.

**UI integration ✅ Done (this session):** the remaining Done-when items all landed.
- [x] `lib/selectors/distance-filter.ts` (+`distance-filter.test.ts`, 10 tests) — `detectionDistance`
      = `|bbox3D.center|` (euclidean; the ego→three axis flip is a pure rotation so magnitude = real
      metres from the car) + `selectIdsWithinDistance(detections3D, max)` (inclusive boundary,
      NaN → hides all).
- [x] `lib/selectors/visible-detections.ts` — added `selectVisibleDetectionIds3D` (filters
      `detections3D`, same confidence + permissive-empty class semantics). **Why:** the existing 2D
      visible-id set is built from `detections2D`; on nuScenes a measured box can have NO 2D
      projection (Edge_F#2 Case 1), so a 2D-derived set would silently drop those 3D-only boxes from
      the 3D viewer. COCO is 1:1 → identical there (no regression). `page.tsx` now passes a 2D set
      (Viewer2D + ObjectList) and a 3D set (Viewer3D), each intersected with the distance set.
- [x] store `maxDistance` (+ `setMaxDistance`, non-finite guard mirroring confidence; in
      `resetFilters`/`createInitialState`; default `DISTANCE_MAX=90` from `lib/ui/distance.ts`).
- [x] `BBox3D` applies `bbox3D.rotation` (quaternion `[x,y,z,w]`) on the inner (scaled) group;
      absent → identity `[0,0,0,1]` so COCO/F1 are unchanged. The F1 label stays on the unrotated
      outer group.
- [x] UI: `Header` dataset switcher (segmented `COCO | nuScenes`) + Estimated/Measured badge
      (reads `Frame.source`); `Filters` swaps Confidence↔Distance slider on `filterMode`;
      `DistanceSlider` (new, metres, "All" at max). `enrichFrame` now stamps `source:'coco-estimated'`.
- [x] **nuScenes camera framing + fog** (`lib/geometry/camera-framing.ts` `frameBoxesForCamera`,
      +5 tests): the COCO camera (at −z looking +z) and fog (`[10,28]`) are tuned for the compact
      estimator scene and **face away from / fully occlude** the real nuScenes cloud (boxes tens of
      metres out along three −z). Render-verification caught this — only ~2 boxes showed. Fix:
      nuScenes fits the camera to the box cloud (behind+above, looking forward), widens `far` to 600,
      and disables fog. COCO keeps its tuned camera/fog (branch on `source`). See Edge_F#2 Case 3.
- **Render-verified (Playwright):** dataset toggle + Measured/Estimated badges; ~40 measured 3D
      boxes with correct per-box heading (parked cars in consistent diagonal rows); projected 2D
      boxes land on the actual person/bikes in CAM_FRONT; 2D→3D selection sync; distance filter
      40→19 @ 25 m; COCO path (camera/fog/depth-color/confidence) unchanged.
- [x] **Default dataset = nuScenes** (post-verification tweak): `page.tsx` initial
      `datasetId = 'nuscenes'` so the app lands on the measured-3D headline feature; the Header
      switcher flips to COCO. Verified the first paint shows the Measured badge + 3D boxes.

Locked decisions made this session (via AskUserQuestion): render frame = **ego**; axis rule =
**`(x,y,z)→(-y,z,-x)`** (fwd→−z); 2D box = **AABB of 8 projected corners**; culling = **all-8-in-front
or skip 2D (keep 3D), clamp AABB to image, drop if fully off-screen**.
- Decisions to make during impl: render frame choice (ego vs first-box-centred) for numerical sanity;
  which camera (`CAM_FRONT`); how many keyframes; 2D box = projected-corner AABB vs oriented; class
  subset to mirror COCO (person/bicycle/car) or nuScenes-native classes.
- Edge cases: `Edge_F#2.md` Case 1 ✅ created — a 3D box can have NO 2D box (behind camera /
  off-screen) and that is correct; Rule #1 = "same object ⇒ same id", not "every 3D has a 2D".
  Deferred/to-watch: partial-visibility near-plane clipping, large-magnitude global-coord precision.

### F2-B — Real LiDAR point cloud ✅ Done (prep + lib + render)

- [x] Goal: Replace the empty `pointCloud` with real decimated LiDAR points, correctly aligned to
      the boxes.
- Scope: offline `pcd.bin` decode + **voxel-grid decimation** in `scripts/prep_nuscenes.py`;
  `lib/geometry/transforms.ts` gains `sensorToGlobal`; `lib/nuscenes` carries a `lidar` payload;
  `lib/nuscenes/parser.ts` builds the aligned `pointCloud`; `Point3D.detectionId` becomes optional;
  a pure `selectVisiblePoints` selector; `PointCloud` consumes the real points (F1-A depth color now
  shows real depth).
- Background (beginner): a LiDAR sweep (`.pcd.bin`) is a header-less binary, 5 × `float32` per point
  (`x,y,z,intensity,ring` = 20 bytes); `struct` decodes it with no numpy/devkit. The points are born
  in the **LiDAR sensor frame**, while the boxes live in the **CAM_FRONT ego frame**, so they must be
  brought together: `sensorToGlobal` (LiDAR calib → LiDAR ego_pose) → `globalToEgo` (the frame's
  CAM_FRONT ego_pose) → `egoToThree`. Routing through GLOBAL absorbs the small LiDAR-vs-camera
  capture-time offset (the car moved a few cm between the two sensor triggers).
- Done when:
  - [x] `pcd.bin` is decoded offline (stdlib `struct`, no devkit/numpy) and **voxel-grid decimated**
        (~6.5k pts/frame at voxel 0.6 m), then carried inline in `nuscenes.json` as a flat
        `lidar.points: [x,y,z,…]` array (sensor-frame raw; **no coordinate math in prep**, Rule #3).
  - [x] `lib/geometry/transforms.ts` gains `sensorToGlobal(pSensor, sensorCalib, egoPose)` (+4 tests),
        composed in the parser with the existing `globalToEgo` + `egoToThree` to align points to boxes.
  - [x] The point cloud renders, filling the environment and **aligned to the boxes** — render-verified:
        the concentric LiDAR rings are centred on the ego/sensor origin and the boxes are embedded in
        the surrounding point field (misalignment would separate them). F1-A per-vertex depth color +
        `flat` tone mapping reused unchanged; real `z` now drives the gradient.
  - [x] `Point3D.detectionId` is optional; LiDAR (environment) points carry none and are **always
        shown** regardless of the distance slider / class toggles (the box filters act on boxes). COCO's
        estimated points still filter by their owning box's id — `selectVisiblePoints` (pure, +4 tests)
        encodes both, so PointCloud no longer holds the rule inline.
  - [x] COCO path, F1 visuals, F2-A, and the full suite are unaffected (`pointCloud` was already a
        first-class field; `detectionId` optional is backward-compatible). Suite **166 → 179**.
        COCO estimated cloud / fog / confidence slider render-verified unchanged.
- Decisions (this session, via AskUserQuestion):
  - **Decimation = voxel grid, ~6k pts/frame.** A LiDAR sweep is ~34.7k pts and spatially spread, so a
    coarse-ish 0.6 m voxel is what lands ~6.5k by voxel alone (finer voxels barely thin it → would lean
    on the random `--max-points` cap). Voxel gives even spatial density (cleaner than uniform-random's
    near-clumping). `--voxel-size` / `--max-points` are CLI-tunable; coords rounded to 3 dp (mm).
  - **Transport = inline flat array in `nuscenes.json`.** ~6.5k × 10 frames ≈ 1.4 MB (compact dump, no
    indent — pretty-printing the point arrays alone tripled the file). One fetch, simplest wiring; fine
    for a 10-frame demo. (Separate per-frame files / binary rejected as over-scope.)
  - **Filter = LiDAR points always shown (environment), independent of box filters.** Simplest and
    truthful — the cloud is context, the sliders curate boxes. (Per-point distance filtering rejected
    as extra per-point cost with little demo value.)
  - **Alignment = full sensor→global→cam-ego correction** (vs LiDAR-calib-only). Routing through GLOBAL
    corrects the ego_pose timestamp mismatch; correctness over a marginally simpler path.
  - **Color = reuse F1-A depth color** (decided up front — zero new UI; nuScenes runs fog-off so depth
    color is the only depth cue, and `depthRange` already fits per-frame `z`). Intensity color rejected
    (new ramp + domain-fit UI for no clear gain).
  - **Point size / count kept at F1-A's `0.2` and ~6.5k** — render-verified legible at the nuScenes
    scale; left tunable (`--voxel-size` for density, `size` prop for radius) if a future scene needs it.
- Tests: `transforms.test.ts` +4 (`sensorToGlobal`: identity, translation-only, sensor-mount+ego-yaw,
  global round-trip recovers the sensor→ego point); `lib/nuscenes/parser.test.ts` +5 (lidar →
  pointCloud length, sensor→…→three alignment value, no `detectionId`, absent lidar → `[]`, malformed
  lidar → `[]`+warn); `lib/selectors/visible-detections.test.ts` +4 (`selectVisiblePoints`: owned obey
  set, env always shown, mixed, `undefined` keeps all). UI (PointCloud filter swap) — no test, per
  Testing Policy; render-verified.
- Edge cases: `Edge_F#2.md` Case 4 (alignment must route through GLOBAL, render-verified by the
  sensor-centred rings; sensor-frame voxel decimation is subsampling, not a Rule #3 transform).

### F2-C — Sequence + tracking + autoplay ✅ Done (tracking + autoplay + camera stability)

- [x] Goal: The nuScenes scene sequence (scene-0916, 10 keyframes already in `nuscenes.json`,
      time-ordered ~0.5 s apart) gains cross-frame **tracking**: `selectedObjectId` (= `instance`
      token) survives frame changes, so **autoplay** shows the SAME object actually moving — and the
      camera stops bouncing on every frame.
- Scope: `lib/sequence/` (new — pure `nextFrameIndex` + `AUTOPLAY_INTERVAL_MS`); `app/page.tsx`
  (dataset-aware frame-switch selection policy, autoplay timer, dataset-aware `Viewer3D` key,
  Timeline wiring); `Viewer3D.tsx` (freeze initial camera framing on mount); `Timeline.tsx`
  (play/pause button); `Scene.tsx` (tween extension comment); `tests/integration/frame-switch.test.ts`
  (parametrized COCO-clears / nuScenes-keeps). **COCO path untouched** — every change is dataset-gated.
- Background (beginner):
  - **track id / instance token** — nuScenes gives each physical object a stable `instance` token
    that is the SAME across frames; the parser already uses it as `Detection*.id`. That stability is
    the whole basis of tracking: keep `selectedObjectId` and the same object re-highlights frame to
    frame. COCO ids (`imageId-annId`) are NOT stable across frames, which is exactly why COCO clears
    the selection on a frame switch (Edge_#5 Case 6) — the F2-C split is the principled inverse.
  - **autoplay** — a `setInterval` that steps the selected frame on a timer (here 500 ms = the real
    ~2 Hz keyframe cadence). The *which-frame-next* math is the pure `nextFrameIndex` (loops at the
    end); the React effect only owns the timer (Rule #3 spirit).
  - **camera remount** — `<Viewer3D key={frame.id}>` forced a full Canvas remount per frame so
    OrbitControls reset cleanly (Edge_#4 Case 6). During autoplay that resets the camera every
    0.5 s (a bounce). Giving nuScenes a *stable* key keeps the Canvas mounted, so the camera holds
    and the boxes move within a still view.
- Done when:
  - [x] On nuScenes, selecting an object and switching frames KEEPS it selected/highlighted; if the
        object leaves the camera then returns, it re-highlights (render-verified: a `person`
        instance stayed selected across frame 1→2, the SELECTED panel showed the same id). COCO still
        clears on every switch (render-verified: placeholder after switch). Edge_F#2 Case 5.
  - [x] A play/pause control (Timeline header, nuScenes only) steps the keyframes at ~2 fps and loops
        at the end; pausing stops it (render-verified: Frame 2→6→10 while playing, sky "Pause" label).
  - [x] During frame switches / autoplay the nuScenes camera holds its position+orbit (no remount;
        initial framing frozen so `target` doesn't re-aim) — render-verified: identical viewpoint
        across autoplay frames while the box cloud moved. COCO keeps remount-reset. Edge_F#2 Case 6.
  - [x] Snap, not tween (decision 4-A): every rendered box pose is a real measured keyframe (Rule #6
        honesty; the LiDAR cloud is per-keyframe anyway). Extension seams for box-tween (4-B) and
        camera-follow (3-B) are left clean + commented, not built (no speculative code, per CLAUDE.md).
  - [x] COCO path, F1, F2-A/B and the full suite are unaffected (all changes dataset-gated;
        179 → **190 passing**).
- Decisions (this session, via AskUserQuestion):
  - **1-A — keep the selection when the object disappears** (re-highlights on re-appearance). With a
    stable `instance` id, re-appearance is the SAME object, so re-highlighting is correct — the exact
    inverse of COCO's clear-on-switch (unstable ids). Implemented as `tracksAcrossFrames` gating the
    `setSelectedObject(null)` call; **Rule #2 intact** (still one `selectedObjectId`, only *when* it
    clears differs).
  - **2-A — 0.5 s/frame + loop.** Matches the real nuScenes keyframe cadence (honest real-time
    motion); loops for a continuous demo. `AUTOPLAY_INTERVAL_MS = 500`.
  - **3-A — fixed camera now, follow later.** Remove the per-frame remount on nuScenes + freeze the
    initial framing so `target` is stable. Camera-follow (3-B) deferred; seam = the `target` prop
    (pass the selected box center per frame). Manual frame click during autoplay keeps playing
    (simplest; user can pause).
  - **4-A — snap now, box-tween later.** No interpolation; seam = `BBox3D` is keyed on the stable
    instance id so the component persists across frames and could later lerp/slerp between poses
    (lib/geometry pure fns). Box-only tween would desync from the per-keyframe LiDAR cloud — accepted
    as a later, opt-in polish.
- Tests (pure logic only, per Testing Policy): `lib/sequence/autoplay.test.ts` (8) — `nextFrameIndex`
  advance / loop-wrap / stop-at-end / not-found→0 / single-frame / empty / stale-index, plus the
  cadence constant; `tests/integration/frame-switch.test.ts` (+3) — nuScenes KEEPS selection across a
  switch, keeps it across a multi-frame walk (re-appearance), still no-ops on same-frame re-select
  (COCO-clears cases retained). Autoplay timer / play button / camera (UI) — no tests, render-verified.
- Edge cases: `Edge_F#2.md` Case 5 (dataset-aware selection persistence — the inverse of Edge_#5
  Case 6), Case 6 (camera remount-for-reset vs no-remount-for-stability — resolved by dataset-aware
  key + frozen framing).

### F2-A — completion record (UI integration session)
- Files **added**: `lib/selectors/distance-filter.ts` (+`.test.ts`),
  `lib/geometry/camera-framing.ts` (+`.test.ts`), `lib/ui/distance.ts`,
  `components/filters/DistanceSlider.tsx`.
- Files **changed**: `lib/selectors/visible-detections.ts` (+`selectVisibleDetectionIds3D`),
  `lib/selectors/index.ts` + `lib/geometry/index.ts` (barrels), `lib/geometry/frame-enricher.ts`
  (`source:'coco-estimated'`), `lib/nuscenes/parser.ts` (CATEGORY_MAP +truck/bus/motorcycle) +
  `parser.test.ts`, `lib/ui/class-colors.ts` (+3 colors), `store/viewer-store.ts` (`maxDistance` +
  `setMaxDistance`) + `viewer-store.test.ts`, `components/header/Header.tsx` (+`index.ts`, switcher +
  badge), `components/filters/Filters.tsx` (slider swap), `components/viewer-3d/BBox3D.tsx`
  (rotation), `Viewer3D.tsx` + `Scene.tsx` (per-dataset camera framing + fog), `app/page.tsx`
  (dataset load/switch/reset, distance + 2D/3D visible-id wiring).
- Suite total: **147 → 166 passing** (15 files). New pure-logic tests: distance-filter (10),
  camera-framing (5), store maxDistance (3), parser mapping (2 added). UI = no tests (Testing Policy),
  render-verified via Playwright.
- Edge cases (Edge_F#2.md): Case 2 (visible-id set must be 3D-based or 3D-only boxes vanish),
  Case 3 (COCO-tuned camera + fog hid the nuScenes cloud → per-dataset framing, found by rendering).
- Architecture.md updates: Store Schema (`maxDistance`/`setMaxDistance` + validation row), nuScenes
  Integration status → F2-A done, BBox3D contract (rotation), Viewer3D/Scene contract (per-dataset
  camera framing + fog), selectors (distance filter + 3D visible-id), Header contract (switcher +
  badge), Filters `filterMode`, folder structure (new files), Separation-of-Concerns (camera-framing).
- domain-glossary.md terms added: none new (quaternion / projection / coordinate frames already
  defined in the F2 lib-core session; distance filter + camera framing are UI mechanics, not domain
  terms).

### F2-B — completion record (LiDAR point cloud session)
- Files **changed**: `scripts/prep_nuscenes.py` (LIDAR_TOP join + `.pcd.bin` decode + voxel-grid
  decimate + inline `lidar` payload; compact JSON dump), `lib/geometry/transforms.ts`
  (+`sensorToGlobal`) + `transforms.test.ts` + `lib/geometry/index.ts` (barrel),
  `lib/nuscenes/types.ts` (+`NuScenesLidar` / `NuScenesLidarCalibratedSensor`, `lidar?` on the frame),
  `lib/nuscenes/parser.ts` (build aligned `pointCloud` + `isLidar` guard) + `parser.test.ts`,
  `lib/types/index.ts` (`Point3D.detectionId?` optional), `lib/selectors/visible-detections.ts`
  (+`selectVisiblePoints`) + `visible-detections.test.ts` + `lib/selectors/index.ts` (barrel),
  `components/viewer-3d/PointCloud.tsx` (filter via `selectVisiblePoints`). Regenerated
  `public/sample-data/nuscenes/nuscenes.json` (scene-0916, +~6.5k pts/frame, ~1.4 MB).
- Suite total: **166 → 179 passing** (13 new pure-logic tests: transforms 4, parser 5, selectors 4).
  UI = no tests (Testing Policy), render-verified via Playwright.
- Edge cases (Edge_F#2.md): Case 4 (alignment routes sensor→global→cam-ego; verified by the
  sensor-centred LiDAR rings; voxel decimation in the sensor frame is subsampling, not a Rule #3
  coordinate transform).
- Architecture.md updates: nuScenes Integration status → F2-B done; prepped-JSON schema (`lidar`
  fields); `sensorToGlobal` in the transform pipeline; `Point3D.detectionId?` optional + Core Data
  Types; PointCloud contract (real LiDAR + `selectVisiblePoints`); Data Flow (nuScenes pointCloud);
  selectors (`selectVisiblePoints`); Separation-of-Concerns (`scripts/` decode+decimate).
- domain-glossary.md terms added: `.pcd.bin` (LiDAR sweep binary), Decimation, Voxel Grid Downsampling;
  LiDAR / Point Cloud entries updated (real measured points now exist on nuScenes frames).

### F2-C — completion record (sequence + tracking + autoplay session)
- Files **added**: `lib/sequence/autoplay.ts` (`nextFrameIndex` + `AUTOPLAY_INTERVAL_MS`) +
  `autoplay.test.ts` (8) + `lib/sequence/index.ts` (barrel).
- Files **changed**: `app/page.tsx` (`tracksAcrossFrames` flag; dataset-aware `handleSelectFrame` —
  keep selection on nuScenes / clear on COCO; `isPlaying` state + `setInterval` autoplay effect using
  `nextFrameIndex` + `getState()`; dataset-aware `Viewer3D` key; stop autoplay on dataset switch;
  Timeline `isPlaying`/`onTogglePlay` wiring), `components/viewer-3d/Viewer3D.tsx` (freeze initial
  `frameBoxesForCamera` to the mount frame via `useRef`+`useMemo` so the persistent nuScenes camera's
  `target` doesn't re-aim per frame; camera-follow extension comment), `components/timeline/Timeline.tsx`
  (optional play/pause button), `components/viewer-3d/Scene.tsx` (box-tween extension comment on the
  stable-key map), `tests/integration/frame-switch.test.ts` (parametrized by `tracksAcrossFrames`;
  +3 nuScenes-keep cases).
- Suite total: **179 → 190 passing** (11 new: `nextFrameIndex` 8, frame-switch nuScenes 3). UI
  (autoplay timer / play button / camera stability) — no tests, render-verified via Playwright.
- Edge cases (Edge_F#2.md): Case 5 (dataset-aware selection persistence — inverse of Edge_#5 Case 6),
  Case 6 (camera remount-for-reset vs no-remount-for-stability).
- Architecture.md updates: nuScenes Integration status → F2-C done; Data Flow (autoplay timer +
  tracking); Viewer3D/Scene contract (dataset-aware key + frozen framing, stable-key tracking);
  Timeline contract (play/pause); page wiring (`tracksAcrossFrames`); folder structure (`lib/sequence/`);
  Separation of Concerns (`lib/sequence/`); extension seams (camera-follow, box-tween).
- domain-glossary.md terms added: `autoplay`, `tween / lerp / slerp` (track id / instance token
  already present, cross-linked).

### F2 (overall) — Done (F2-A + F2-B + F2-C)
- **What shipped:** COCO's *estimated* 3D is now joined by nuScenes *measured* 3D via a dataset
  switcher — measured 3D boxes (+ quaternion rotation) + projected 2D + 2D↔3D sync + distance filter
  + Estimated/Measured badge (F2-A); real decimated LiDAR_TOP point cloud aligned to the boxes (F2-B);
  cross-frame tracking (`instance` token survives frame switches) + autoplay + a stable camera (F2-C).
  COCO / Step 11 / F1 all stay live and unchanged.
- Files changed / added: see the F2-A, F2-B, F2-C completion records above (lib core
  `lib/geometry/{transforms,projection,camera-framing}` + `lib/nuscenes/{parser,types}` +
  `lib/selectors/distance-filter` + `lib/sequence/autoplay`; offline `scripts/prep_nuscenes.py`;
  sample data `public/sample-data/nuscenes/`; UI across Header/Filters/Timeline/Viewer3D/Scene/BBox3D
  + `app/page.tsx`).
- Suite total: **114 (pre-F2) → 147 → 166 → 179 → 190 passing.**
- Edge cases (Edge_F#2.md): Case 1 (3D box may have no 2D box), Case 2 (3D-based visible-id set),
  Case 3 (COCO camera/fog hid the cloud), Case 4 (LiDAR routes through GLOBAL), Case 5 (dataset-aware
  selection persistence), Case 6 (camera remount vs stability).
- Architecture.md updates made: "nuScenes Integration" section (F2-A/B/C status + transform pipeline
  + prepped schema), Core Data Types (`Frame.source`, `bbox3D.rotation?`, `Point3D.detectionId?`),
  Data Flow, Store Schema (`maxDistance`), all Viewer-3D contracts, Timeline contract, Header/Filters
  contracts, folder structure (`lib/nuscenes`, `lib/sequence`, `scripts/`), Separation of Concerns.
- domain-glossary.md terms added across F2: quaternion / projection / coordinate frames / `.pcd.bin` /
  decimation / voxel grid / track id / instance token / autoplay / tween-lerp-slerp.
- **Out of scope (not done, intentionally):** multi-camera / 6-up, radar, additional scenes (swap via
  `--scene-index`), COCO tracking (unstable ids), inter-frame tween (seam left for a later F2-D),
  camera-follow (seam left).

<!-- KO (move to a localized file)
## F2 — nuScenes 실측 3D 통합 (계획)
COCO의 "추정 3D"를 nuScenes "실측 3D"로 교체 — 단 COCO를 대체하지 않고 **데이터셋 토글로 공존**
(Step 11 YOLO/confidence/히스토그램 작업 보존). 약점("3D는 추정")을 nuScenes 프레임에서 제거.

[기획에서 확정 — 재논의 금지]
- nuScenes엔 KITTI Level 1 같은 무변환 경로가 **없다**: 어노테이션이 global 좌표라 박스만 그려도
  global→ego 변환 + 축관례가 필요.
- nuScenes 코어엔 **2D 박스가 없다**: 3D 전용. 2D↔3D 동기화를 위해 lib/에서 3D→2D **투영**.
  2D·3D가 같은 instance에서 나오므로 id 동일(Rule #1) 보존.

[잠긴 결정 — AskUserQuestion]
- A. 첫 슬라이스 = F2-A만(박스 2D투영+3D+동기화). 점구름(F2-B)·시퀀스(F2-C) 제외.
- B. 오프라인 prep 스크립트 → 정적 JSON(원시 행렬 포함). 좌표변환은 lib/ TS + Vitest(Rule #3). 런타임 백엔드 X.
- C. 거리(z) 필터 추가, confidence는 COCO용 유지(nuScenes에선 no-op). 가짜 confidence 금지(Rule #6).
- D. rotation = 옵셔널 쿼터니언 [x,y,z,w]. 없으면 회전 없음(기존 COCO/F1/테스트 안 깨짐).
- (기본값) COCO와 공존(토글), Rule #6은 source 플래그('estimated'/'measured' 배지)로 정신 보존.

[Rule 상호작용] #1 보존(instance 기반 공유 id), #3 변환은 lib/, #6 source로 스코핑, #7 무관(별도 파서).

- F2-A: 실측 3D박스(+회전) + 투영 2D박스 + 동기화 + 거리필터 + 배지. 점구름 빈 배열.
  테스트(필수): transforms / projection / distance-filter / nuscenes parser 순수 로직. UI는 테스트 없음.
- F2-B: 실측 LiDAR 점구름(sensor→ego + 오프라인 decimation). F1-A 깊이색이 진짜 깊이를 보임.
- F2-C: 시퀀스 + tracking(instance token → 프레임 간 id) + 자동재생. Step 9.5 tween 제외 재검토 가능.
-->
