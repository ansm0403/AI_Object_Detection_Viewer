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

## F2 — nuScenes Real-3D Integration — core ✅ Done (F2-A ✅, F2-B ✅, F2-C ✅); F2-D ✅ Done (motion/camera polish)

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

### F2-D — Motion & camera polish ✅ Done (after F2-C)

Two viewing-smoothness upgrades layered on F2-C's tracking. Neither adds data nor a new view — they
make the existing autoplay *read* smoother and let the user focus on one tracked object. Both bridge
the same gap (the scene renders at ~60 fps, but keyframes update at only ~2 Hz) via a time-based
interpolation in `useFrame` — that frame-rate-decoupling idea is the one genuinely new concept here.

**Split into two independently-shippable sub-features; recommended order F2-D-1 → F2-D-2** (D-1 is
smaller / lower-risk and carries no honesty caveat; D-2 is the bigger plumbing job and reopens the
Rule #6 question that got it deferred in the first place).

**Locked from the planning chat (do not re-litigate):**
- Both sub-features ship.
- **Camera follow is an OPT-IN mode; the F2-C fixed camera stays the DEFAULT and the fallback.**
  Keeping the fixed mode is *cheaper*, not costlier: follow's hard edges ("nothing selected" / "the
  selected object isn't in this frame") resolve to the already-built, already-verified fixed
  behavior. Coexistence lowers risk vs replacing.
- **Tween is box-only**; the LiDAR cloud stays per-keyframe (snap). Accepted dissonance: the box
  glides while the points jump.

#### F2-D-1 — Camera follow mode (toggle) ✅ Done

- [x] Goal: An opt-in camera mode that keeps the SELECTED object centered as it moves across
      keyframes, while the fixed overview camera remains the default.
- Scope: a camera-mode flag (UI state — store or page; **NOT** a new selection field, so Immutable
  Rule #2 is untouched); a toggle control (Timeline area or 3D corner, nuScenes only); branch the
  `target` source in `Viewer3D`/`Scene` — fixed = frozen framing (current F2-C behavior), follow =
  the selected box's current center each frame; fall back to fixed when there is no selection or the
  selected instance is absent in the frame. Reuses the existing `target` prop seam (Edge_F#2 Case 6) —
  no remount/key change.
- Background (beginner): OrbitControls means the camera ORBITS around a `target` (its look-at pivot).
  Follow moves only that pivot to the selected object — it stays **3rd-person and user-orbitable**
  (NOT first-person / dashcam; the camera position stays user-controlled, only the aim point tracks).
- Done when:
  - [x] A toggle switches Fixed (default) ↔ Follow; in Follow the selected box stays centered as
        autoplay / manual scrubbing advances. (Timeline header `Fixed/Follow` button, nuScenes only;
        render-verified: toggling Follow re-aims the camera onto the selected box, which stays
        centered as frames advance.)
  - [x] No selection (or the selected object isn't in the current frame) → behaves exactly as Fixed
        (the built-in fallback) — no camera jump to empty space, no crash. (`selectFollowTarget`
        returns `null` in both cases → `target` falls back to the frozen framing.)
  - [x] The user can still orbit / zoom in Follow (only the pivot moves); COCO shows no toggle
        (nuScenes only); Rule #2 (single `selectedObjectId`) intact; F2-C fixed mode unchanged.
        (`cameraMode` is a separate page-level VIEW flag, never a selection field; render-verified
        Follow button hidden on COCO.)
- Decisions made during impl (via AskUserQuestion — all recommended options chosen):
  - **Trigger = explicit Fixed/Follow toggle button** (predictable; a plain object click does not
    move the camera). Placed in the Timeline header next to Play (nuScenes only).
  - **`target` update = snap** (re-aim each frame to the selected box center; matches the box snap
    pre-D-2 and keeps D-1 isolated/low-risk — no shared clock pulled in early).
  - **Mode persistence:** the flag persists across frame switches (just page state), resets to Fixed
    on a dataset switch; default on load = Fixed.
  - **State location = page-level** `cameraMode` (mirrors `isPlaying` — both nuScenes-only, ephemeral
    view flags; kept out of the persisted Zustand store).
- Tests: camera / OrbitControls is UI → no unit tests (Testing Policy); render-verified (Playwright).
  The pure helper that emerged — `selectFollowTarget(detections3D, selectedId)` → center | null — is
  unit-tested in `camera-framing.test.ts` (+4: found / null id / absent id / empty), per Rule #3.
- Edge refs: `Edge_F#2.md` Case 7 (follow↔fixed fallback + camera position stays frozen so a
  far-moving object recedes — accepted for the short sequence).

#### F2-D-2 — Inter-frame box tween ✅ Done

- [x] Goal: Between keyframes, smoothly interpolate each tracked box's pose (position + rotation) so
      autoplay motion is continuous instead of snapping every ~0.5 s.
- Scope: pure interpolation in `lib/geometry` (`lerpVec3` + a quaternion `slerp` — thin, tested
  wrappers over Three.js `Vector3.lerp` / `Quaternion.slerp`, kept pure per Rule #3); a per-frame
  clock (`useFrame`) advancing `t ∈ [0,1]` over `AUTOPLAY_INTERVAL_MS`, synced to autoplay; thread
  the SAME instance's NEXT-keyframe pose down to `BBox3D` (Scene already keys `BBox3D` on the stable
  instance id — the persistence seam noted in F2-C). LiDAR cloud stays snap.
- Background (beginner): **lerp** (linear interpolation) blends two positions on a straight line
  (`a + (b−a)·t`); **slerp** (spherical linear interpolation) blends two **quaternions** along the
  shortest arc at constant angular speed — a plain quaternion lerp distorts the rotation. Three.js
  provides both; the work is the plumbing, not the math.
- Done when:
  - [x] During autoplay a tracked box GLIDES between its keyframe poses (position lerp + rotation
        slerp); at each ACTUAL keyframe it sits exactly on the measured pose (t snaps to 0/1).
        (`BBox3D` useFrame: `lerpVec3` on the outer group position + `slerpQuat` on the inner group
        quaternion; the per-box clock resets to 0 on each keyframe switch so t starts on the measured
        pose. Render-verified: boxes advance smoothly under autoplay.)
  - [x] Objects with no match in the next keyframe (appear / disappear) are handled gracefully — no
        jumps, no NaN. (No next pose → the box simply holds its current measured pose; the next-pose
        Map lookup returns `undefined` → tween is skipped for that box.)
  - [x] LiDAR stays per-keyframe (documented dissonance: box smooth, points snap); COCO unaffected;
        only nuScenes autoplay tweens. (`PointCloud` untouched; tween props are nuScenes-only and the
        tween is gated on `playing` — COCO passes neither.)
- Decisions made during impl (via AskUserQuestion — all recommended options chosen):
  - **Honesty (Rule #6) = tween ONLY while playing.** Paused / manual scrubbing shows the EXACT
    measured keyframe (the useFrame gate is `playing && nextCenter`, so `t=0`/no-tween off-play). Every
    statically-viewed pose is therefore a real measurement; the "Measured" badge keeps referring to the
    keyframe data. No "interpolating" affordance added (kept the UI clean; the honesty is structural).
  - **Appear / disappear = hold-last-pose** (no next match → the box stays on its current measured
    pose, then is simply gone at the next keyframe when it leaves `detections3D`).
  - **Scrub / pause mid-tween:** covered by the play-gate — pausing snaps every box to its exact
    current keyframe pose (t effectively 0).
  - **Scope = all boxes** (every visible box with a next-keyframe match glides; ~58 boxes ×
    lerp+slerp/frame is negligible). The whole scene reads smooth, not just the selected one.
- Tests: `lib/geometry/interpolation.ts` `lerpVec3` / `slerpQuat` unit-tested in `interpolation.test.ts`
  (+9: lerp endpoints/midpoint/clamp; slerp endpoints/half-angle shortest-arc/unit-norm/identity). The
  clock + data threading is UI → render-verified (Playwright).
- Edge refs: `Edge_F#2.md` Case 8 (box-smooth / points-snap dissonance + the Rule #6 tween-only-while-
  playing honesty handling).

#### F2-D — to fill on completion
- Files changed / added:
  - F2-D-1: **added** `selectFollowTarget` to `lib/geometry/camera-framing.ts` (+4 tests in
    `camera-framing.test.ts`); **changed** `lib/geometry/index.ts` (barrel), `app/page.tsx`
    (`cameraMode` page state + reset on dataset switch + Timeline/Viewer3D wiring),
    `components/timeline/Timeline.tsx` (Fixed/Follow toggle button, nuScenes only),
    `components/viewer-3d/Viewer3D.tsx` (follow `target` branch via `selectFollowTarget`, fallback to
    frozen framing). No store/type change (Rule #2 intact — `cameraMode` is a view flag, not a
    selection field).
  - F2-D-2: **added** `lib/geometry/interpolation.ts` (`lerpVec3` + `slerpQuat`, pure) +
    `interpolation.test.ts`; **changed** `lib/geometry/index.ts` (barrel), `app/page.tsx` (`nextFrame`
    memo threaded to Viewer3D), `components/viewer-3d/Viewer3D.tsx` (`nextFrame`/`playing` →Scene),
    `components/viewer-3d/Scene.tsx` (next-pose-by-id Map, per-box tween props), `components/viewer-3d/
    BBox3D.tsx` (useFrame position lerp + quaternion slerp + per-box tween clock; outer-group `ref`;
    position/quaternion now driven imperatively, JSX values kept as first-render seeds). No store/type
    change; `PointCloud` untouched (LiDAR stays snap).
- Suite total: **190 → 203 passing** (+13: 4 `selectFollowTarget`, 9 interpolation). `tsc --noEmit` 0
  errors. UI (camera mode, tween clock) render-verified, no tests per Testing Policy.
- Edge cases (Edge_F#2.md): Case 7 (D-1 follow↔fixed fallback; camera position stays frozen so a
  far-moving followed object recedes — accepted for the short sequence), Case 8 (D-2 box-smooth /
  points-snap dissonance + Rule #6 tween-only-while-playing honesty).
- Architecture.md updates made: Viewer3D contract (`cameraMode` + follow `target` branch + `nextFrame`/
  `playing` threading), Scene contract (next-pose Map + per-box tween props), BBox3D contract (useFrame
  pose tween + clock), page.tsx description (`cameraMode`, `nextFrame`), Timeline contract (Follow
  toggle), `lib/geometry/` folder listing (`interpolation.ts` + `selectFollowTarget`), Separation of
  Concerns (`lib/geometry` interpolation), a new "Camera mode + inter-frame tween (F2-D)" subsection.
- domain-glossary.md terms added/updated: `tween / lerp / slerp` (deferred → shipped), new
  **Camera Follow (look-at target tracking)** entry.

<!-- KO (move to a localized file)
## F2-D — 모션·카메라 마감 (계획, F2-C 이후)
F2-C 추적 위에 얹는 "보이는 매끄러움" 2종. 새 데이터/새 화면이 아니라 기존 자동재생을 더 부드럽게 보이게.
둘 다 같은 간극(씬은 ~60fps로 그려지지만 키프레임은 ~2Hz)을 `useFrame` 시간보간으로 메움.
독립 출시 가능한 2개 서브로 분리, 권장 순서 D-1 → D-2(D-1이 더 작고 안전·정직성 이슈 없음).

[기획 확정 — 재논의 금지]
- 둘 다 구현. 카메라 추적은 **옵트인 모드**, F2-C 고정 카메라가 **기본값이자 폴백**(고정 모드를 남기는 게
  더 싸다 — 추적의 까다로운 엣지 "선택 없음/객체 사라짐"이 이미 만든 고정 동작으로 폴백). 교체보다 저위험.
- tween은 박스만. 점구름은 키프레임 스냅 유지(박스는 미끄럽고 점은 튀는 부조화 수용).

- F2-D-1 카메라 추적(토글): OrbitControls의 target(바라보는 중심점)만 선택 박스로 옮김 → 3인칭·orbit 유지
  (1인칭 아님). 선택 없으면 고정으로 폴백. Rule #2(단일 selectedObjectId) 유지. 열린 결정: 트리거(토글
  버튼[권장] vs 자동), target 스냅 vs 시간 lerp, 모드 지속/기본값. UI라 렌더 검증, 순수 헬퍼 생기면 테스트.
- F2-D-2 박스 tween: lerp(위치)+slerp(회전)를 lib/geometry 순수 함수로(Rule #3) + `useFrame` clock(t 0→1,
  AUTOPLAY_INTERVAL_MS 동기). BBox3D는 instance id keying으로 이미 유지됨(이음새). LiDAR는 스냅. 열린 결정:
  정직성(Rule #6 — 보간 사이값은 측정 아님; 재생 중에만 tween 등) **출시 전 명시 결정**, 등장/소멸 처리,
  스크럽/일시정지 시 t clamp, 전체 vs 선택만. lerp/slerp 유닛 테스트 + 렌더 검증.
-->

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
- **Out of scope of the A/B/C core (intentionally):** multi-camera / 6-up, radar, additional scenes
  (swap via `--scene-index`), COCO tracking (unstable ids). Inter-frame tween + camera-follow were
  deferred here as clean seams and are now **planned as F2-D** (D-2 tween, D-1 camera-follow) — see
  the F2-D section above.

## F2-E — Hide the nuScenes confidence placeholder (Rule #6) ✅ Done (2026-10-25)
- **Goal:** stop presenting measured (human-labelled) nuScenes annotations as "100 %-confident AI
  detections". `lib/nuscenes/parser.ts` fills `confidence: 1.0` only because the `Detection` type
  requires a number; five UI surfaces rendered that placeholder as a real score — 2D bbox label
  `person 1.00`, 3D label pill `person 100%`, ObjectList gauge + `1.00`, SelectedObjectInfo `1.000`,
  and the histogram collapsing to one bar in the top bucket. Surfaced by the résumé/portfolio
  consistency review (the app lands on nuScenes, so it was the first number a reviewer saw).
- **Scope:** new pure selector `lib/selectors/frame-has-confidence.ts` — `frameHasConfidence(frame)`
  = `frame.source !== 'nuscenes-measured'` (absent `source` → true, legacy COCO) + 3 tests, exported
  from the barrel. UI: `Viewer2D` (label = class only), `BBoxLabel` (`confidence?` optional → percent
  omitted), `BBox3D` (`showConfidence` prop, default `true`), `Scene` (passes
  `frameHasConfidence(frame)`), `ObjectList` (gauge + number → "—"), `SelectedObjectInfo` (Confidence
  row → "—"), `AnalyticsPanel` (histogram → local `NoConfidenceNote`, same section slot so no reflow).
  Parser, sample data, store, and the whole COCO path untouched.
- **Done when:** nuScenes shows no confidence number on any surface; COCO unchanged. ✅
- **Tests:** 203 → **206 passing** (+3 `frameHasConfidence`). `tsc --noEmit` 0 errors. UI
  render-verified with Playwright, not unit-tested (Testing Policy): nuScenes → 2D labels `person`,
  3D pill `person`, list `—`, panel `—`, note shown; COCO → `car 0.35`, `person 85%`, `0.85`,
  `0.849`, histogram drawn.
- **Decisions:** (1) keyed on `Frame.source` (provenance — the same flag as the Estimated/Measured
  badge), not on the dataset id, so any future measured dataset inherits the rule. (2) The data stays
  `1.0` and the parser test "measures (not fakes) confidence as 1.0" still holds — this is a display
  rule, the same shape as `Filters` swapping the confidence slider for the distance slider. (3) "—"
  rather than removing rows, for consistency with the 2D/3D bbox "—" rows (Edge_F#2 Case 1).
- **Edge refs:** Edge_F#2 Case 9.

<!-- KO (move to a localized file)
## F2-E — nuScenes confidence 자리 채움 값 숨김 (Rule #6) ✅ 완료 (2026-10-25)
- 목표: 사람이 라벨링한 nuScenes 어노테이션을 "100% 확신하는 AI 탐지"처럼 보이지 않게. 파서는 타입이
  숫자를 요구해서 `confidence: 1.0`을 채울 뿐인데, 2D 라벨 `person 1.00`·3D 라벨 `person 100%`·객체 리스트
  게이지+`1.00`·선택 패널 `1.000`·히스토그램(마지막 구간 막대 하나) 다섯 곳이 이를 실제 점수처럼 그렸다.
  이력서·포트폴리오 정합성 검토에서 발견(앱이 nuScenes로 진입하므로 검토자가 가장 먼저 보는 숫자).
- 범위: 순수 셀렉터 `frameHasConfidence(frame)` (= `source !== 'nuscenes-measured'`, source 없으면 true)
  + 테스트 3개. UI 5곳은 "—" / 클래스만 / 안내문("Measured annotations · no confidence scores")으로 대체.
  파서·데이터·스토어·COCO 경로는 그대로.
- 테스트 203 → 206. Playwright 렌더 검증 완료.
- 결정: 데이터셋 id가 아니라 출처 플래그(`Frame.source`) 기준. 데이터는 1.0 유지(표시 규칙일 뿐). 행 삭제
  대신 "—"로 통일(2D/3D bbox "—" 행과 동일).
- Edge refs: Edge_F#2 Case 9.
-->

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

---

## F3 — No-scroll Workspace Layout ✅ Done (2026-11-25; F3-A + F3-B + F3-C + F3-D)
- **Design doc:** `docs/plan-feature/F3_workspace_layout.md` (provisionally approved: build the
  recommended options for all 9 decisions, adjust after seeing them). Captures + mockup:
  `docs/plan-feature/assets/F3/` (before / mockup / after, timestamped KST).
- **Goal:** work on one screen without page scrolling — object list, 3D view, camera image, details
  and timeline visible together — and fix the 7 defects found in the 2026-11-25 render (design doc §2).
- **Scope:**
  - **Mockup first (decision 9).** Static HTML at real colours and sizes (Tailwind 3.4.3, same as the
    app), 1440×900 and 1280×720, beside captures of the current app. The 3D pane was the real 3D view
    re-rendered at the mockup's cell size; the camera pane was the app's own 2D SVG. The user approved
    the direction and 4 extra proposals (below).
  - **F3-A — frame.** New `components/workspace/WorkspaceShell.tsx` (zones only, no state); `page.tsx`
    renders loading / error / empty / loaded inside it; `Viewer2D` / `Viewer3D` fill their cell
    (`aspect-[4/3]` removed); camera cell ratio per dataset (`cameraAspect`: nuScenes 16:9, COCO 4:3);
    `ObjectList` / `AnalyticsPanel` fill their cell; Header and Filters became flush bars; Timeline
    became one 84px row (Play / Reset / Follow on the left).
  - **F3-B — one counting basis (decision 4).** `selectClassCounts` counts `detections3D`;
    `ObjectList` lists every 3D box (visible set = 3D set) with an in-camera icon and the distance from
    the ego vehicle on measured frames; Timeline badges count 3D boxes.
  - **F3-C — small fixes.** `lib/ui/display-id.ts` (6-char display id, decision 7); histogram tick
    labels moved out of the stretched SVG (fixed 10px); HintBox text in English (decision 8).
  - **F3-D — one panel look.** New `components/workspace/Panel.tsx` (`PANEL_CLASS`,
    `SECTION_TITLE_CLASS`, `PanelTitle`, `PanelHeader`, `ViewerLabel`) used by every pane; real border
    instead of `ring-inset`; 32px title rows on data panels, corner tags on viewers (text from
    `Frame.source`, Rule #6); 32px list rows; class-name column widened in `ClassCountBar`.
- **Done when (design doc §8) — all met, render-verified with Playwright:**
  - No page scroll at 1440×900 and 1280×720 (also 1536×700 / 1536×730 / 1280×700) for nuScenes and
    COCO, with a selection and during autoplay. 390×844 stacks and scrolls.
  - Selecting in the list never moves the page (list `scrollTop` 606, page `scrollY` 0).
  - 7 zones visible; 3D is the largest (736×708 at 1440×900).
  - Loading skeleton and loaded page: all five pane rectangles identical.
  - 2D ↔ 3D ↔ list sync; deselect on 3D empty space, 2D background, COCO pillar-box band; nuScenes
    camera holds across frame switch + autoplay; COCO camera resets on frame switch; the 3D canvas
    follows window resizes and is the same element after 5 resizes (not remounted).
  - Header = list = class-count sum = timeline badge (frame 1: 40, frame 7: 66).
  - Tests **206 → 213** (`selectClassCounts` +2, `displayId` +5). `tsc --noEmit` 0 errors.
- **Changes from the plan, and why:**
  1. **Flush top bars and the one-row timeline moved from F3-D into F3-A.** Their heights decide the
     grid rows; fixing them in A was needed for the loading skeleton and the loaded page to share the
     same pane positions.
  2. **List shows distance (m) instead of "—" on measured frames.** Not in the design doc; proposed in
     the mockup and approved by the user. Uses `detectionDistance`, the distance filter's own function,
     so the two can never disagree. Added in F3-B (the step that rewrote the list).
  3. **Viewers got corner tags instead of title rows; top bars are flush bars, not cards; the timeline
     is one row (84px instead of the ~112px estimate).** Mockup proposals, approved by the user.
  4. **F3-B gave the list's id cell a temporary truncate** so class names stayed visible until F3-C
     shortened the ids (the full 32-char id had pushed the class name out of the 272px column in A).
  5. **Bug found and fixed in F3-A:** the COCO camera cell grew to 400×600 on a portrait photo
     (`aspect-ratio` box sized by its content). Fixed with `min-h-0 overflow-hidden` (Edge_F#3 Case 1).
  6. **3D empty space above the scene at 1440×900 — left as is (user decision).** The design doc's
     risk §11 allowed adjusting the camera init. The user's laptop viewport (~1536×700) gives a wide,
     short 3D cell where the gap does not appear (Edge_F#3 Case 3).
  7. **Next.js dev indicator over the Play button — left as is (user decision; dev server only)**
     (Edge_F#3 Case 2).
- **Decisions kept from the design doc:** camera image top-right (cost: 510×287 → 400×225 at
  1440×900 and 360×203 at 1280×720 — half the area at 1280); filters in a bar under the header;
  narrow screens stack (< 1024px); no resizable panels; no Server Component data loading (decision
  6 — still unmeasured; measure load time first, as a separate item); English UI.
- **Not done / open:**
  - **COCO mode — keep or retire: on hold.** F3 left it functionally unchanged inside the new layout
    (estimated 3D, confidence slider, 4:3 camera cell). Asked after F3; the user kept it on hold
    (2026-11-25).
  - Camera image size for review work is judged in F4 (decision 5).
  - GPU memory during resize was not measured (canvas identity was).
- **Edge refs:** Edge_F#3 Cases 1–3.

<!-- KO (move to a localized file)
## F3 — 스크롤 없는 작업 화면 ✅ 완료 (2026-11-25; F3-A + B + C + D)
- 설계 문서: `docs/plan-feature/F3_workspace_layout.md`(임시 승인: 결정 9개 모두 추천안으로 만들고 보면서 조정).
  시안과 캡처: `docs/plan-feature/assets/F3/`(전 / 시안 / 후, 한국 시간 표시).
- 목표: 페이지 스크롤 없이 목록, 3D 뷰, 카메라 이미지, 정보 패널, 타임라인을 한 화면에서 보며 작업. 2026-11-25
  캡처에서 찾은 문제 7가지 해결.
- 범위:
  - 시안 먼저(결정 9): 실제 색·크기의 정적 HTML, 1440×900·1280×720, 지금 화면 캡처와 비교. 3D 칸은 실제 3D 화면을
    시안 칸 크기로 다시 그린 캡처, 카메라 칸은 앱의 2D SVG 그대로. 사용자가 방향과 추가 제안 4개를 승인.
  - F3-A 화면 틀: `WorkspaceShell`(자리만 정의, 상태 없음). 로딩·오류·빈 데이터도 틀 안에. 두 뷰어는 칸을 채움.
    카메라 칸 비율은 데이터셋별(nuScenes 16:9, COCO 4:3). 상단 바·필터 바는 붙은 막대, 타임라인은 84px 한 줄.
  - F3-B 개수 기준 통일(결정 4): 클래스 집계·목록·타임라인 배지 모두 3D 박스 기준. 목록에 카메라 아이콘과 거리.
  - F3-C: ID 6자리(`lib/ui/display-id.ts`), 차트 축 글자 10px 고정, 3D 조작 안내 영어.
  - F3-D: `Panel.tsx`로 패널 모양 한 규칙(배경, 1px 테두리, 모서리, 32px 제목 줄, 뷰어 이름표).
- 완료 기준(설계 문서 8장): 모두 충족, Playwright 캡처로 확인. 1440×900·1280×720(그리고 1536×700 등)에서 스크롤
  없음, 목록 선택 시 페이지 고정, 로딩 전후 칸 위치 같음, 선택 동기화·해제, 카메라 유지(nuScenes)·초기화(COCO),
  창 크기 변경 5번에도 같은 3D 캔버스, 개수 일치(프레임 1: 40, 프레임 7: 66). 테스트 206 → 213, tsc 오류 0.
- 계획과 달라진 점과 이유:
  1. 붙은 상단 바와 한 줄 타임라인을 F3-D에서 F3-A로 당김. 이 높이들이 칸 높이를 정해서, 로딩 전후 위치를 맞추려면
     A에서 확정해야 했다.
  2. 목록 숫자 칸을 "—" 대신 거리(m)로. 설계 문서에 없던 시안 제안, 사용자 승인. 거리 필터와 같은 함수 사용.
  3. 뷰어는 제목 줄 대신 모서리 이름표, 상단은 카드 대신 붙은 막대, 타임라인 한 줄(예상 112px → 84px). 시안 제안, 승인.
  4. F3-B에서 ID 칸에 임시 말줄임. A에서 32자 ID가 클래스 이름을 밀어낸 문제를 C 전까지 막기 위해.
  5. F3-A에서 버그 발견·수정: 세로 COCO 사진에서 카메라 칸이 400×600으로 커짐. `min-h-0 overflow-hidden`(Edge_F#3 Case 1).
  6. 1440×900에서 3D 위쪽 빈 공간은 그대로 둠(사용자 결정). 사용자 노트북 창(~1536×700)에서는 생기지 않음(Case 3).
  7. Next.js 개발 표시 "N"이 Play 버튼을 가림. 개발 서버에서만 보여 그대로 둠(사용자 결정, Case 2).
- 설계대로 유지: 카메라 오른쪽 위(대가: 510×287 → 400×225, 1280에서는 360×203으로 넓이 절반), 필터는 헤더 아래,
  1024px 미만은 세로 쌓기, 패널 크기 조절 없음, 서버 컴포넌트 전환 안 함(결정 6, 로딩 시간을 먼저 재야 함), 영어 UI.
- 남은 것: **COCO 모드를 남길지는 보류**(F3에서 기능 변화 없이 새 화면 안에 둠. F3 종료 후 다시 물었고 보류 유지). 카메라 이미지가 검수에
  충분한지는 F4에서 판단. 창 크기 변경 시 GPU 메모리는 재지 않음(캔버스가 같은 요소인지만 확인).
- Edge refs: Edge_F#3 Case 1~3.
-->

---

## F4 — 3D Box Review ✅ Done (2026-11-25; F4-A … F4-F)
- **Design doc:** `docs/plan-feature/F4_box_review.md` (provisionally approved: decision 1 chosen by
  the user, decisions 2–16 built as recommended and adjusted from captures). Mockup + per-step
  captures: `docs/plan-feature/assets/F4/` (`compare.html`, `steps.html`).
- **Goal:** turn the read-only nuScenes view into a review tool — approve / reject / mark unsure each
  measured 3D box, record why, resume later, export the result.
- **Scope (as built):**
  - **F4-A — data + logic (no visual change).** `scripts/prep_nuscenes.py` copies three more raw
    values per box (`annotationToken`, `numLidarPts`, `visibility`; prepped format 1.0 → 1.1) and
    `nuscenes.json` was regenerated (verified identical apart from the new fields, LiDAR arrays and
    images included). Parser carries them as optional `Detection3D.annotation`. New `lib/review/`
    (records, progress, queue, export, stored-data validation) and `store/review-store.ts`
    (persisted).
  - **F4-B — verdict UI.** `ReviewControls` pinned above the details scroll area (the panel is titled
    "Review" on nuScenes), reject reasons + note, verdict icon + LiDAR evidence bars per list row,
    overall progress in the top bar, "reviewed/total" timeline badges; verdicts survive a reload.
  - **F4-C — queue + shortcuts.** List order (scene / fewest LiDAR points / in camera first), J K,
    A R U, C, 1–6, N; auto-advance after Approve / Unsure; filtered-out boxes skipped.
  - **F4-D — camera zoom + evidence.** Full / Zoom (Z): the camera cell crops to the selected box and
    draws the projected 3D box (12 edges, front face marked); notice for boxes outside the camera;
    evidence strip (LiDAR points, visibility, in camera) above the buttons.
  - **F4-E — export + reset.** JSON / CSV download built by pure functions; two-click reset;
    "Not saved" when browser storage fails.
  - **F4-F — practice mode.** Seeded, deliberate box errors on a copy of the raw data + scoring
    (found / missed / false alarms); own review scope; labelled "Practice · labels modified".
  - **Edge-case review** after F4-F (the user's request): five more fixes, see below.
- **Done when (design doc §8) — all met, verified by driving the real app with Playwright**
  (mouse flow 40 checks, keyboard 37, zoom / evidence 35, export / storage 31, practice 31, edge
  re-check 17, outdated-script regression 11):
  - Verdicts update list, top bar and timeline at once; the same object is reviewed per frame.
  - Reasons (several per box) and note; everything is restored after a reload; reset clears only the
    current scope; storage full / blocked → app keeps working and says "Not saved".
  - A whole frame can be reviewed with the keyboard alone; typing in the note never triggers a
    shortcut; no verdict during playback; filtered-out boxes are skipped.
  - Zoom shows the projected 3D box; a box outside the camera shows the notice; weak evidence
    (≤ 4 points) is marked in the list and the strip.
  - Exported summary equals the on-screen progress.
  - Practice: never "Measured" on screen; same seed → same errors; practice verdicts never mix with
    the real ones; score matches the verdicts.
  - Unchanged: no page scroll at 1536×700 / 1440×900 / 1280×720 (and 1024 / 1100 after the edge
    fix) including the rejected state; 2D ↔ 3D ↔ list sync on one `selectedObjectId`; deselect on
    empty space; nuScenes camera persistence (canvas never remounted by review actions); COCO renders
    as after F3.
  - Tests **213 → 386** (`lib/review` 132, `review-store` 19, parser +5 +1, projection +8,
    camera-zoom 8). `tsc --noEmit` 0 errors. Production build passes.
- **Changes from the plan, and why:**
  1. **A third verdict, "unsure", and the practice mode** were not in the HANDOFF outline; both were
     settled in the design doc (practice: the user's choice for "almost nothing to review"; unsure:
     about two thirds of the boxes are outside the single camera, so without it the reviewer must
     guess or can never finish a frame).
  2. **`visibility` is exported as nuScenes' own level names** (`v0-40` …), not 1–4 — the script's
     rule is "copy raw values".
  3. **A safe-storage wrapper around `persist`.** Reading zustand's source showed a failed `setItem`
     escapes from `set()` and that a blocked `localStorage` leaves the store without its `persist`
     API (Edge_F#4 Case 2). The design doc had this as "to verify".
  4. **The note is kept for "unsure" too** (a place to say why it could not be judged); approving
     clears reasons and note.
  5. **Evidence moved from rows inside "Selected" to a strip above the buttons.** At 1536×700 a
     rejected box left one line of "Selected" visible; the facts needed for the decision now never
     scroll away. Consequently the **Confidence row was NOT removed** — F2-E's display is untouched.
  6. **The projected 3D box is drawn only when zoomed.** In the full view the box is ~14×24 px and
     the lines merge; the full view stays exactly as before.
  7. **Zoom is on by default** (not specified in the design).
  8. **Buttons drop focus after a mouse click; an open Export menu blocks shortcuts; CSV gets a BOM
     at download** — found while building (a verdict moves the selection, so Space would re-fire it
     on the next box; Excel garbles UTF-8 without a BOM).
  9. **Practice errors are placed by camera visibility** (≥ half in camera, class errors only in
     camera, heading errors only on long boxes). The first version put 2 of 13 errors in the camera —
     most were undiscoverable in the thinned 3D view. Costs one extra parse when entering practice
     (~0.55 s to switch, measured).
  10. **N follows the filters** (design: "next frame with unreviewed boxes"). Without it N bounced
      between frames whose remaining boxes were hidden, and the panel claimed "Every box is reviewed"
      (Edge_F#4 Case 6).
  11. **Not in the design, from the edge-case review:** cross-tab sync through the `storage` event
      (Case 4), shortcuts under a Korean input method via `event.code` (Case 5), "Not saved" clears
      after a successful save (Case 7), top-bar width budget below 1280px (Case 3).
  12. **A pre-existing list-scroll bug was fixed** because J / K depend on it (Case 1).
  13. **An optimisation was tried and reverted.** Memoising `Viewer3D` looked justified on the dev
      server (~110 ms per keystroke in the note); the production-build CPU profile showed ~2 ms of
      application JS per keystroke. No measurement, no change (HANDOFF 3.7).
- **Decisions kept from the design doc:** review key = (frame id, object id), box token only in the
  export; reasons multi-select and optional; separate persisted store with `skipHydration`; queue =
  filtered boxes, progress denominator = all boxes; Reject stays / Approve advances / frame never
  changes by itself; all boxes reviewable (not only in-camera); export = reviewed boxes + summary;
  COCO has no review UI; the 3D view is unchanged (no verdict colours, no auto-focus).
- **Not done / open:**
  - **three.js idle cost on nuScenes — found, not caused by F4, deferred.** Production CPU profile:
    ~0.4–0.55 s of JS per second in shader-program bookkeeping at idle (COCO ~0.05 s). A separate
    measured item (roadmap: tech upgrades are trigger-based); should be done before F7 grows the
    scene.
  - **Loader reports a JSON parse error on an HTTP failure** (no `response.ok` check) — pre-F4, a
    one-line `fix:`; left out of this feature by the user's decision to wrap up first.
  - At 1536×700 the practice score and "Selected" need scrolling inside the panel while a box is
    rejected. Accepted.
  - 3D inspection is manual (Follow + wheel). Revisit if review proves awkward (design decision 15).
  - Measurements were taken in headless software GL; frame rate on the user's laptop not measured.
  - COCO mode: still on hold (unchanged by F4).
- **Edge refs:** Edge_F#4 Cases 1–7 + "measured and not changed" + "found, deferred".

<!-- KO (move to a localized file)
## F4 — 3D 박스 검수 ✅ 완료 (2026-11-25; F4-A ~ F4-F)
- 설계 문서: `docs/plan-feature/F4_box_review.md`(임시 승인: 결정 1은 사용자가 선택, 결정 2~16은 추천안으로 만들고
  캡처를 보며 조정). 시안과 단계별 캡처: `docs/plan-feature/assets/F4/`(`compare.html`, `steps.html`).
- 목표: 읽기 전용이던 nuScenes 화면을 검수 도구로. 실측 3D 박스를 승인 / 반려 / 판단 불가로 판정하고, 사유를 남기고,
  이어서 하고, 결과를 내보낸다.
- 범위(만든 것):
  - F4-A 데이터와 로직(화면 변화 없음): 준비 스크립트가 박스마다 값 3개(박스 고유 ID, LiDAR 점 개수, 가려짐 단계)를
    더 복사(포맷 1.1). `nuscenes.json` 재생성(새 값 외에는 이전과 같음을 확인). `lib/review/`와 저장되는 `review-store`.
  - F4-B 판정 화면: 정보 패널 맨 위에 고정된 버튼, 사유와 메모, 목록 행의 상태 아이콘과 LiDAR 막대, 상단 진행률,
    타임라인 배지. 새로고침 후에도 유지.
  - F4-C 대기열과 단축키: 정렬 3가지, J K, A R U, C, 1~6, N. 승인·판단 불가 뒤 자동 이동. 필터로 가려진 박스는 건너뜀.
  - F4-D 카메라 확대와 근거: Full / Zoom(Z), 투영한 3D 박스(모서리 12개, 앞면 표시), 카메라 밖 안내, 버튼 위 근거 한 줄.
  - F4-E 내보내기와 초기화: JSON / CSV, 두 번 눌러 초기화, 저장 실패 시 "Not saved".
  - F4-F 연습 모드: 시드로 정해진 변형 + 채점. 기록은 별도 범위, 화면에는 "Practice · labels modified".
  - F4-F 뒤 엣지 케이스 검증(사용자 요청): 수정 5건 추가.
- 완료 기준(설계 문서 8장): 모두 충족. 실제 앱을 Playwright로 조작해 확인(마우스 40, 키보드 37, 확대·근거 35,
  내보내기·저장 31, 연습 31, 엣지 재확인 17, 회귀 11항목). 테스트 213 → 386개, tsc 오류 0개, 배포용 빌드 성공.
- 계획과 달라진 점과 이유:
  1. "판단 불가" 판정과 연습 모드는 HANDOFF 개요에 없던 것. 설계 단계에서 정함(연습 모드는 사용자 선택, 판단 불가는
     박스의 약 3분의 2가 카메라 밖이라 필요).
  2. 가려짐 단계는 1~4가 아니라 nuScenes의 이름 그대로 내보냄(스크립트 원칙: 원본 값 복사).
  3. `persist`를 감싸는 안전한 저장소 래퍼 추가. 저장 실패가 판정 동작을 죽일 수 있었음(Edge_F#4 Case 2).
  4. 메모는 판단 불가에서도 유지. 승인하면 사유와 메모가 지워짐.
  5. 근거 표시를 "Selected" 안이 아니라 버튼 위 한 줄로 옮김. 1536×700 반려 상태에서 가려지던 문제 때문.
     그래서 Confidence 줄은 빼지 않음(F2-E 표시 유지).
  6. 투영한 3D 박스는 확대했을 때만 그림. 전체 보기에서는 14×24px라 선이 뭉침.
  7. 확대가 기본값(설계에 정하지 않았던 것).
  8. 마우스로 누른 버튼은 포커스를 뺌, Export 메뉴가 열려 있으면 단축키 차단, CSV에 BOM 추가.
  9. 연습 모드의 오류를 카메라에 보이는지에 따라 배치(절반 이상은 카메라에 보이는 박스, 클래스 오류는 카메라에
     보이는 박스에만, 방향 오류는 긴 박스에만). 처음 구현은 13개 중 2개만 카메라에 보여 찾기 어려웠음.
  10. N이 필터를 따르게 함. 그렇지 않으면 프레임 사이를 오가고 "Every box is reviewed"라고 잘못 말함(Case 6).
  11. 엣지 검증에서 추가: 탭 간 동기화(Case 4), 한글 입력 상태의 단축키(Case 5), 저장 성공 시 "Not saved" 해제(Case 7),
      1280px 미만의 상단 바 폭(Case 3).
  12. 기존 목록 스크롤 버그를 고침. J / K가 여기에 의존(Case 1).
  13. 최적화 하나를 넣었다가 되돌림. 개발 서버에서는 글자당 110ms였지만 배포용 빌드에서는 약 2ms.
- 설계대로 유지: 키는 (프레임 ID, 객체 ID), 사유는 여러 개·선택 사항, 별도 저장 store, 대기열은 필터 통과 박스·진행률
  분모는 전체, 반려는 머묾·승인은 이동·프레임은 자동으로 안 넘어감, 모든 박스가 검수 대상, 내보내기는 검수한 박스 + 요약,
  COCO에는 검수 UI 없음, 3D 뷰는 그대로.
- 남은 것:
  - nuScenes에서 three.js가 가만히 있어도 쓰는 비용(F4가 만든 것이 아님, 보류). 배포용 빌드 기준 1초에 0.4~0.55초의
    JS 시간(COCO는 약 0.05초). 별도의 측정 항목으로, F7 전에 다룰 것.
  - 데이터 요청 실패 시 오류 문구가 JSON 해석 오류로 나옴(F4 이전부터, 한 줄짜리 `fix:`). 사용자 결정으로 이번에는 넣지 않음.
  - 1536×700에서 반려 상태일 때 연습 채점 칸과 "Selected"는 패널 안에서 스크롤해야 보임(수용).
  - 3D에서 자세히 보려면 직접 확대해야 함(결정 15). 써 보고 불편하면 다시 본다.
  - 측정은 GPU 없는 환경에서 했음. 사용자 노트북에서의 프레임 수는 재지 않음.
  - COCO 모드: 계속 보류.
- Edge refs: Edge_F#4 Case 1~7, "측정하고 바꾸지 않은 것", "발견했으나 보류".
-->

---

## F5 — Camera Detection Evaluation ✅ Done (2026-11-26; F5-0, F5-A … F5-D)
- **Design doc:** `docs/plan-feature/F5_camera_detection_eval.md` (provisionally approved: decision 1
  — a Review | Evaluate mode — chosen by the user from mockups, decisions 2–13 built as recommended
  and adjusted from captures). Mockups + per-step captures: `docs/plan-feature/assets/F5/`
  (`compare.html`, `steps.html`).
- **Goal:** score a 2D camera detector (YOLOv8n, run offline) against the nuScenes labels on the
  camera image, and show **where in 3D** the missed objects are and how recall changes with distance.
  The second pillar of the roadmap ("does the model get it right"), next to F4 ("is the label right").
- **Scope (as built):**
  - **F5-0 — loader fix (separate `fix:`).** `lib/data/fetch-json.ts`: an HTTP failure is reported as
    its status, not as a JSON parse error (the item deferred in F4).
  - **F5-A — data + logic (no visual change).** `scripts/predict_nuscenes.py` →
    `predictions.json` (428 predictions on the 10 CAM_FRONT photos, score ≥ 0.05, 32 KB; the model's
    raw output, nothing filtered). `lib/evaluation/`: types, parser, IoU, class map, matching,
    metrics — all pure.
  - **F5-B — mode + summary.** `Review | Evaluate` in the top bar; predictions loaded next to the
    dataset; `EvaluationPanel` (Precision / Recall with counts, this frame's outcomes, recall by
    distance and by class, notes); "Min score" slider; "N missed" timeline badges.
  - **F5-C — photo + list.** Camera cell draws labels dashed and model boxes solid in outcome
    colours (generic `overlay` input of `Viewer2D`); `ResultList`; false alarms selectable through
    the one `selectedObjectId`; pinned one-line explanation of the selected result; J / K / Z.
  - **F5-D — 3D + finish.** 3D boxes take their outcome colour (`boxColors`) with a legend; states
    of a missing / partial / malformed / late predictions file.
  - **Edge-case review** after F5-D: four more fixes, see below.
- **Done when (design doc §8) — all met, verified by driving the real app with Playwright** (F5-0 10
  checks, F5-B 59, F5-C 47, F5-D 33, edge review 26, regression of pre-F5 behaviour 30, plus a
  3D-click probe):
  - Evaluate mode shows Precision 88% / Recall 52%; 0.40 → 100% / 41%; the slider updates the top
    bar, panel, list, photo, 3D colours and timeline badges together.
  - Selecting a miss highlights its 3D box and zooms the photo on its label; clicking in the photo or
    the 3D view selects the same row (3D: 31 different boxes clicked — the 10 evaluated ones
    highlighted their row with the same outcome, the 21 outside the camera read "Not evaluated").
  - A false alarm highlights in the photo, nothing in 3D, and the panel gives the reason.
  - Labels never show a score (F2-E intact); only model boxes do. The "approx." legend is always on.
  - A label selection survives a mode or frame switch; a false-alarm selection is dropped.
  - Predictions request fails → review unaffected, evaluate mode says why. HTTP 500 on the dataset →
    the status is shown.
  - Evaluate is blocked in practice mode; COCO has no mode switch.
  - No page scroll and a one-line top bar at 1024 / 1100 / 1279 / 1280 in review, practice and
    evaluate, and at 1440×900, 1536×700, 1920×1080 in evaluate.
  - Unchanged: 2D ↔ 3D ↔ list sync on one `selectedObjectId`; deselect on empty space; the nuScenes
    canvas is never re-created (also not by mode switches, slider moves or recolouring — checked on
    the canvas element and by counting wire colours in the live three.js scene); the whole F4 review
    flow; COCO.
  - Tests **386 → 530** (`lib/evaluation` 139, `lib/data` 5). `tsc --noEmit` 0 errors. CI lint 0
    errors (19 pre-existing warnings). Production build passes. `predict_nuscenes.py` run twice →
    byte-identical file.
- **Changes from the plan, and why:**
  1. **Two numbers in the design doc's score-sweep table were wrong.** False alarms at min score 0.05
     / 0.10 are **243 / 104**, not 220 / 98 (precision 34% / 53%, not 37% / 54%). The planning probe
     dropped a prediction lying on *any* unscored label; the designed rule drops only one of the
     label's own class. Re-measured independently; the tests lock the corrected values. The default
     (0.25) and above were right. The design doc is left as written (Edge_F#5 Case 7).
  2. **F5-0 became a small helper with tests** (`fetchJson`) instead of a one-line change, because
     the predictions request needs the same check.
  3. **More modules in `lib/evaluation` than the design listed** (`evaluate`, `outcomes`, `list`,
     `describe`, `box-colors` next to the planned `overlay`): each piece of "what to show" that could
     be a pure function was made one, so the components only lay things out. The type contract
     between the overlay builder and `Viewer2D` lives in `lib/ui/image-overlay.ts`.
  4. **"No entry in the file" is distinct from "an empty entry"** (`evaluateFrames`): the first is
     not evaluated at all, the second is all misses. The design said "예측 없음, not 0"; the two-case
     split is the implementation of it.
  5. **Wording that does not blame the model.** "91 of 104 model boxes matched a label" (mockup:
     "were right"), "labelled objects" (mockup: "real objects"); the model name is shown as written
     in the file ("yolov8n").
  6. **The selected miss / false alarm also shows its "companion" box** — the box the explanation
     refers to, drawn in a neutral colour even when it is below the minimum score. Without it the
     sentence "closest model box: person 0.15" pointed at nothing on screen.
  7. **Outcome chips filter the list and the photo** (design: the list). Not the 3D view — it answers
     "where", and hiding by outcome would remove the context.
  8. **List rows drop the short id below 1400px** (full id in the tooltip): the mockup's truncated
     class names at 240px.
  9. **Panel density.** The frame row shows "not scored" as icon + number only, and paddings were
     tightened, so that at 1536×700 (275px-tall panel) all three distance bands stay visible under
     the pinned strip. Recall by class needs a scroll at that size (as the design predicted).
  10. **Not scored and not evaluated share one grey in the 3D view** (legend: "not evaluated"); the
      list and the panel tell them apart.
  11. **The list's scroll-into-view logic moved from `ObjectList` into a shared hook** (unchanged
      behaviour) — a file the design had not listed, touched because the result list needs the same,
      twice-fixed logic.
  12. **From the edge-case review (not in the design):** Reset in evaluate mode keeps review mode's
      distance filter (Case 1); the panel states the score actually in effect when the slider is
      below the file's minimum (Case 2); the selected row follows when the slider moves it (Case 3);
      the top bar's left group wraps on phone widths (Case 4).
  13. **Measured, not optimised.** Scoring all frames: 0.2–0.4 ms. A slider step: ≈ 105 ms in
      evaluate mode vs ≈ 80 ms for the distance slider, on an idle baseline of ≈ 48 ms (production
      build, software GL).
- **Decisions kept from the design doc:** mode as page-level view state; predictions outside `Frame`
  with ids `pred:<frame>:<index>`; IoU 0.3, same class, greedy by score; visibility 0–40% not
  scored; `yolov8n.pt` at 1280 px, file down to score 0.05, slider default 0.25; `frameHasConfidence`
  and `viewer-store` untouched (the slider is the existing `confidenceThreshold`); class chips never
  change a number; every percentage shown with its counts and "small sample"; `null` → "—"; no new
  shortcuts and no review writes in evaluate mode; practice and evaluate exclude each other; no new
  library.
- **Not done / open:**
  - **The numbers are a demonstration, not a result**: 10 frames, one camera, one scene, the smallest
    YOLO without fine-tuning. Do not quote them as model performance before F6 / F7.
  - **Bicycle racks** (HANDOFF "to verify"): none of the 10 rack boxes or 19 bicycle boxes is in
    CAM_FRONT, so no rule was needed or testable. Re-check with six cameras (F6).
  - **No human verdict on predictions, no export of evaluation results, no mAP / PR curve, no model
    comparison** — out of scope by design.
  - **three.js idle cost on nuScenes** — unchanged, still its own item (the user chose a separate
    session). It is the ≈ 48 ms baseline in the measurement above.
  - Visibility is nuScenes' six-camera figure; an object hidden only from the front camera may still
    be scored. Stated in the panel.
  - Measurements were taken in headless software GL; frame rate on the user's laptop not measured.
  - Windows shorter than ~700 px scroll 40 px (identical in review; pre-existing).
  - COCO mode: still on hold.
- **Edge refs:** Edge_F#5 Cases 1–7 + "measured and not changed" + "observed, accepted".

<!-- KO (move to a localized file)
## F5 — 카메라 탐지 평가 ✅ 완료 (2026-11-26; F5-0, F5-A ~ F5-D)
- 설계 문서: `docs/plan-feature/F5_camera_detection_eval.md`(임시 승인: 결정 1 "검수 / 평가 모드 전환"은 사용자가
  시안을 보고 선택, 결정 2~13은 추천안으로 만들고 캡처를 보며 조정). 시안과 단계별 캡처: `docs/plan-feature/assets/F5/`.
- 목표: 2D 카메라 탐지 모델(YOLOv8n, 미리 실행)을 카메라 사진 위에서 nuScenes 정답과 비교해 채점하고, 놓친 물체가
  **3D 공간의 어디에** 있는지와 거리에 따라 탐지율이 어떻게 달라지는지 보여준다. 로드맵의 두 번째 기둥이다.
- 범위(만든 것):
  - F5-0 불러오기 수정(별도 `fix:`): 요청이 실패하면 JSON 해석 오류가 아니라 HTTP 상태를 보여준다(F4에서 미룬 항목).
  - F5-A 데이터와 로직(화면 변화 없음): `scripts/predict_nuscenes.py` → `predictions.json`(사진 10장에 예측 428개,
    점수 0.05 이상, 32KB, 모델 출력 그대로). `lib/evaluation/`(타입, 파서, IoU, 클래스 대응, 짝짓기, 지표).
  - F5-B 모드와 요약: 상단의 `Review | Evaluate`, 예측 파일 불러오기, 평가 패널, "Min score" 슬라이더, 타임라인의 "N missed".
  - F5-C 사진과 목록: 정답은 점선·모델은 실선·색은 결과, 결과 목록, 헛짚음 선택(선택 상태는 하나 그대로),
    선택한 결과의 이유 한 줄, J / K / Z.
  - F5-D 3D와 마무리: 3D 박스를 결과 색으로 + 범례, 예측 파일이 없거나 일부만 있거나 깨졌거나 늦게 올 때의 화면.
  - F5-D 뒤 엣지 케이스 검증: 수정 4건 추가.
- 완료 기준(설계 문서 8장): 모두 충족. 실제 앱을 Playwright로 조작해 확인(F5-0 10항목, B 59, C 47, D 33, 엣지 26,
  기존 동작 회귀 30, 3D 클릭 확인). 테스트 386 → 530개, tsc 오류 0개, CI 린트 오류 0개, 배포용 빌드 성공,
  스크립트를 두 번 돌려 같은 파일이 나옴을 확인.
- 계획과 달라진 점과 이유:
  1. **설계 문서의 점수별 표에서 숫자 2개가 틀렸다.** 점수 기준 0.05 / 0.10의 헛짚음은 220 / 98이 아니라 **243 / 104**다
     (Precision 34% / 53%). 사전 조사 스크립트가 채점 제외 규칙을 클래스와 무관하게 적용했고, 설계한 규칙은 같은
     클래스만이다. 독립 계산으로 다시 확인했고 테스트가 올바른 값을 고정한다. 기본값 0.25 이상은 맞았다. 설계 문서는 그대로 둔다.
  2. F5-0은 한 줄 수정이 아니라 작은 함수 + 테스트(`fetchJson`)가 됐다. 예측 파일 요청에도 같은 확인이 필요해서다.
  3. `lib/evaluation`의 모듈이 설계보다 많다(`evaluate`, `outcomes`, `list`, `describe`, `box-colors`). "무엇을 보여줄지"를
     순수 함수로 빼서 컴포넌트는 배치만 하게 했다. `Viewer2D`와의 약속은 `lib/ui/image-overlay.ts`의 타입이다.
  4. "파일에 그 프레임이 없음"과 "예측이 0개"를 구분한다. 앞의 것은 평가하지 않고, 뒤의 것은 전부 놓침이다.
  5. 모델을 탓하지 않는 문구로 바꿨다("matched a label", "labelled objects"). 모델 이름은 파일에 적힌 그대로.
  6. 선택한 놓침 / 헛짚음에는 설명이 가리키는 "상대 박스"를 함께 그린다(점수가 기준보다 낮아도 회색으로).
  7. 결과 칩은 목록과 사진을 함께 거른다(설계는 목록만). 3D는 거르지 않는다.
  8. 1400px 미만에서 목록의 짧은 ID를 숨겼다(클래스 이름이 잘리던 문제).
  9. 패널을 촘촘하게 했다(채점 제외는 아이콘과 숫자만, 여백 축소). 1536×700에서 거리별 막대 3줄이 보인다.
  10. 3D에서 채점 제외와 평가하지 않음은 같은 회색이다. 목록과 패널에서는 구분한다.
  11. 목록의 "선택한 행으로 스크롤" 코드를 `ObjectList`에서 공용 훅으로 옮겼다(동작 변화 없음).
  12. 엣지 검증에서 추가: 평가 모드의 Reset이 검수 모드의 거리 필터를 지우지 않음(Case 1), 슬라이더가 파일의 최소
      점수보다 낮으면 실제로 적용되는 점수를 표시(Case 2), 슬라이더로 행이 옮겨져도 선택한 행이 보임(Case 3),
      휴대폰 폭에서 상단 바 왼쪽 묶음이 줄바꿈(Case 4).
  13. 재고 최적화하지 않음: 전체 채점 0.2~0.4ms, 슬라이더 한 칸은 평가 모드 약 105ms / 거리 슬라이더 약 80ms /
      가만히 있을 때 약 48ms(배포용 빌드, GPU 없는 환경).
- 설계대로 유지: 모드는 page의 화면 설정, 예측은 `Frame` 밖 + `pred:` ID, IoU 0.3·같은 클래스·점수순, 가시성 0~40% 채점 제외,
  입력 1280·저장 0.05 이상·기본 0.25, `frameHasConfidence`와 `viewer-store`는 그대로, 클래스 칩은 숫자를 바꾸지 않음,
  모든 비율 옆에 개수와 "small sample", 분모 0이면 "—", 새 단축키 없음, 연습 모드와 평가 모드는 서로 막음, 새 라이브러리 없음.
- 남은 것:
  - **숫자는 시연이지 결과가 아니다.** 프레임 10개, 카메라 1대, 장면 1개, 추가 학습 없는 가장 작은 YOLO. F6 / F7 전에는
    모델 성능으로 인용하지 않는다.
  - 자전거 거치대: 앞 카메라에 잡히는 것이 0개라 규칙이 필요 없었고 검증할 수도 없었다. 카메라 6대(F6)에서 다시 본다.
  - 예측에 대한 사람의 판정, 평가 결과 내보내기, mAP / PR 곡선, 모델 비교는 범위 밖.
  - three.js 상시 비용은 그대로다(별도 세션). 위 측정의 바닥 48ms가 이것이다.
  - 가시성은 카메라 6대 기준 값이다. 패널에 밝혀 두었다.
  - 측정은 GPU 없는 환경에서 했다. 높이 700px 미만의 창은 40px 스크롤된다(검수 모드와 같음, 기존).
  - COCO 모드: 계속 보류.
- Edge refs: Edge_F#5 Case 1~7, "측정하고 바꾸지 않은 것", "관찰하고 그대로 둔 것".
-->

---

## F6 — Six Cameras ✅ Done (2026-11-26; F6-A … F6-D)
- **Design doc:** `docs/plan-feature/F6_six_cameras.md` (provisionally approved: the user looked at
  the mockups and said "proceed as recommended" — all 17 decisions built as recommended and adjusted
  from captures). Mockups + per-step captures: `docs/plan-feature/assets/F6/` (`compare.html`,
  `steps.html`).
- **Goal:** use all six nuScenes cameras. Selecting a 3D box shows the camera that sees it, and both
  pillars — label review (F4) and detector evaluation (F5) — work around the whole vehicle instead of
  in front of it only. Answers the posting's "multimodal data".
- **Scope (as built):**
  - **F6-A — data + logic (no visual change).** `prep_nuscenes.py` exports six cameras per frame
    (photo, that photo's own `ego_pose`, calibration) as `cameras[]` — `nuscenes.json` format 1.2,
    +50 photos (60, 8.04 MB), JSON 1,497 → 1,535 KB. The parser builds one 2D-box list per camera
    (`Frame.cameras`). `lib/cameras`: `frameAsCamera`, `camerasSeeing`, `camerasByBestView`,
    `pickCamera`, `stepCamera`, display order / short names, `preloadOrder`.
  - **F6-B — camera cell + review.** Thumbnail row under the large photo (`CameraStrip`), the camera
    follows the selection (`useActiveCamera`), `[` / `]`, "outside CAM_X · seen by B, BR", camera tags
    in the object list and the evidence line, orders "By camera" and "Unsure first", practice mode
    over all cameras, background photo preload.
  - **F6-C — evaluation over six cameras.** `predict_nuscenes.py` runs all 60 photos →
    `predictions.json` format `@2` (1,597 predictions, 120 KB). Each PHOTO is scored on its own and the
    counts are added; a per-object outcome ("found by any camera") colours the 3D boxes. Bicycle-rack
    rule. List and photo show the camera on screen; thumbnails carry that photo's miss count; the
    panel adds recall by camera.
  - **F6-D — finish.** Audit of every direct read of `frame.detections2D` / `imageUrl`, wording that
    still described one camera, measurements on the production build.
  - **Edge-case review** after F6-D: two more fixes, see below.
- **Done when (design doc §8) — all met, verified by driving the real app with Playwright** (F6-A 41
  checks, F6-B 58, F6-C 56, edge review 45; B and C re-run after the edge fixes):
  - 583 boxes: 443 seen by one camera, 140 by two, **0 by none** (before F6: 383 could not be checked
    against a photo). Boxes per camera 200 / 79 / 184 / 55 / 36 / 169.
  - The front camera's 2D boxes, every 3D box and every LiDAR point are deep-equal to the pre-F6
    file's; every pre-existing field of `nuscenes.json` is unchanged; a format-1.1 file still works as
    one camera.
  - Selecting a box behind the car shows the rear camera with the projected 3D box; a thumbnail click
    keeps the selection; the photo follows a tracked object through playback; the canvas is never
    re-created.
  - **Front camera alone: found 91, missed 83, false alarms 13, not scored 26 — unchanged.** All 60
    photos: **349 / 182 / 107 / 180**, Precision 77%, Recall 66%; rack rule off → 121 false alarms.
    Per object: 295 of 418 found by at least one camera. Frame 6 in 3D: 28 green, 16 red, 17 grey
    (was 12 / 10 / 39).
  - A missing predictions file, a format-`@1` file (front camera only) and a missing photo each leave
    review working and are reported, never counted as "0 found".
  - No page scroll and a one-line top bar at 1024 / 1100 / 1280 / 1440 / 1536 / 1920 in review and
    evaluate; no sideways scroll down to 320 px. COCO unchanged (no thumbnail row, no mode switch).
  - Tests **530 → 688** (`lib/cameras` 62, parser +15, review +16, evaluation +65). `tsc --noEmit` 0
    errors. CI lint 0 errors (19 pre-existing warnings). Production build passes. Both data scripts
    run twice → byte-identical files.
- **Changes from the plan, and why:**
  1. **List tags show the best camera + "+", not every camera** ("B+" instead of "BR·B"). The full
     names truncated "person" to "pers…" in the 240 px list. The complete list is in the tooltip and
     in the evidence line. The distance column lost 8 px below 1400 px to pay for the tag.
  2. **Camera names are listed best view first**, not in thumbnail order (mockup): the first name is
     the camera the photo switches to, so the list, the evidence line and the photo agree.
  3. **The per-object line sits under "Recall by camera"**, not under Precision / Recall (mockup). At
     1536×700 it pushed the distance bars out of the 232 px panel.
  4. **The panel's frame row is the sum over the frame's six photos** (19 / 5 / 35 / 17 for frame 6)
     while the list is one photo. The list title carries the camera tag ("F", "FR") to tell them
     apart. The design had not said which of the two the frame row is.
  5. **Rack-ignored model boxes are drawn in grey on the photo** (the design only said "left out").
     The model did report them; hiding them would hide a fact. They are not results and select
     nothing; the rack label is selectable and explains itself.
  6. **Four "not evaluated" reasons instead of two** in the pinned strip: not in this photo (with what
     the other cameras made of it), seen by no camera, a class the model cannot name, a bicycle rack.
  7. **"Unsure first" needed its own auto-advance** (`nextUnsure`): after re-judging an unsure box the
     reviewer wants the next unsure one, not the next unreviewed one. Not in the design.
  8. **`FrameEvaluation` kept its name and now means one photo**; the frame-level result is the new
     `FrameCamerasEvaluation`. `evaluateFrame` is unchanged apart from the rack rule — it is handed
     `frameAsCamera(frame, name)`.
  9. **The size of `nuscenes.json` was estimated at +2–3 KB per frame; measured +3.8 KB** (+38 KB).
  10. **From the edge-case review (not in the design):** the object list keeps the selected row
      visible when a verdict moves it (Case 1); the thumbnail row has a fixed number of cells so
      frames with fewer cameras do not move the panes (Case 2).
  11. **Measured, not optimised.** Scoring 60 photos: 1.1 ms. Six cameras add no measurable
      interaction latency over one camera. Preload concurrency 2 → 4 tried and reverted.
- **Decisions kept from the design doc:** thumbnail row under the photo (cost: details panel 43 px
  shorter — 275 → 232 at 1536×700); look-around order BL FL F FR BR B; automatic camera on selection
  / frame change, manual choice until then; `[` `]`; per-photo counting; 3D colour = found by any
  camera; list = the photo on screen; rack rule by centre, bicycle + motorcycle; no rule for labels
  cut off by the image edge (it would change the front camera's numbers); `predictions@2` with the
  camera in the id; `Frame.cameras` beside the existing fields; each photo's own ego pose, 3D frame
  still CAM_FRONT's; preload all ten frames, thumbnails reuse the photo file; practice mode over any
  camera; active camera as page view state (Rule #2); no new library.
- **Not done / open:**
  - **The numbers are still a demonstration, not a result**: one scene, ten frames. Sixty photos of
    the same ten moments are not more evidence about the model.
  - **Labels cut off by the image edge are scored like any other** (38% recall when less than half of
    the box is in the photo vs 68% when all of it is). Stated in the panel; the per-object line and
    "other camera: …" show what the neighbouring camera did.
  - **Practice sets differ from F5's for the same seed** (the candidate pool grew from 200 to 583
    boxes). Practice records are their own scope; real review records are unaffected.
  - **Photos lag playback on slower connections** if Play is pressed at once (≈ 10 photos/s arrive at
    20 Mbps, playback needs 12). Boxes and numbers do not depend on photos. F7 must bound the preload.
  - **Memory held by preloaded photos not measured.** Frame rate on the user's laptop not measured
    (headless software GL here).
  - **three.js idle cost** — unchanged; the user chose to do it after F6, before F7.
  - ~~**Found, not caused by F6, not changed:** the last class chip is cut off at 1024 px; "5 false
    alarm" is not pluralised. Reported to the user.~~ **Fixed afterwards on the user's request**, in a
    separate `fix:` commit (`classLabel` for the long chip + tighter chips below 1280 px;
    `outcomeCountLabel`). Tests 688 → **695**. See Edge_F#6.
  - Whether the nuScenes benchmark's bike-rack filter is applied to predictions, ground truth or both
    was not confirmed from the source file read.
  - COCO mode: still on hold.
- **Edge refs:** Edge_F#6 Cases 1–6 + "measured and not changed" + "observed, accepted".

<!-- KO (move to a localized file)
## F6 — 카메라 6대 ✅ 완료 (2026-11-26; F6-A ~ F6-D)
- 설계 문서: `docs/plan-feature/F6_six_cameras.md`(임시 승인: 사용자가 시안을 보고 "추천대로 진행하라"고 함. 결정 17개를
  모두 추천안으로 만들고 캡처를 보며 조정). 시안과 단계별 캡처: `docs/plan-feature/assets/F6/`.
- 목표: nuScenes 카메라 6대를 모두 쓴다. 3D 박스를 고르면 그 박스를 보는 카메라를 보여주고, 검수(F4)와 평가(F5)가
  차 앞쪽만이 아니라 차 주위 전체에서 동작한다. 공고의 "멀티모달 데이터"에 답한다.
- 범위(만든 것):
  - F6-A 데이터와 로직(화면 변화 없음): 준비 스크립트가 프레임마다 카메라 6대(사진, 그 사진의 `ego_pose`, 보정값)를
    `cameras[]`로 내보냄. `nuscenes.json` 형식 1.2, 사진 50장 추가(60장, 8.04MB), JSON 1,497 → 1,535KB.
    파서가 카메라마다 2D 박스를 만듦(`Frame.cameras`). `lib/cameras`의 순수 함수들.
  - F6-B 카메라 칸과 검수: 큰 사진 아래 썸네일 줄, 선택을 따라가는 카메라, `[` `]`, 안내문, 목록과 근거 줄의 카메라 표시,
    정렬 "By camera"와 "Unsure first", 연습 모드의 6대 기준, 사진 미리 받기.
  - F6-C 평가 6대: 예측 스크립트가 60장을 돌림 → `predictions.json` 형식 @2(예측 1,597개, 120KB). 사진 한 장씩 채점해
    더하고, 물체 단위 결과("어느 카메라에서든 찾음")로 3D 박스를 칠함. 거치대 규칙. 목록과 사진은 지금 보는 카메라,
    썸네일에 놓친 개수, 패널에 카메라별 Recall.
  - F6-D 마무리: `frame.detections2D` / `imageUrl`을 직접 읽는 곳 전수 확인, 카메라 한 대를 전제로 한 문구 정리,
    배포용 빌드 측정.
  - F6-D 뒤 엣지 케이스 검증: 수정 2건 추가.
- 완료 기준(설계 문서 8장): 모두 충족. 실제 앱을 Playwright로 조작해 확인(F6-A 41항목, B 58, C 56, 엣지 45).
  - 박스 583개: 1대에 443개, 2대에 140개, **0대에 0개**(F6 전에는 383개를 사진으로 확인할 수 없었음).
  - 앞 카메라의 2D 박스, 모든 3D 박스, LiDAR 점이 F6 전 파일로 만든 것과 완전히 같다. 형식 1.1 파일도 카메라 하나로 동작.
  - **앞 카메라만: 찾음 91, 놓침 83, 헛짚음 13, 채점 제외 26 그대로.** 사진 60장: **349 / 182 / 107 / 180**, Precision 77%,
    Recall 66%. 거치대 규칙을 끄면 헛짚음 121. 물체 단위로는 418개 중 295개. 프레임 6의 3D: 초록 28, 빨강 16, 회색 17
    (이전 12 / 10 / 39).
  - 예측 파일이 없거나, @1 형식이거나, 사진 한 장이 없어도 검수는 동작하고, "0개 찾음"으로 세지 않고 이유를 알린다.
  - 1024 ~ 1920px에서 스크롤 없음·상단 바 한 줄(검수, 평가). 320px까지 가로 넘침 없음. COCO는 그대로.
  - 테스트 530 → 688개, tsc 오류 0개, CI 린트 오류 0개(기존 경고 19개), 배포용 빌드 성공, 두 스크립트 모두 두 번 돌려 같은 파일.
- 계획과 달라진 점과 이유:
  1. 목록의 이름표는 모든 카메라가 아니라 "가장 잘 보이는 카메라 + '+'"("BR·B" 대신 "B+"). 다 적으면 240px 목록에서
     "person"이 잘렸다. 전체는 툴팁과 근거 줄에 있다. 1400px 미만에서 거리 칸을 8px 줄여 자리를 맞췄다.
  2. 카메라 이름은 썸네일 순서가 아니라 잘 보이는 순서로 적는다. 첫 이름이 큰 사진이 가는 카메라라서 서로 맞는다.
  3. "물체 단위" 한 줄은 Precision / Recall 아래가 아니라 "Recall by camera" 아래에 둔다. 1536×700에서 거리별 막대를
     화면 밖으로 밀어냈다.
  4. 패널의 프레임 줄은 그 프레임의 사진 6장 합계이고 목록은 사진 한 장이다. 목록 제목에 카메라 이름표를 붙여 구분한다.
  5. 거치대 규칙으로 뺀 모델 박스를 사진에 회색으로 그린다(설계는 "뺀다"만). 모델이 그린 것은 사실이라 숨기지 않았다.
  6. 선택한 박스가 "평가하지 않음"인 이유를 2가지에서 4가지로 나눴다(이 사진에 없음, 어느 카메라에도 안 보임,
     모델이 모르는 클래스, 자전거 거치대).
  7. "Unsure first"에는 자체 넘김 규칙이 필요했다(`nextUnsure`). 다시 판정한 뒤에는 다음 판단 불가 박스로 간다.
  8. `FrameEvaluation`은 이름을 유지하고 "사진 한 장"을 뜻하게 됐다. 프레임 단위 결과는 새 `FrameCamerasEvaluation`이다.
  9. `nuscenes.json` 증가량은 프레임당 2~3KB로 추정했는데 실측은 3.8KB(전체 +38KB)였다.
  10. 엣지 검증에서 추가: 판정으로 줄이 옮겨져도 선택한 줄이 보임(Case 1), 썸네일 줄의 칸 수를 고정해 카메라 수가 다른
      프레임에서도 칸이 움직이지 않음(Case 2).
  11. 재고 최적화하지 않음: 60장 채점 1.1ms, 카메라 6대가 조작 시간에 더한 것은 측정되지 않음, 미리 받기 동시 요청 2 → 4는
      시험해 보고 되돌림.
- 설계대로 유지: 사진 아래 썸네일 줄(대가: 패널 43px 감소), 둘러본 순서, 선택·프레임 전환 때 자동 카메라, `[` `]`,
  사진 단위 합계, 3D 색은 "어느 카메라에서든 찾음", 목록은 지금 보는 사진, 거치대 규칙(중심 기준, 자전거와 오토바이),
  가장자리에 잘린 정답에는 규칙 없음, `predictions@2`, `Frame.cameras`를 기존 필드 옆에, 사진마다 자기 ego pose,
  10개 프레임 전부 미리 받기, 지금 보는 카메라는 page의 화면 설정(규칙 #2), 새 라이브러리 없음.
- 남은 것:
  - 숫자는 여전히 시연이지 결과가 아니다. 장면 하나, 프레임 10개다.
  - 사진 가장자리에 잘린 정답도 그대로 채점한다(절반도 안 들어온 정답의 Recall 38%, 온전히 들어온 정답 68%).
  - 연습 세트가 같은 시드라도 F5 때와 다르다(후보가 200개에서 583개로).
  - 느린 회선에서 화면이 뜨자마자 재생하면 사진이 재생을 따라오지 못한다. F7에서 미리 받는 범위를 정해야 한다.
  - 미리 받은 사진의 메모리, 사용자 노트북의 프레임률은 재지 않았다.
  - three.js 상시 비용은 그대로다(사용자 결정: F6 뒤, F7 전).
  - (끝남) F6이 만든 것이 아니라 고치지 않았던 2건(1024px에서 마지막 클래스 칩이 잘림, "5 false alarm"의 복수형)은
    사용자 요청으로 별도 `fix:` 커밋에서 고쳤다. 테스트 688 → 695개.
  - nuScenes 공식 평가의 거치대 처리가 예측과 정답 중 어디에 적용되는지는 확인하지 못했다.
  - COCO 모드: 계속 보류.
- Edge refs: Edge_F#6 Case 1~6, "측정하고 바꾸지 않은 것", "관찰하고 그대로 둔 것".
-->

## F6.5 — three.js idle cost (performance fix, not a feature) ✅ Done (2026-11-26)
- **What this is:** not a feature. One performance problem found in F4 and carried through F5 and
  F6, done in its own session between F6 and F7 (user decision): measure → find the cause → fix →
  measure again. No design doc (nothing to design before the cause was known). The number "6.5" only
  places it between F6 and F7.
- **Goal:** stop the nuScenes 3D scene from spending CPU on shader-program bookkeeping while nothing
  happens, without changing how the 3D view looks or behaves.
- **Cause (fact, see Edge_F#6.5 Case 1):** every `BBox3D` has a full-volume pick mesh. It was made
  invisible with `transparent opacity={0}` on a double-sided material; three.js draws such a material
  in two passes and flags it `needsUpdate` each time, so each box re-evaluated its shader program
  twice per frame (≈ 78 look-ups per frame on a 40-box frame, and 78 of 119 draw calls).
- **Fix (one file, `components/viewer-3d/BBox3D.tsx`):** the pick mesh is `visible={false}` with a
  plain `<meshBasicMaterial side={DoubleSide} />`. The raycaster ignores `visible`, so clicks and
  hover are unchanged; `side` stays because the raycaster reads it (click from inside a box).
- **Before → after** (production build, idle, JS ms per second of wall time, median of three 5 s
  CPU profiles; software GL / integrated-GPU GL):

  | Case | Software GL | Hardware GL | Draw calls / frame |
  |---|---|---|---|
  | nuScenes, no selection | 67.7 → **15.0** | 114.3 → **34.1** | 119 → 41 |
  | nuScenes, one box selected | 81.3 → **14.2** | 116.5 → **27.3** | 119 → 41 |
  | COCO, no selection | 16.1 → 9.9 | 39.0 → 24.6 | 17 → 7 |
  | COCO, one box selected | 13.6 → 10.2 | 35.8 → 16.8 | 17 → 7 |

  Shader bookkeeping (`getParameters` + `getProgramCacheKey`): 29.5 / 53.6 ms/s → 0. GPU geometries
  80 → 41, shader programs 5 → 3. Frame rate ~59 fps before and after (it was CPU cost, not jank).
- **Done when — all met, verified on the fixed production build:**
  - nuScenes 3D pane pixel-identical (0 of 521,088 pixels, default + three orbited views).
  - Hover and click results identical at 135 grid points on both datasets; click from inside a box
    works.
  - Regression script 46 / 46: selection, pulse, label, deselect, Follow, playback tween and exact
    pose on pause, canvas never re-created (selection, Follow, playback, mode, frame, five window
    sizes), evaluate colours on frame 6 = 28 / 16 / 17, Precision 77% / Recall 66%, 349 of 456,
    349 of 531, front camera 91/174, review A / U / J / K, six thumbnails + auto camera, COCO.
  - Tests **695** (unchanged — no pure logic changed, UI-only per the Testing Policy), `tsc --noEmit`
    0 errors, CI lint 0 errors (19 pre-existing warnings), production build passes.
- **One visible change, approved by the user before the fix:** on **COCO** the floor grid now shows
  through the boxes. The old invisible mesh still wrote depth and erased the grid lines behind a box
  (1.6–1.8% of the pane in two of four views). The alternative (`forceSinglePass`, pixel-identical
  everywhere, ≈ 2× the remaining cost because 40 invisible boxes are still drawn) was offered and not
  chosen. See Edge_F#6.5 Case 2.
- **Decisions:** option A (`visible={false}`) over B (`forceSinglePass`). `frameloop="demand"` and
  `instancedMesh` not attempted (measured, no hot spot left — Edge_F#6.5 "Measured and NOT changed").
  A new R3F Performance Rule records the cause (`architecture.md`).
- **Open / not measured:** F4's absolute numbers (≈ 420–560 ms/s) were not reproduced — today's
  "before" is 6–7× lower with the same share for the program functions; reason not found. Not
  measured: the discrete GPU, GPU-process time, the user's own browser, the dev server.
- **Captures:** `docs/plan-feature/assets/F6.5/` (`compare.html`).
- **Edge refs:** Edge_F#6.5 Case 1–2, "Measured and NOT changed", "Could not be measured".

<!-- KO (move to a localized file)
## F6.5 — three.js 상시 비용 (기능이 아니라 성능 수정) ✅ 완료 (2026-11-26)
- 무엇인가: 기능이 아니다. F4에서 찾아 F5, F6 동안 그대로 둔 성능 문제 하나를 F6과 F7 사이의 별도 세션에서
  처리했다(사용자 결정). 재고 → 원인을 찾고 → 고치고 → 다시 쟀다. 설계 문서는 없다. "6.5"는 F6과 F7 사이라는 뜻일 뿐이다.
- 목표: 아무 일도 없을 때 nuScenes 3D 장면이 셰이더 정보 계산에 CPU를 쓰지 않게 한다. 3D 화면의 모습과 동작은 그대로 둔다.
- 원인 (사실, Edge_F#6.5 Case 1): 박스마다 클릭을 받는 속이 찬 상자가 있다. 이 상자를 "투명 + 양면 + 투명도 0"으로 안 보이게
  해 두었는데, three.js는 그런 재질을 두 번에 나눠 그리고 그때마다 "바뀌었음" 표시를 붙인다. 그래서 박스마다 프레임당 두 번씩
  셰이더 정보를 다시 따졌다(박스 40개 프레임에서 프레임당 약 78번, 그리기 호출 119번 중 78번).
- 수정 (파일 하나, `BBox3D.tsx`): 클릭용 상자를 `visible={false}`로 하고 재질은 `side={DoubleSide}`만 남겼다. 클릭 판정은
  `visible`을 보지 않으므로 클릭과 마우스 올림은 그대로다. `side`는 클릭 판정이 읽으므로 남겼다(박스 안에서의 클릭).
- 전후 (배포용 빌드, 가만히 둔 상태, 1초당 JS ms, 5초 프로파일 3번의 가운데 값. 소프트웨어 렌더링 / 내장 GPU):
  nuScenes 선택 없음 67.7 → 15.0 / 114.3 → 34.1, 선택 있음 81.3 → 14.2 / 116.5 → 27.3.
  COCO 선택 없음 16.1 → 9.9 / 39.0 → 24.6, 선택 있음 13.6 → 10.2 / 35.8 → 16.8.
  그리기 호출 119 → 41 (COCO 17 → 7). 셰이더 정보 계산 29.5 / 53.6 → 0. GPU에 올린 도형 80 → 41. 프레임률은 전후 모두 약 59fps.
- 완료 기준 (모두 충족, 고친 배포용 빌드에서 확인): nuScenes 3D 칸 픽셀 동일(521,088개 중 0개, 기본 + 돌린 화면 3개).
  두 데이터셋의 격자 135곳에서 마우스 올림과 클릭 결과 동일. 박스 안에서의 클릭 동작. 확인 스크립트 46 / 46(선택, 맥동,
  이름표, 선택 해제, 따라가기, 재생 중 이동과 멈췄을 때의 정확한 위치, 캔버스가 다시 만들어지지 않음, 프레임 6의 색
  28 / 16 / 17, 평가 숫자, 검수 키, 썸네일 6개와 자동 카메라, COCO). 테스트 695개(그대로), tsc 0, 린트 오류 0(경고 19), 빌드 성공.
- 눈에 보이는 변화 하나 (고치기 전에 사용자가 승인): COCO에서 바닥 격자가 박스 너머로 보인다. 예전의 안 보이는 상자는
  깊이 값을 써서 박스 뒤의 격자 줄을 지우고 있었다(네 방향 중 두 방향에서 1.6~1.8%). 대안(`forceSinglePass`, 픽셀이 모두
  같지만 안 보이는 상자 40개를 계속 그려 남는 비용이 약 2배)도 제시했고 사용자가 A를 골랐다. Edge_F#6.5 Case 2.
- 결정: A(`visible={false}`). `frameloop="demand"`와 `instancedMesh`는 하지 않았다(재 보니 남은 곳에 두드러진 비용이 없다).
  원인을 R3F Performance Rules에 새 규칙으로 적었다.
- 남은 것 / 재지 못한 것: F4의 절대 숫자(초당 약 420~560ms)는 재현되지 않았다. 오늘의 "전" 숫자는 그 6~7분의 1이고
  셰이더 정보 계산의 비율은 같다. 이유는 찾지 못했다. 외장 GPU, GPU 프로세스의 시간, 사용자의 실제 브라우저, 개발 서버는 재지 않았다.
- 캡처: `docs/plan-feature/assets/F6.5/`(`compare.html`).
- Edge refs: Edge_F#6.5 Case 1~2, "측정하고 바꾸지 않은 것", "재지 못한 것".
-->

## F7 — Scene Exploration ✅ Done (2026-11-27; prep, F7-A … F7-E)
- **Design doc:** `docs/plan-feature/F7_scene_exploration.md` (approved 2026-11-27: decisions 1–3 as
  recommended — all of nuScenes-mini, 960×540 WebP photos, files in the repo's `public/`; the other
  14 built as recommended and adjusted from captures). Mockups, per-step captures and edge captures:
  `docs/plan-feature/assets/F7/` (`compare.html`, `steps.html`).
- **Goal:** go from ten frames of one scene to every keyframe of nuScenes-mini, without loading it
  all at once, and find scenes and frames by condition.
- **Scope (as built):**
  - **Prep — loader out of `page.tsx`** (no visual change): pure `lib/data/buildFrames` + hook
    `components/dataset/useDataset`.
  - **F7-A — data** (no visual change): `prep_nuscenes.py` exports all ten scenes as split files —
    catalog `scenes.json`, per scene `frames.json` (boxes + cameras, prepped format **1.3**) and
    `predictions.json`, per frame a self-contained points file, six reduced photos and a front-camera
    thumbnail. `predict_nuscenes.py` runs YOLOv8n on the ORIGINAL 1600×900 photos, one file per
    scene. `lib/nuscenes`: `parseSceneCatalog`, `parseNuScenesPoints`, 1.3 frames (`pointCloudSource`,
    `thumbnailUrl` on `Frame`). **3,253 files, 152.49 MB** (photos 98.33, points 42.39, boxes 7.45,
    predictions 3.22, thumbnails 1.09); the user confirmed the size before the files went in.
  - **F7-B — chunked loading + scenes:** `useScenes` (catalog → the scene on screen first → the other
    scenes' boxes in the background, two at a time), `useFramePoints` (per-frame points, 3 frames
    ahead, last 24 kept), bounded photo preload (72 kept), scene picker (`components/scenes`),
    scrubber timeline (one cell with a bar per frame, thumbnail on hover), the camera re-fits inside
    the SAME canvas on a scene change. The old single file, its 60 photos and predictions were removed.
  - **F7-C — search:** `lib/search` (conditions, hits, order, presets) and a third mode **Explore**
    (`components/explore`: condition bar, result list, Search panel; boxes that count stay coloured in
    3D; the timeline marks matching frames; J / K step through hits across scenes).
  - **F7-D — evaluation meets search:** `lib/evaluation/evaluateScenes`; the evaluation panel's "All
    scenes" block (total, recall per scene, day / night with the number of DRIVES, the limits in
    words); model conditions in Explore (missed labels, false alarms, false alarms with no label
    nearby) at the default rules, with the counted results drawn in the photo and a count per camera
    thumbnail.
  - **F7-E — finish:** measurements on the production build, short class names, "the model saw the
    original photos" in the panel, README data section + attribution, F4 / F5 / F6 flows re-checked.
  - **Edge-case review** after F7-E: five more fixes (Edge_F#7 Cases 1–5).
- **Done when (design doc §8) — met, verified by driving the real app with Playwright** (prep 17
  checks, F7-A 8, F7-B 45, F7-C 32, F7-D 28, F7-E 24, edge review 34; B–E and edge re-run on the final
  build, 163 checks):
  - 10 scenes, 404 frames, 18,538 boxes, 2,424 photos. The first ten frames of scene-0916 have boxes,
    per-camera 2D boxes, LiDAR points and predictions deep-equal to the pre-F7 files.
  - **Those ten frames: front camera 91 / 83 / 13 / 26, 60 photos 349 / 182 / 107 / 180, frame 6 in 3D
    28 / 16 / 17 — unchanged** (unit tests + on screen). All 404 frames: 6,726 / 5,292 / 3,514 / 5,278
    (P 65.7%, R 56.0%); day 5,711 / 8,916 (64%), night 1,015 / 3,102 (33%).
  - First screen needs 210 KB of data (compressed; was 594 KB + 60 photos). 4 points files and 24
    photos are fetched on opening, not 404 and 2,424. JS heap after visiting all ten scenes 53.8 MB
    (267 MB when everything was loaded at once in the design probe).
  - The 3D canvas is never re-created: frame, mode, scene (menu, ‹ ›, search result, scene row),
    practice toggle, playback, window size, a scene still loading, a scene that failed.
  - "person within 20 m ≥ 5" → 177 of 404 frames in 7 scenes; "model missed ≥ 15" → 135. The value in
    the list, the value in the panel and the number of coloured 3D boxes agree on an opened frame.
  - 41 frames fit the timeline row without scrolling at 1536 / 1440 / 1280 / 1024 px (cells 30 / 28 /
    24 / 18 px); no page scroll in the three modes; usable down to 390 px. COCO unchanged.
  - F4 (verdicts, reasons, note, persistence, export, practice), F5 (result list, outcome chips,
    explanations, slider) and F6 (thumbnails, automatic camera, `[` `]`) work in every scene.
  - Tests **695 → 861**. `tsc --noEmit` 0 errors. CI lint 0 errors (19 pre-existing warnings).
    Production build passes. Both data scripts run twice → identical files (329 of 329 for a scene).
- **Measurements (production build, 2026-11-27, medians of three):** first screen 0.97 s at 20 Mbps
  / 1.62 s at 9 Mbps; points drawn 1.34 / 2.01 s; all ten scenes' boxes 2.6 / 5.3 s. Playback over
  24 frames: points never late; photos 0 late frames at 20 Mbps, 11 at 9 Mbps (≤ 0.32 s). Search:
  preset click to next paint 105 ms, first model condition 198 ms. Slider step ≈ 1.4–1.5× pre-F7.
  3D idle cost on the shared 40-box frame equal to pre-F7 when measured alternately (GPU 57 vs 64
  ms/s, 42 draw calls, 60 fps); 156-box frame: GPU 60 fps / 159 ms/s, software 53 fps.
- **Changes from the plan, and why:**
  1. **A points file is self-contained** (it carries the frame's ego pose and the LiDAR calibration,
     ~300 bytes). The design left the alignment values in `frames.json`; putting them in the file
     keeps `Frame` free of dataset-specific poses and lets one pure function parse it.
  2. **Background scenes load two at a time, not one.** One slow file held up the six scenes behind it
     (Edge_F#7 Case 6).
  3. **`useDeferredValue` (decision 11) was replaced by a 250 ms settle delay.** Measured: the
     deferred scoring of all scenes still ran after every slider step and blocked the next paint (≈ 3×
     the pre-F7 step cost). Now it runs once when the slider rests (Case 8).
  4. **Preload: the 300 ms start delay is skipped during playback** and three photos load at a time.
     Measured: without this 18–19 of 24 frames showed before their photos had arrived (Case 7).
  5. **Review export is `review@2`:** every row names its scene, `frameIndex` counts within the scene,
     the file lists the scenes it covers. The design only said "the export holds every scene's
     records"; one global frame index would have been meaningless.
  6. **The export / reset menu counts all scenes' records** (edge review, Case 2).
  7. **Class filter across scenes:** a class that is switched on but absent from the new scene keeps
     its chip. Otherwise the filter hid boxes with nothing on screen to explain or undo it.
  8. **Explore with a model condition draws only the results the condition counts** (the missed
     labels, or the false alarms with no label nearby) and puts a count on each camera thumbnail. The
     design said "evaluation colours"; with all results drawn, the boxes that made the frame match
     could not be told apart, and nothing said which of the six photos to look at.
  9. **The scrubber is used for nuScenes only;** COCO keeps its ten thumbnails (the design did not
     say). Below 1024 px the scrubber stacks under its controls (Case 4).
  10. **`usePredictions` is gone:** predictions arrive with their scene (`loadScene`).
  11. **Decision 12 (merge the box lines above a threshold):** by the letter the threshold was
      exceeded on the 156-box frame (159 ms/s vs 150; software 53 fps). Not merged — the pre-F7 build
      itself measured 1.7× its recorded value that day, and alternating measurements show no F7
      regression. User decision; see Edge_F#7 "Measured and NOT changed".
  12. **The design doc was wrong on one fact:** §2.1 says the README had no nuScenes attribution. It
      had one (at the end); it was updated rather than added.
  13. `prep_nuscenes.py` now needs **Pillow** (already installed; nothing new was installed).
      Predictions total 3.22 MB, not the estimated 2.93 MB.
  14. **Edge review fixes:** an empty scene no longer replaces the scene on screen and the picker is
      reachable from the error state (Case 1); a points file must name the frame it is drawn on
      (Case 3); 390 px (Cases 4, 5).
- **Kept as designed:** all of mini, 960×540 WebP + 192×108 thumbnails, files in `public/`, search on
  the boxes in memory with the screen's own functions (no precomputed index), points stay JSON,
  scene / search state in page hooks (store untouched), Explore as a third mode, scrubber timeline,
  canvas kept on scene change (selection cleared, playback stopped, filters and mode kept, previous
  scene stays while the next loads), current scene scored at once, localStorage for reviews, YOLO on
  the original photos, only the F7-touched part of `page.tsx` extracted, short class names + grey
  default colour, day / night read from the scene description, a one-day cache header, no new library.
- **Portfolio wording (design doc §9, decided 2026-11-27):** option A — trends with their conditions.
  Day 64% vs night 33% is "observed", with "the night scenes are one drive" attached; the total is
  never called the model's performance; the cause is not claimed. The same limits are on screen.
- **Open / deferred:**
  - **Not deployed.** 152 MB of static files on Vercel is unverified (docs list no limit).
  - Merging the box lines into one geometry (decision 12) — follow-up if frame rate drops on a GPU.
  - At 9 Mbps photos lag playback on about half the frames (≤ 0.4 s). Entering Explore takes ~0.7 s.
  - What the ~1,380 "no label nearby" false alarms are is still unknown; Explore can now show them.
  - Evaluation-hardening candidates (per-drive table, distance-matched day / night, sample review of
    false alarms, labels for boxes cut by the camera plane, …): design doc §13. Not planned.
  - README beyond the data section is out of date (386 tests, nothing about F3–F6).
  - COCO mode: still on hold.
- **Edge refs:** Edge_F#7 Cases 1–9 + "Found, not caused by F7" + "Measured and NOT changed" + "Could
  not be verified".

<!-- KO (move to a localized file)
## F7 — 장면 탐색 ✅ 완료 (2026-11-27; 준비, F7-A ~ F7-E)
- 설계 문서: `docs/plan-feature/F7_scene_exploration.md`(2026-11-27 승인. 결정 1~3은 추천안: mini 전체, 960×540 WebP,
  저장소의 `public/`. 나머지 14개는 추천안으로 만들고 캡처를 보며 조정). 시안, 단계별 캡처, 엣지 캡처:
  `docs/plan-feature/assets/F7/`.
- 목표: 장면 하나의 프레임 10개에서 nuScenes-mini의 키프레임 전부로 늘리되 한꺼번에 받지 않고, 조건으로 장면과 프레임을 찾는다.
- 범위(만든 것):
  - 준비: `page.tsx`의 데이터 받는 부분을 순수 함수 `buildFrames`와 훅 `useDataset`으로 분리(화면 변화 없음).
  - F7-A 데이터(화면 변화 없음): 준비 스크립트가 장면 10개를 나눠 받을 수 있는 파일로 내보냄. 목차 `scenes.json`, 장면별
    `frames.json`(형식 1.3)과 `predictions.json`, 프레임별 점 파일, 줄인 사진 6장, 앞 카메라 썸네일. 예측 스크립트는 원본
    1600×900 사진으로 YOLOv8n을 돌림. **파일 3,253개, 152.49MB**(사진 98.33, 점 42.39, 박스 7.45, 예측 3.22, 썸네일 1.09).
    넣기 전에 용량을 말하고 사용자 확인을 받음.
  - F7-B 나눠 받기와 장면: `useScenes`(목차 → 지금 장면 → 나머지 장면의 박스를 뒤에서 2개씩), `useFramePoints`(프레임별 점,
    앞으로 3프레임, 최근 24개 보관), 사진 미리 받기에 한도(72장), 장면 고르기, 눈금 막대 타임라인, 장면을 바꿔도 같은
    캔버스에서 카메라만 다시 맞춤. 옛 파일(한 파일 데이터, 사진 60장, 예측) 삭제.
  - F7-C 검색: `lib/search`(조건, 결과, 정렬, 프리셋)와 세 번째 모드 Explore(조건 줄, 결과 목록, Search 패널, 조건에 든 박스만
    3D에서 색 유지, 타임라인에 맞는 프레임 표시, J / K로 장면을 넘어 결과 이동).
  - F7-D 평가와 만나기: `evaluateScenes`, 평가 패널의 "All scenes"(전체, 장면별 Recall, 낮/밤을 주행 수와 함께, 한계 문구),
    Explore의 모델 조건(놓친 정답, 헛짚음, 근처에 정답이 없는 헛짚음). 기본 규칙 고정, 조건이 세는 것만 사진에 그림, 썸네일에 개수.
  - F7-E 마무리: 배포용 빌드 측정, 짧은 클래스 이름, "모델은 원본 사진을 봤다" 표시, README 데이터 부분과 출처, F4 / F5 / F6 흐름 재확인.
  - 엣지 케이스 검증: 수정 5건 추가(Edge_F#7 Case 1~5).
- 완료 기준(설계 문서 8장): 충족. 실제 앱을 Playwright로 조작해 확인(준비 17항목, A 8, B 45, C 32, D 28, E 24, 엣지 34.
  마지막 빌드로 B~E와 엣지를 다시 돌림, 163항목).
  - 장면 10개, 프레임 404개, 박스 18,538개, 사진 2,424장. scene-0916의 앞 10프레임은 박스, 카메라별 2D 박스, LiDAR 점, 예측이
    F7 이전 파일과 완전히 같다.
  - **그 10프레임: 앞 카메라 91 / 83 / 13 / 26, 사진 60장 349 / 182 / 107 / 180, 프레임 6의 3D 색 28 / 16 / 17 그대로**(테스트와 화면).
    404프레임 전체 6,726 / 5,292 / 3,514 / 5,278(Precision 65.7%, Recall 56.0%). 낮 5,711 / 8,916(64%), 밤 1,015 / 3,102(33%).
  - 첫 화면에 필요한 데이터 210KB(압축. 이전에는 594KB + 사진 60장). 열 때 점 파일 4개와 사진 24장만 받는다. 장면 10개를 돌아본 뒤
    JS 힙 53.8MB(설계 조사에서 한꺼번에 넣었을 때 267MB).
  - 3D 캔버스는 다시 만들어지지 않는다: 프레임, 모드, 장면(목록, ‹ ›, 검색 결과, 장면 줄), 연습 모드, 재생, 창 크기, 받는 중인 장면,
    실패한 장면.
  - "보행자 20m 안 5명 이상" → 404개 중 177개 프레임, 장면 7곳. "모델이 15개 이상 놓침" → 135개. 연 프레임에서 목록의 값, 패널의 값,
    3D에서 색이 남은 박스 수가 같다.
  - 프레임 41개가 1536 / 1440 / 1280 / 1024px에서 타임라인 한 줄에 들어온다(칸 30 / 28 / 24 / 18px). 세 모드 모두 페이지 스크롤 없음.
    390px까지 쓸 수 있다. COCO는 그대로.
  - F4(판정·사유·메모·저장·내보내기·연습), F5(결과 목록, 종류 칩, 설명, 슬라이더), F6(썸네일, 자동 카메라, `[` `]`)이 모든 장면에서 동작.
  - 테스트 695 → 861개, tsc 오류 0개, CI 린트 오류 0개(기존 경고 19개), 배포용 빌드 성공, 두 스크립트 모두 두 번 돌려 같은 파일.
- 측정(배포용 빌드, 2026-11-27, 세 번의 가운데 값): 첫 화면 20Mbps 0.97초 / 9Mbps 1.62초. 점구름 1.34 / 2.01초. 장면 10개의 박스 정보
  2.6 / 5.3초. 재생 24프레임: 점은 늦지 않음, 사진은 20Mbps에서 늦은 프레임 0개, 9Mbps에서 11개(0.32초 이하). 검색: 프리셋을 누른 뒤
  다음 화면까지 105ms, 모델 조건 처음 198ms. 슬라이더 한 칸은 F7 이전의 약 1.4~1.5배. 3D 바닥 비용은 같은 프레임(박스 40개)을
  번갈아 재면 F7 이전과 같다(내장 GPU 57 대 64ms/초, 그리기 호출 42번, 60장). 박스 156개 프레임: 내장 GPU 60장 / 159ms/초, 소프트웨어 53장.
- 계획과 달라진 점과 이유:
  1. 점 파일이 혼자서 해석된다(프레임의 ego pose와 LiDAR 보정값을 함께 담음, 약 300바이트). 설계는 보정값을 `frames.json`에 두었다.
     `Frame`에 데이터셋 고유의 자세 값을 넣지 않아도 되고 순수 함수 하나로 해석된다.
  2. 뒤에서 받는 장면을 한 번에 1개가 아니라 2개씩 받는다. 느린 파일 하나가 뒤의 장면 6개를 막았다(Case 6).
  3. `useDeferredValue`(결정 11) 대신 0.25초 멈춤을 기다린다. 재 보니 전체 채점이 슬라이더 매 칸마다 시작돼 다음 화면을 막았다
     (F7 이전의 약 3배). 지금은 슬라이더가 멈췄을 때 한 번 한다(Case 8).
  4. 미리 받기: 재생 중에는 0.3초 대기를 건너뛰고 사진을 3장씩 받는다. 그대로 두면 24프레임 중 18~19프레임에서 사진이 늦었다(Case 7).
  5. 검수 기록 내보내기 형식이 `review@2`가 됐다: 줄마다 장면 이름, 프레임 번호는 장면 안에서의 순서, 파일이 담은 장면 목록.
     설계는 "모든 장면의 기록을 담는다"까지만 적었다. 전체에 걸친 프레임 번호 하나는 뜻이 없었다.
  6. 내보내기 / 지우기 메뉴가 모든 장면의 기록 수를 센다(엣지 검증, Case 2).
  7. 클래스 필터: 켜 둔 클래스가 새 장면에 없어도 그 칩은 남는다. 안 그러면 왜 박스가 숨었는지 화면에서 알 수 없다.
  8. Explore의 모델 조건에서는 조건이 세는 것(놓친 정답, 또는 근처에 정답이 없는 헛짚음)만 사진에 그리고, 카메라 썸네일마다 개수를
     붙인다. 설계는 "평가 색"이었다. 결과를 전부 그리면 그 프레임이 걸린 이유인 박스를 가릴 수 없었고, 6장 중 어느 사진을 볼지도
     알 수 없었다.
  9. 눈금 막대는 nuScenes에만 쓰고 COCO는 썸네일 10장 그대로다(설계에 없던 부분). 1024px 미만에서는 막대가 버튼 아래로 쌓인다(Case 4).
  10. `usePredictions`가 없어졌다. 예측은 장면과 함께 온다(`loadScene`).
  11. 결정 12(기준을 넘으면 박스 선을 하나로 합친다): 글자 그대로는 박스 156개 프레임에서 기준을 넘었다(159 대 150ms/초,
      소프트웨어 53장). 합치지 않았다. 그날 F7 이전 빌드도 기록의 1.7배로 재졌고, 번갈아 잰 비교에서 F7의 악화는 없었다.
      사용자 결정. Edge_F#7 "측정하고 바꾸지 않은 것".
  12. 설계 문서의 사실 하나가 틀렸다: 2.1절은 README에 nuScenes 출처 표시가 없다고 했지만 끝부분에 있었다. 새로 넣지 않고 고쳤다.
  13. 준비 스크립트가 Pillow를 쓴다(이미 설치돼 있어 새로 설치한 것은 없다). 예측 파일 합계는 추정 2.93MB가 아니라 3.22MB다.
  14. 엣지 검증 수정: 프레임이 없는 장면이 지금 화면을 밀어내지 않고, 오류 화면에서도 장면 고르기에 닿는다(Case 1). 점 파일은 자기
      프레임의 것이어야 한다(Case 3). 390px(Case 4, 5).
- 설계대로 유지: mini 전체, 960×540 WebP + 192×108 썸네일, `public/`, 메모리의 박스로 직접 검색(미리 계산한 요약 없음), 점은 JSON,
  장면·검색 상태는 page의 훅(store 그대로), 세 번째 모드 Explore, 눈금 막대, 장면을 바꿔도 캔버스 유지(선택 해제, 재생 정지,
  필터와 모드 유지, 다음 장면이 올 때까지 이전 장면 유지), 지금 장면은 바로 채점, 검수 기록은 localStorage, YOLO는 원본 사진,
  `page.tsx`는 F7이 건드리는 부분만 분리, 짧은 클래스 이름과 회색 기본색, 낮/밤은 장면 설명 글에서, 하루짜리 캐시 헤더, 새 라이브러리 없음.
- 포트폴리오 표기(설계 문서 9장, 2026-11-27 확정): 선택지 A(경향을 조건과 함께). 낮 64% 대 밤 33%는 "관찰됐다"로 쓰고 "밤 장면은 주행
  1회"를 붙인다. 전체 숫자를 모델 성능이라 부르지 않고 원인을 주장하지 않는다. 같은 한계가 화면에도 적혀 있다.
- 남은 것:
  - **배포하지 않았다.** Vercel에 정적 파일 152MB를 올려 본 적이 없다(문서에 한도가 없을 뿐이다).
  - 박스 선을 하나로 합치기(결정 12): GPU에서 프레임률이 떨어지면 할 일.
  - 9Mbps에서는 재생 중 절반쯤의 프레임에서 사진이 늦다(0.4초 이하). Explore에 들어가는 데 약 0.7초.
  - "근처에 정답이 없는 헛짚음" 약 1,380개가 무엇인지는 아직 모른다. 이제 Explore로 볼 수 있다.
  - 평가를 단단하게 만드는 후보(주행 단위 표, 거리를 맞춘 낮/밤 비교, 헛짚음 표본 검수, 카메라 평면에 걸친 박스의 정답 등)는
    설계 문서 13장에 있다. 계획된 것은 아니다.
  - README는 데이터 부분 말고는 오래됐다(테스트 386개, F3~F6 내용 없음).
  - COCO 모드: 계속 보류.
- Edge refs: Edge_F#7 Case 1~9, "F7이 만든 것이 아닌 것", "측정하고 바꾸지 않은 것", "확인하지 못한 것".
-->

## F7.5 — Evaluation you can trust ✅ Done (2026-11-27; F7.5-A … F7.5-F)
- **What this is:** not a new evaluation feature. F7 made the app score all of nuScenes-mini, and some
  of what it then showed could not be vouched for — above all 1,452 of the 3,514 false alarms (41 %)
  that have no label nearby: model mistakes, or real objects nuScenes did not label? "The limit is
  written down" is honest but does not make the result usable. F7.5 is "bundle A" of the re-check in
  `F7_scene_exploration.md` §13.1. The number 7.5 keeps "F8 = bird's-eye box editing" unchanged
  (as F6.5 did).
- **Design doc:** `docs/plan-feature/F7.5_trustworthy_evaluation.md` (approved 2026-11-27: decision 1 =
  start with a sample of 100, decision 2 = layout B, a report window; the other twelve built as
  recommended and adjusted from captures). Mockups, per-step captures, edge captures and the raw
  pass / fail output: `docs/plan-feature/assets/F7.5/` (`compare.html`, `steps.html`).
- **Goal:** make what the evaluation already shows trustworthy — without changing a scoring rule.
- **Scope (as built):**
  - **F7.5-A — logic** (no visual change): `lib/sampling` (seeded order and its first N, the 95 %
    interval of a share, verdict summary and "next unjudged", availability, wording, the export
    format `false-alarm-sample@1`); `lib/evaluation` (`listUnlabelledFalseAlarms` in a fixed order,
    `summarizeDrives`, `compareByDistance` + `distanceGap`, `describeWeights` /
    `describeModelConditions`, `cameraOfPredictionId`, `IOU_CHOICES`); `evaluateScenes` also returns
    the recall bands and the distinct scored objects of every scene and group; a third review scope
    `nuscenes-false-alarms`.
  - **F7.5-B — sample check:** "Sample check" in evaluate mode. A seeded random 100 of the 1,452 (the
    same boxes in the same order every time; 200 / 300 extend the same order), one box at a time: the
    scene, frame and camera of the box open and the photo zooms on it. `A` real object, label missing
    / `R` model wrong / `U` unclear (the F4 keys), auto-advance to the next unjudged box across scenes,
    `C`, `J` / `K`, export. Every result is worded as a sample: "41 of 100 sampled boxes → about
    32–50 % of all 1,452".
  - **F7.5-C — IoU choice + conditions line:** `Min overlap (IoU) [0.3 | 0.5]` next to the score
    slider (default 0.3, so no existing number moves); one line in the panel: `yolov8n · no
    fine-tuning · input 1280 · score ≥ 0.25 · IoU ≥ 0.3`.
  - **F7.5-D — report window:** "Report" in the top bar → laid over the list and the 3D view (canvas
    kept), Esc closes: conditions first, totals with "654 distinct objects in 8 drives", the
    unchecked false alarms / the sample's estimate, recall per drive (8 rows), day vs night at the
    same distance (10 rows, "night = 1 drive", how much of the gap the distance mix accounts for).
  - **F7.5-E — README:** a "카메라 탐지 평가 결과" section (conditions, totals at both IoUs, the drive
    table, day / night incl. per class and per band, the sample check's method, ten limits, the
    relation to the official nuScenes evaluation) and the stale parts (tests 386 → 989, single camera
    / single scene, structure, future work). A résumé one-liner was drafted for the user (three
    options; the user decides).
  - **F7.5-F — edge review** (run before fixing; two real problems, Edge_F#7.5 Cases 1–2, and a third —
    the report title cut at 390 px — found by eye in an edge capture), then these documents.
- **Done when (design doc §8) — met, verified by driving the real app with Playwright on the final
  production build** (B 135, C 74, D 51, edge 48, floor cost 5, and 30 regression checks of the F4–F7
  flows = 343 checks; 362 after the follow-up of change 14, which added 19):
  - Every number locked before F7.5 is unchanged: scene-0916 first ten frames 91 / 83 / 13 / 26 (front)
    and 349 / 182 / 107 / 180 (60 photos), frame 6 in 3D 28 / 16 / 17, all 404 frames 6,726 / 5,292 /
    3,514 / 5,278, "person within 20 m ≥ 5" 177 frames in 7 scenes, "model missed ≥ 15" 135.
  - Newly locked by tests on the shipped files: the population is 1,452 boxes and is the SAME set at
    IoU 0.3 and 0.5 (and equals Explore's "unlabelled" count); IoU 0.5 → 5,462 / 6,556 / 5,231 /
    5,278, P 51.1 % / R 45.4 %, day 4,659 / 8,916, night 803 / 3,102 — the values the F7 probe
    reported; 654 distinct scored objects (483 day, 171 night); the eight drive rows; the ten distance
    rows; night recall re-weighted to the day distance mix 33.9 % (plain 32.7 %); the first five boxes
    of the sample.
  - The sample is the same after a reload, another slider position or another IoU choice; verdicts
    survive a reload and never appear in the label review, its progress or the `review@2` export.
  - With IoU 0.5 chosen, Explore still finds 135 / 177 frames.
  - The 3D canvas is never re-created: entering / leaving the sample check, stepping across scenes,
    changing the IoU, opening / closing the report.
  - Text is checked BY POSITION at 1536×700, 1440×900, 1280×720, 1024×768 (and 390×844, 1536×640,
    1024×640 in the edge review): nothing cut (`scrollWidth ≤ clientWidth`), nothing outside its
    panel, the verdict buttons, the estimate sentence and the scene's precision / recall visible
    without scrolling, bars one line, no page scroll.
  - 3D floor cost unchanged: the 40-box frame draws in 41 calls (1440×900) / 42 (1536×700), also in
    evaluate mode and with the report open.
  - The F4–F7 flows that share code F7.5 touched still work (30 checks written for this, since the
    F7 scripts did not survive the session change): label verdicts / reasons / note / N / export
    (`review@2`, no sample records) / reload, `]` and the automatic camera, practice blocking
    evaluate, the outcome chip, a false-alarm selection, the score slider and Reset, "Crowded" 177,
    opening a hit in another scene (lands on its frame, selects nothing), K, the scene picker, COCO.
  - Tests **861 → 989**. `tsc --noEmit` 0 errors. CI lint 0 errors (19 pre-existing warnings).
    Production build passes.
- **Measurements (production build, software GL, 2026-11-27, ONE run each — indicative):** open the
  report 94 ms; enter the sample check (score all scenes, draw the sample, open box 1 in another scene)
  139 ms; verdict → next box in another scene 41 ms, in the same scene 24 ms.
- **Changes from the plan, and why:**
  1. **The photo follows a model box through `useActiveCamera(…, preferred)` + `cameraOfPredictionId`,
     not through `lib/cameras/pick.ts`** as the design listed. `lib/evaluation` already imports
     `lib/cameras`; the reverse import would be a cycle.
  2. **`match.ts` was touched in one word:** `NEAREST_MIN_IOU` is exported (it is the definition of "no
     label nearby", which the export states). Its value and use are unchanged; the design said the
     file would not be touched.
  3. **Verdict captions are `Real object` / `Model wrong` / `Unclear`** (full names in tooltips and the
     status line). The first captions ("Real · label missing") were cut at every width — the step
     script passed, the capture showed it. The script then got a check for truncated text.
  4. **The report has three columns only from 1536 px** (design: 1400), two from 1280, one below; a
     drive row is two lines (date / place); on a phone the tables scroll sideways inside their block.
     The place names ("singapore-hollandvillage") did not fit the planned single-line cell.
  5. **Entry points** (the design did not place them): "Sample check" in the filter bar and in the
     report; "Report" in the top bar and as a link under the panel's "All scenes".
  6. **Cost of the IoU control and the entry button: the class chips have less room** — 368 px at
     1024 px (measured; about 570 before, computed). Below 1280 px the captions shorten ("IoU",
     "Sample"), the notes show from 1440 px, and the 0.5 note is "benchmark value" (the long
     explanation is in the tooltip and the panel).
  7. **A verdict is accepted only after its box has been on screen for 400 ms** (not in the design).
     Edge review: "A" then "R" with no pause judged the second box unseen (Edge_F#7.5 Case 1).
  8. **J / K with no sampled box selected resume at the first box without a verdict** (was: box 1).
  9. **The sample-check handlers moved to `useSampleCheckController`** after the first cut put ~330
     lines into `page.tsx` against the design's own rule; the user approved the move. `page.tsx` is
     2,132 lines (1,904 before F7.5): the hook call, the mode flags and the slot wiring remain.
     "Open a frame and select something in it" is the one `handleOpenHit` for search hits and sampled
     boxes.
  10. **The distance sentence subtracts the PRINTED percentages** ("1.2 of the 31.4 points"): the
      unrounded difference is 31.3, which a reader subtracting 64.1 − 32.7 would see as an error.
  11. **The panel header now says what was scored** ("6 cameras · 246 photos"); how it was scored is
      the conditions line.
  12. **One existing test changed its expectation:** "the review store starts with two empty scopes"
      → three.
  13. **The README states the sample check's method but not its result** — the user had not judged
      the sample when the feature closed; the line says so.
  14. **(After the feature was pushed — found by the user on first real use.) Looking at another
      camera no longer loses the box.** A thumbnail click deselected the sampled box (the F6 rule "a
      prediction id is dropped when another camera's photo is shown") and it did not come back: no
      yellow box, ZOOM identical to FULL. Now, in the sample check, the box stays selected while
      another camera OF ITS OWN FRAME is on screen; the panel says "Showing FR — the box is in the F
      photo" with a "Show the box" button; the box's thumbnail carries the marker; its row in the
      list always returns to its photo. Another frame still deselects. None of the 313 + 30 checks
      had clicked a thumbnail during the sample check (Edge_F#7.5 Case 5).
  15. **(After the feature was pushed.) The user judged the sample, so change 13 no longer holds.**
      All 100 boxes, one reviewer, 2026-11-27: real object without a label 83, model wrong 5,
      unclear 12 → "real objects without a label" estimated at about 75–89 % of the 1,452 (model
      wrong about 2–11 %). The exported file is kept at
      `docs/evaluation/false-alarm-sample_20261127-1018.json` (47 KB); it was checked against the
      shipped sample (same 100 boxes in the same order, summary = sum of its items). The README
      carries the result with its conditions and one reading limit found while writing it: "no
      label" means no label of THIS project's ground truth (projected 3D boxes) in that photo —
      whether nuScenes has no annotation or the projection dropped it was not separated. Precision
      is not recomputed. Of the 83, 62 are boxes under 50 px high (of 900).
  16. **(Decision, 2026-11-27.) The UI stays English.** The user considered a Korean UI or a
      language toggle before recording GIFs and settled on English (HANDOFF 3.6).
- **Kept as designed:** simple random sample from a fixed order with a fixed seed; population at the
  FIXED default rules (never the slider's); the F4 keys and the review store (third scope); a separate
  export format (`review@2` untouched); estimates always with sample size and range, all three
  verdicts over the same denominator, no "≈ N boxes" conversion; a state of evaluate mode, not a
  fourth mode; judging on the shipped 960×540 photos; two IoU values, not a slider; "objects" =
  distinct objects with a scored label; bands need ≥ 50 labels in both groups; "no fine-tuning" read
  from the weights file name and claimed only for a known release; no re-scoring from the verdicts;
  no new library; `viewer-store`, `lib/search`, the data files and both scripts untouched.
- **Open / deferred:**
  - **The sample has not been judged** (the user does it; whether the result goes into the README is
    the user's decision). Verdicts live in the browser of the port they were given on — export them.
  - **Vercel deployment still unverified** (carried from F7; the user reported no status).
  - The evaluation panel's "… model boxes matched a la…" line is cut at 1024 px — present before F7.5
    (`truncate` at a 360 px panel), reported, not changed.
  - The official nuScenes evaluation removes rack bikes from BOTH labels and predictions; this tool
    removes predictions only (Edge_F#7.5 "Found, not caused by F7.5"). A scoring rule — not changed.
  - No "clear all sample verdicts" control and no import of an exported file.
  - The README's eight animated captures at the top show the pre-F3 screen; Lighthouse was not
    re-measured.
  - Bundles B and C of `F7_scene_exploration.md` §13.1 (PR curve / AP, confusion matrix, rule changes,
    2D drawing, prediction upload; night scenes from other drives, 3D predictions) — not started.
  - COCO mode: still on hold.
- **Edge refs:** Edge_F#7.5 Cases 1–4 + "Checked, no change needed" + "Found, not caused by F7.5" +
  "Could not be verified".

<!-- KO (move to a localized file)
## F7.5 — 평가 결과를 믿을 수 있게 ✅ 완료 (2026-11-27; F7.5-A ~ F7.5-F)
- 무엇인가: 새 평가 기능이 아니다. F7로 nuScenes-mini 전체를 채점하게 됐는데, 화면이 보여 주는 결과 중 맞는지 모르는 것이
  있었다. 가장 큰 것이 헛짚음 3,514개 중 "근처에 정답이 없는" 1,452개(41%)다: 모델이 틀린 것인지, nuScenes에 정답이 빠진
  실제 물체인지. "한계를 적어 두었다"는 정직하지만 결과를 쓸 수 있게 하지는 않는다. F7.5는 `F7_scene_exploration.md`
  13.1의 "묶음 가"다. 번호 7.5는 "F8 = 위에서 본 화면에서 3D 박스 수정"을 그대로 두기 위한 것이다(F6.5의 전례).
- 설계 문서: `docs/plan-feature/F7.5_trustworthy_evaluation.md`(2026-11-27 승인. 결정 1 = 표본 100개로 시작, 결정 2 = 배치
  B(보고서 창), 나머지 12개는 추천안으로 만들고 캡처를 보며 조정). 시안, 단계별 캡처, 엣지 캡처, 통과/실패 출력 원문:
  `docs/plan-feature/assets/F7.5/`.
- 목표: 평가가 이미 보여 주는 결과를 믿을 수 있게 한다. 채점 규칙은 바꾸지 않는다.
- 범위(만든 것):
  - F7.5-A 로직(화면 변화 없음): `lib/sampling`(고정 시드로 섞은 순서와 그 앞 N개, 비율의 95% 범위, 판정 요약과 "다음
    미판정", 표본을 만들 수 있는지, 문구, 내보내기 형식 `false-alarm-sample@1`), `lib/evaluation`(고정된 순서의
    `listUnlabelledFalseAlarms`, `summarizeDrives`, `compareByDistance` + `distanceGap`, `describeWeights` /
    `describeModelConditions`, `cameraOfPredictionId`, `IOU_CHOICES`). `evaluateScenes`가 장면과 무리마다 거리 구간과
    채점된 서로 다른 물체도 준다. 검수 기록의 세 번째 구역 `nuscenes-false-alarms`.
  - F7.5-B 표본 검수: 평가 모드의 "Sample check". 1,452개 중 고정 시드로 뽑은 100개(다시 열어도 같은 박스, 같은 순서.
    200 / 300은 같은 순서를 이어 쓴다)를 한 장씩: 그 박스의 장면, 프레임, 카메라가 열리고 사진이 그 박스로 확대된다.
    `A` 진짜 물체인데 정답 빠짐 / `R` 모델이 틀림 / `U` 애매함(F4의 키), 장면을 넘어 다음 미판정 박스로 자동 이동, `C`,
    `J` / `K`, 내보내기. 결과는 항상 표본으로 쓴다: "41 of 100 sampled boxes → about 32–50% of all 1,452".
  - F7.5-C IoU 고르기와 조건 한 줄: 점수 슬라이더 옆 `Min overlap (IoU) [0.3 | 0.5]`(기본 0.3이라 기존 숫자는 그대로),
    패널의 한 줄 `yolov8n · no fine-tuning · input 1280 · score ≥ 0.25 · IoU ≥ 0.3`.
  - F7.5-D 보고서 창: 맨 위 줄의 "Report" → 목록과 3D 화면 위에 뜬다(캔버스 유지), Esc로 닫는다. 조건이 먼저, 전체 숫자와
    "서로 다른 물체 654개, 주행 8번", 확인되지 않은 헛짚음 / 표본의 추정, 주행별 Recall 8줄, 같은 거리끼리의 낮/밤 10줄
    ("night = 1 drive", 차이 중 거리 분포가 설명하는 몫).
  - F7.5-E README: "카메라 탐지 평가 결과" 절(조건, 두 IoU의 전체 숫자, 주행 표, 낮/밤(클래스별, 구간별 포함), 표본 검수
    방법, 한계 10가지, nuScenes 공식 평가와의 관계)과 낡은 부분(테스트 386 → 989, 단일 카메라 / 단일 장면, 구조, 향후
    방향). 이력서 한 줄 초안 3개를 사용자에게 보였다(정하는 것은 사용자).
  - F7.5-F 엣지 검증(고치기 전에 먼저 돌림. 진짜 문제 2건, Edge_F#7.5 Case 1~2. 그리고 엣지 캡처를 눈으로 보다 찾은 세 번째:
    390px에서 보고서 제목이 잘림), 그리고 이 문서들.
- 완료 기준(설계 문서 8장): 충족. 마지막 배포용 빌드에서 실제 앱을 조작해 확인(B 135, C 74, D 51, 엣지 48, 바닥 비용 5
  = 313항목, 그리고 F4~F7의 기존 흐름 확인 30항목 = 343항목. 달라진 점 14의 수정 뒤에는 19항목이 늘어 362항목).
  - F7.5 전에 잠긴 숫자는 모두 그대로다: scene-0916 첫 10프레임 91 / 83 / 13 / 26(앞), 349 / 182 / 107 / 180(60장),
    6번 프레임 3D 28 / 16 / 17, 전체 404프레임 6,726 / 5,292 / 3,514 / 5,278, 검색 177프레임(장면 7개) / 135프레임.
  - 새로 잠근 것(실제 파일로 계산): 모집단 1,452개이고 IoU 0.3과 0.5에서 같은 박스들이다(Explore의 "unlabelled" 수와도
    같다). IoU 0.5 → 5,462 / 6,556 / 5,231 / 5,278, Precision 51.1% / Recall 45.4%, 낮 4,659 / 8,916, 밤 803 / 3,102
    (F7 때 조사한 값). 채점된 서로 다른 물체 654개(낮 483, 밤 171). 주행 8줄. 거리 구간 10줄. 거리 분포를 낮에 맞춘 밤
    Recall 33.9%(그대로는 32.7%). 표본의 첫 다섯 박스.
  - 표본은 새로 고쳐도, 슬라이더를 옮겨도, IoU를 바꿔도 같다. 판정은 새로 고쳐도 남고, 정답 박스 검수와 그 진행률,
    `review@2` 내보내기에는 나타나지 않는다.
  - IoU 0.5를 고른 채로도 Explore는 135 / 177프레임을 찾는다.
  - 3D 캔버스는 다시 만들어지지 않는다: 표본 검수 여닫기, 장면을 넘는 넘김, IoU 바꾸기, 보고서 여닫기.
  - 글자는 위치로 확인했다(1536×700, 1440×900, 1280×720, 1024×768. 엣지 검증에서 390×844, 1536×640, 1024×640): 잘린
    글자 없음(`scrollWidth ≤ clientWidth`), 패널 밖으로 나간 것 없음, 판정 버튼과 추정 문장과 이 장면의 Precision /
    Recall이 스크롤 없이 보임, 줄들이 한 줄, 페이지 스크롤 없음.
  - 3D 바닥 비용 그대로: 박스 40개 프레임의 그리기 호출 41번(1440×900) / 42번(1536×700). 평가 모드와 보고서를 연
    상태에서도 같다.
  - F7.5가 건드린 코드를 함께 쓰는 F4~F7의 흐름이 그대로다(이번에 새로 만든 30항목. F7 때의 스크립트는 세션이 바뀌며 남아
    있지 않았다): 정답 박스 판정 / 사유 / 메모 / N / 내보내기(`review@2`, 표본 기록 없음) / 새로 고침, `]`와 자동 카메라,
    연습 중 평가 막힘, 결과 칩, 헛짚음 선택, 점수 슬라이더와 Reset, "Crowded" 177, 다른 장면의 검색 결과 열기(그 프레임으로
    가고 아무것도 선택하지 않음), K, 장면 고르기, COCO.
  - 테스트 861 → 989. `tsc --noEmit` 오류 0. CI 린트 오류 0(기존 경고 19개). 배포용 빌드 성공.
- 측정(배포용 빌드, 소프트웨어 렌더링, 2026-11-27, 각각 한 번씩 잰 참고값): 보고서 열기 94ms, 표본 검수 들어가기(전체
  장면 채점, 표본 뽑기, 다른 장면의 1번 박스 열기) 139ms, 판정 → 다른 장면의 다음 박스 41ms, 같은 장면 24ms.
- 계획과 달라진 점과 이유:
  1. 사진이 모델 박스의 카메라를 따라가게 하는 것을 `lib/cameras/pick.ts`가 아니라 `useActiveCamera(…, preferred)` +
     `cameraOfPredictionId`로 했다. `lib/evaluation`이 이미 `lib/cameras`를 불러오고 있어 반대 방향은 순환이 된다.
  2. `match.ts`를 한 단어 건드렸다: `NEAREST_MIN_IOU`를 export 했다("근처에 정답 없음"의 정의이고 내보내기 파일이 그 값을
     적는다). 값과 쓰임은 그대로다. 설계는 이 파일을 건드리지 않는다고 했다.
  3. 판정 버튼 이름을 `Real object` / `Model wrong` / `Unclear`로 줄였다(풀어 쓴 이름은 툴팁과 상태 줄에). 처음 이름은
     모든 폭에서 잘렸다. 단계 스크립트는 통과했고 캡처를 눈으로 보다 찾았다. 그 뒤 스크립트에 잘린 글자 검사를 더했다.
  4. 보고서의 세 칸 배치는 1536px부터다(설계는 1400). 1280부터 두 칸, 그 아래 한 칸. 주행 표의 한 줄은 두 줄 높이(날짜 /
     장소)이고, 휴대폰에서는 표가 그 칸 안에서 옆으로 스크롤된다. 장소 이름이 계획한 한 줄 칸에 들어가지 않았다.
  5. 들어가는 자리(설계가 정하지 않았다): "Sample check"는 위쪽 줄과 보고서에, "Report"는 맨 위 줄과 패널의 "All
     scenes" 아래 링크에.
  6. IoU 버튼과 들어가는 버튼의 대가: 클래스 칩의 자리가 줄었다. 1024px에서 368px(잰 값. 그 전은 약 570px, 계산값).
     1280px 아래에서는 이름을 줄이고("IoU", "Sample"), 설명 글은 1440px부터 보이며, 0.5의 설명은 "benchmark value"다.
  7. 판정은 그 박스가 화면에 400ms 있은 뒤에만 받는다(설계에 없던 것). 엣지 검증: "A" 다음 바로 "R"을 누르면 두 번째
     박스가 보이기도 전에 판정됐다(Edge_F#7.5 Case 1).
  8. 표본의 박스가 선택돼 있지 않을 때 J / K는 판정이 없는 첫 박스로 간다(전에는 1번).
  9. 표본 검수의 핸들러를 `useSampleCheckController`로 옮겼다. 처음에는 약 330줄이 `page.tsx`에 들어가 설계 문서의
     규칙을 어겼고, 사용자가 옮기는 것을 승인했다. `page.tsx`는 2,132줄(F7.5 전 1,904줄)이다. "프레임을 열고 그 안의 것을
     선택"은 검색 결과와 표본의 박스가 `handleOpenHit` 하나를 쓴다.
  10. 거리 문장은 화면에 찍힌 퍼센트끼리 뺀다("31.4점 중 1.2점"). 반올림 전의 차이는 31.3이라, 64.1 − 32.7을 해 본
      사람에게는 틀린 숫자로 보인다.
  11. 패널 제목 옆은 무엇을 채점했는지("6 cameras · 246 photos")를 말한다. 어떻게 채점했는지는 조건 한 줄이다.
  12. 기존 테스트 한 곳의 기대값이 바뀌었다: "검수 저장소는 빈 구역 2개로 시작" → 3개.
  13. README에는 표본 검수의 방법만 있고 결과는 없다. 기능을 마칠 때까지 사용자가 표본을 판정하지 않았다(그렇게 적었다).
  14. (push한 뒤, 사용자가 처음 실제로 써 보다 찾음) 다른 카메라를 봐도 박스가 풀리지 않는다. 전에는 썸네일을 누르면 표본의
      박스 선택이 풀렸고(F6의 규칙 "다른 카메라의 사진이 나오면 예측 ID를 버린다") 돌아와도 살아나지 않았다: 노란 박스가 없고
      ZOOM이 FULL과 같았다. 이제 표본 검수에서는 **그 박스의 프레임을 다른 카메라로 보는 동안** 선택이 유지되고, 패널이
      "Showing FR — the box is in the F photo"와 "Show the box" 버튼을 보이며, 그 박스의 썸네일에 표시가 붙고, 목록의 줄을
      누르면 항상 그 사진으로 돌아간다. 다른 프레임으로 가면 여전히 풀린다. 확인 343항목 중 표본 검수에서 썸네일을 눌러 본
      것이 하나도 없었다(Edge_F#7.5 Case 5).
  15. (push한 뒤) 사용자가 표본을 판정했다. 그래서 달라진 점 13은 이제 맞지 않는다. 100개 전부, 검수자 1명, 2026-11-27:
      정답 없는 실제 물체 83, 모델이 틀림 5, 애매함 12 → "정답 없는 실제 물체"는 1,452개의 약 75~89%로 추정(모델이 틀림은
      약 2~11%). 내보낸 파일은 `docs/evaluation/false-alarm-sample_20261127-1018.json`(47KB)에 두었고, 프로젝트가 뽑는
      표본과 대조했다(같은 100개, 같은 순서, 요약 = 항목의 합). README에 조건과 함께 실었고, 쓰면서 찾은 읽는 법의 한계
      하나도 적었다: "정답이 없다"는 이 프로젝트의 정답(3D 박스의 투영)이 그 사진에 없다는 뜻이고, nuScenes에 라벨이 없는
      것인지 투영에서 빠진 것인지는 가리지 않았다. Precision은 고쳐 계산하지 않는다. 83개 중 62개는 높이 50px 미만(900 중)이다.
  16. (결정, 2026-11-27) 화면은 영어로 둔다. 사용자가 GIF를 찍기 전에 한글 화면과 한/영 전환을 검토하고 영어로 확정했다
      (HANDOFF 3.6).
- 설계대로 둔 것: 고정된 순서에서 고정 시드로 뽑는 단순 무작위 표본, 모집단은 고정 규칙(슬라이더의 값이 아님), F4의 키와
  검수 저장소(세 번째 구역), 별도의 내보내기 형식(`review@2`는 그대로), 추정에는 항상 표본 크기와 범위, 세 판정의 분모는
  같음, "약 N개"로 환산하지 않음, 평가 모드 안의 상태(네 번째 모드 아님), 실린 960×540 사진으로 판정, IoU는 두 값
  (슬라이더 아님), "물체 수"는 채점된 서로 다른 물체, 구간은 두 무리 모두 정답 50개 이상, "추가 학습 없음"은 가중치 파일
  이름으로 읽고 알려진 배포 파일일 때만 말함, 판정 결과로 다시 채점하지 않음, 새 라이브러리 없음, `viewer-store`와
  `lib/search`와 데이터 파일과 스크립트 두 개는 건드리지 않음.
- 남은 것 / 미룬 것:
  - 표본은 아직 판정하지 않았다(사용자가 한다. README에 넣을지도 사용자가 정한다). 판정은 그 포트의 브라우저에만 있다.
    내보내 둘 것.
  - Vercel 배포는 여전히 확인하지 못했다(F7에서 넘어온 것. 사용자가 결과를 알려 주지 않았다).
  - 평가 패널의 "… model boxes matched a la…" 줄이 1024px에서 잘린다. F7.5 전부터 있던 것(360px 패널의 말줄임)이라 알리고
    고치지 않았다.
  - nuScenes 공식 평가는 거치대 안의 자전거를 정답과 예측 양쪽에서 뺀다. 이 도구는 예측만 뺀다(Edge_F#7.5). 채점 규칙이라
    바꾸지 않았다.
  - "표본 판정 모두 지우기"와 내보낸 파일 다시 불러오기는 없다.
  - README 맨 위의 움직이는 그림 8장은 F3 전의 화면이다. Lighthouse는 다시 재지 않았다.
  - `F7_scene_exploration.md` 13.1의 묶음 나, 묶음 다는 시작하지 않았다.
  - COCO 모드: 계속 보류.
- Edge refs: Edge_F#7.5 Case 1~4, "확인했고 바꿀 것이 없던 것", "F7.5가 만든 것이 아닌 것", "확인하지 못한 것".
-->

## Roadmap — F3+ direction (agreed 2026-11-25) 🧭 Direction only, nothing planned yet

> **Status:** direction agreed in discussion. **No feature below is planned or approved for
> implementation.** Each one needs its own `/plan-feature` pass (Immutable Rule #4), which replaces
> its row here with a full per-feature entry (Goal / Scope / Done when / Tests / Decisions / Edge
> refs). Feature numbers are **provisional** — per "How this doc works", a feature gets its number
> when it is *started*, and any item may still be reordered or dropped.
>
> **Design docs:** the pre-implementation design for each feature is written in
> `docs/plan-feature/F#_*.md` (index: `docs/plan-feature/README.md`), one doc per feature, written
> just before that feature starts. **F3 is done** (2026-11-25, see the F3 entry above; design doc
> `F3_workspace_layout.md`). **F4 is done** (2026-11-25, see the F4 entry above; design doc
> `F4_box_review.md`). **F5 is done** (2026-11-26, `F5_camera_detection_eval.md`). **F6 is done**
> (2026-11-26, see the F6 entry above; design doc `F6_six_cameras.md`). **The three.js idle-cost item
> is done** (2026-11-26, its own session, see the F6.5 entry above; no design doc). **F7 is done**
> (2026-11-27, see the F7 entry above; design doc `F7_scene_exploration.md`). **F7.5 is done**
> (2026-11-27, "evaluation you can trust" — see the F7.5 entry above; design doc
> `F7.5_trustworthy_evaluation.md`). Next: F8 — its design doc is written at the start of the F8
> session.
> Each large feature runs in its own session — **start from `docs/plan-feature/HANDOFF.md`**.

### Why change direction (the gap this closes)
- **The app is a read-only viewer.** A user can explore, filter and click, but leaves with no
  output and no decision made. Real AI-data tools exist to support one job (review labels, find
  model errors, curate data).
- **The page is laid out like a document, not a tool.** Rendered check (Playwright, 1440×900,
  2026-11-25): content is capped at `max-w-screen-xl`, and ObjectList + Analytics sit below the
  fold, so "click in the list → look at the 3D view" needs page scrolling.
- **Career target.** The project started from an autonomous-driving data-visualization frontend
  posting (`PROJECT_DESIGN.md` §1: AI data platform, multimodal data, 3D visualization, annotation,
  data-exploration UI). The strongest existing work against that list is F2 (measured 3D, LiDAR,
  coordinate frames), so the roadmap builds on nuScenes rather than on generic 2D (COCO) labeling.

### Identity after the roadmap
**A perception data quality tool**, nuScenes-centred. The 3D view stays the main view and the
camera image stays the supporting verification view (Immutable Rule #5).

| Pillar | Question it answers | Feature |
|---|---|---|
| Label quality | Is the human-made ground truth right? | 3D box review |
| Model quality | Does the model find what the ground truth says is there — and where/why not? | Camera detection evaluation |

The two pillars share one dataset and feed each other: fixing a wrong label makes the evaluation
more accurate; scenes where the model fails are the first place to suspect the labels.

### Sequence (provisional)

| # | Feature | What the user can do when it lands |
|---|---|---|
| F3 | No-scroll workspace layout | Work in a full-viewport, fixed-pane layout: list, 3D view and camera view visible together |
| F4 | 3D box review | Approve / reject each measured 3D box (checked against its projection on the camera image), record a reason, resume later, export the result |
| F5 | Camera detection evaluation | See TP / FP / FN for a 2D detector run on the nuScenes camera images, locate a missed object in the 3D view, read recall by distance |
| F6 | Six cameras | Review and evaluate around the whole vehicle; find which camera sees a given 3D box |
| F7 | Scene exploration | Search across many more keyframes by condition, including "scenes where the model missed something" |
| F8 (stretch) | 3D box editing in a bird's-eye view | Correct a rejected box (position / size / yaw as a rotated rectangle; height as a number) with undo/redo |

Order rationale: the layout (F3) is the surface every later feature sits on; review (F4) and
evaluation (F5) are the two pillars; F6/F7 widen the data both pillars run on; editing (F8) is the
hardest interaction and goes last.

**Tech upgrades are trigger-based, not features of their own** — measure first, change only when the
measurement justifies it, and record before/after numbers: Server Component data loading (F3
considered and deferred it — design doc decision 6: measure load time first, as a separate item); `useTransition` / `useDeferredValue` (only if
filtering measurably janks after F5); binary point clouds + lazy per-frame loading + Web Worker
parsing (becomes necessary in F7 when the frame count grows).
**F7 (2026-11-27):** lazy per-frame loading is done (points and photos per frame, scenes one by
one). Binary point clouds and Web Worker parsing were measured and NOT done: a points file is
120 KB of JSON (48 KB compressed) and parses in 0.7 ms (one frame, 5,991 points — design doc F7
§2.4); all ten scenes' boxes and predictions are 1.87 MB compressed and in memory after 2.6 s at
20 Mbps. `useDeferredValue` was tried for the all-scenes evaluation and replaced by a settle delay
(Edge_F#7 Case 8).

### Questions each plan must settle (carry into `/plan-feature`)
- **F3:** pane zones and sizes; mobile behaviour (tool layout is desktop-first — keep the stacked
  layout on narrow screens?); fix the defects found in the 2026-11-25 render (2D/3D pane height and
  frame mismatch; header says "40 detections" while ObjectList says 13 with no on-screen reason;
  unreadable hash ids in ObjectList; oversized histogram axis text; Korean hint box in an English UI).
- **F4:** shape of the review state and where it lives; persistence with no backend (IndexedDB?);
  reject-reason vocabulary; keyboard shortcuts; export format.
- **F5:**
  - **Prediction ids vs Immutable Rule #1.** A model prediction is a 2D-only object with no 3D
    counterpart and is a *different* object from the ground-truth box it matches. It needs its own
    id scheme that cannot collide with the `instance`-derived ids.
  - **How the ground-truth 2D box is derived.** nuScenes has no hand-drawn 2D boxes. Projecting the
    8 corners of a 3D box gives a loose rectangle (lower IoU across the board); tightening it with
    the LiDAR points inside the box helps but degrades for distant objects with few points.
  - **Matching rule** (IoU threshold and/or centre distance) given those loose boxes.
  - **Occlusion.** Fully hidden objects are still annotated; carry nuScenes `visibility` through the
    prep script and filter on it.
  - **Class mapping** between the detector's classes and nuScenes categories; classes the detector
    cannot output are excluded from the evaluation.
  - **Confidence returns on nuScenes frames.** Predictions carry a real score, so the confidence
    slider becomes meaningful again and must re-evaluate live at the selector level. This collides
    with F2-E, where `frameHasConfidence` is keyed on `Frame.source` (per frame): provenance now
    differs *per detection* within one frame.
  - **Honest labelling.** Derived ground-truth 2D boxes are approximations and must be presented as
    such — same spirit as Rule #6.
  - **Pipeline.** The detector runs offline in `scripts/` (as in Step 11); IoU and matching are pure
    functions in `lib/` with Vitest (Rule #3). No runtime backend.
- **F6:** data size with six images per keyframe; per-box "which camera sees it" lookup. *(Settled
  in F6: 60 photos = 8.04 MB, all preloaded for ten frames; `lib/cameras`.)*
- **F7:** how many of nuScenes-mini's keyframes (10 scenes, ~400 keyframes vs the 10 used today) to
  ship; searching on scene descriptions and per-frame counts with no backend; hosting size limits on
  Vercel; the binary / lazy-loading work above. *(Settled in F7: all 10 scenes / 404 keyframes,
  152 MB in `public/` as split files; search runs on the boxes in memory with pure functions.
  The Vercel deployment itself is still unverified.)*
- **F8:** rotated-rectangle editing interaction; undo/redo history model.

### Known limits (state them wherever results are shown)
- **Small sample.** With 10 keyframes × 1 camera, recall-by-distance has only a few boxes per
  distance bin. F5 proves the analysis works; the numbers become quotable only after F6/F7.
  **After F6 (2026-11-26):** six cameras give 531 scored labels in 60 photos and bands from 0 to
  70 m — but still ONE scene and ten moments. More photos of the same moments are not more
  evidence; quotable numbers need F7's additional scenes.
  **After F7 (2026-11-27):** 10 scenes, 404 moments, 2,424 photos, 12,018 scored labels. The numbers
  may now be quoted **as observations with their conditions** (wording rules: design doc F7 §9, and
  architecture.md "Evaluation over all scenes"). Still limits: ten scenes from eight drives; the
  three night scenes are ONE drive; one small general-purpose model without fine-tuning; 2D labels
  derived from 3D boxes. Not "the model's performance", and no cause is claimed.
- **Recall only by distance.** A false positive has no matched ground truth, hence no distance.
- **Derived 2D ground truth** is an approximation (see F5).
- **This evaluates a 2D camera detector, not 3D detection.**

### Out of scope
- Running a 3D detector (GPU-only research toolchains, multi-sweep input preparation, rotated-box
  matching).
- Backend, database, auth, multi-user roles, server-side storage.
- WebGPU renderer migration; live streaming.
- 2D-only label types (polygons, masks, keypoints).

### Open / deferred
- **Found during F4, not part of any feature (2026-11-25):**
  - *Tech upgrade (trigger met by measurement):* three.js spends ~0.4–0.55 s of JS per second on
    shader-program bookkeeping at idle on nuScenes (production build; COCO ~0.05 s). Find which
    material / object forces the re-evaluation, fix, record before / after. Do before F7.
    **Still open after F5 (2026-11-26):** the user chose to do it in a separate session. F5 measured
    its effect as the idle baseline of every interaction (≈ 48 ms per two animation frames in
    software GL; Edge_F#5 "Measured and NOT changed").
  - ~~*Small fix:* the data loader does not check `response.ok`, so an HTTP error is reported as a
    JSON parse error.~~ **Done in F5-0** (`lib/data/fetch-json.ts`).
- **From F5 (2026-11-26):**
  - *F6:* re-check bicycle racks once six cameras are in (none is in CAM_FRONT, so F5 needed no
    rule); re-run `predict_nuscenes.py` per camera — the predictions file has one `camera` field and
    frame-keyed entries, so its format must grow a camera level.
  - *F6 / F7:* only then may the evaluation numbers be quoted (10 frames × 1 camera today).
    **F6 done: 60 photos, still one scene — wait for F7.**
  - *Possible later:* a human verdict on predictions ("this false alarm is really a missing label")
    and an export of evaluation results — would need a new review scope and UI.
- **From F6 (2026-11-26):**
  - *Before F7 (own session, user decision):* the three.js idle cost above. F6 measured that six
    cameras add no interaction latency of their own — the 3D scene is the whole baseline.
    **Done 2026-11-26 (F6.5 entry):** nuScenes idle JS 67.7 → 15.0 ms/s, draw calls 119 → 41.
  - *F7 (from F6.5):* re-measure the idle cost on the larger frames; the scene still renders every
    animation frame and draws one line object per box (`frameloop="demand"` and `instancedMesh` were
    looked at and not needed at 40 boxes).
  - *F7:* bound the photo preload (`PRELOAD_FRAMES_AHEAD` in `page.tsx`; today all ten frames =
    8 MB) and measure the memory the preloaded photos hold; the thumbnail row reuses the full
    1600×900 file, which stops being acceptable with hundreds of frames.
    **Both F7 items done 2026-11-27 (F7 entry):** idle cost re-measured on 40 and 156 boxes (no
    regression; box lines not merged — user decision); preload bounded to 3 frames ahead, 72
    photos kept; photos are 960×540 WebP; the timeline uses 192×108 thumbnails.
  - *Possible later:* a rule for labels cut off by the image edge (38% vs 68% recall; it would
    change the front camera's numbers); a 3×2 view of all six photos; the short class name
    (`classLabel`) in the object list and the 3D label, where the long name is still shown
    *(the short class name was done in F7-E)*.
- **From F7 (2026-11-27):** see the F7 entry's "Open / deferred" — deployment of 152 MB on Vercel
  unverified; merging the box lines (follow-up, only if the frame rate drops on a GPU); photos lag
  playback at 9 Mbps; what the ~1,380 "no label nearby" false alarms are; evaluation-hardening
  candidates (design doc F7 §13); the README beyond its data section is out of date.
- **COCO mode: left as it is for now.** Whether it stays as a secondary tab or is retired is decided
  after the F3 redesign shows what that tab looks like in the new layout (user decision, 2026-11-25).
  **F3 is done and COCO sits unchanged in the new layout; the user has not decided yet** (captures:
  `docs/plan-feature/assets/F3/2026-11-25_after/coco_*.jpg`).
- **Relation to earlier records:** F2's "out of scope" items *multi-camera* and *additional scenes*
  are now roadmap items (F6, F7). The COCO ground-truth-vs-prediction comparison (the data exists in
  `sample.gt_backup.json`) is superseded by F5 and remains optional.

<!-- KO (move to a localized file)
## 로드맵 — F3 이후 방향 (2026-11-25 합의) 🧭 방향만 정함, 아직 계획된 기능 없음

> **상태:** 논의로 방향만 합의했다. **아래 기능 중 구현이 계획되거나 승인된 것은 없다.** 각 기능은
> 시작할 때 `/plan-feature`를 거쳐야 하고(불변 규칙 #4), 그때 아래 표의 한 줄이 정식 항목(Goal / Scope /
> Done when / Tests / Decisions / Edge refs)으로 바뀐다. 번호는 **임시**다. 이 문서의 규칙대로 번호는
> 기능을 *시작할 때* 붙으며, 순서 변경이나 취소가 가능하다.
>
> **설계 문서:** 각 기능의 구현 전 설계는 `docs/plan-feature/F#_*.md`에 쓴다(목록:
> `docs/plan-feature/README.md`). 기능 하나에 문서 하나이며, 그 기능을 시작하기 직전에 쓴다. F3 문서가
> 있고 **F3은 구현 완료**(2026-11-25, 위 F3 항목 참고). 그 뒤 F4(2026-11-25), F5·F6·F6.5(2026-11-26),
> **F7(2026-11-27), F7.5(2026-11-27, 평가 결과를 믿을 수 있게)까지 구현 완료**(각각 위의 항목 참고). 다음은 F8이며,
> 설계 문서는 F8 세션을 시작할 때 쓴다.
> 큰 기능 하나를 세션 하나에서 진행한다. **`docs/plan-feature/HANDOFF.md`부터 읽는다.**

### 방향을 바꾸는 이유
- **지금 앱은 읽기 전용 뷰어다.** 둘러보고 거르고 클릭할 수는 있지만, 사용자에게 남는 결과물이나 내린
  결정이 없다. 실제 AI 데이터 도구는 하나의 업무(라벨 검수, 모델 오류 찾기, 데이터 선별)를 위해 존재한다.
- **화면이 도구가 아니라 문서처럼 배치돼 있다.** 실제 렌더 확인(Playwright, 1440×900, 2026-11-25) 결과,
  폭이 `max-w-screen-xl`로 제한되고 ObjectList와 Analytics가 화면 아래에 있어 "목록 클릭 → 3D 확인"에
  페이지 스크롤이 필요하다.
- **목표 직무.** 이 프로젝트는 자율주행 데이터 시각화 프론트엔드 공고에서 시작했다(`PROJECT_DESIGN.md`
  §1: AI 데이터 플랫폼, 멀티모달 데이터, 3D 시각화, 어노테이션, 데이터 탐색 UI). 이 목록에 가장 잘 맞는
  기존 작업이 F2(실측 3D, LiDAR, 좌표계)이므로, 로드맵은 일반 2D(COCO) 라벨링이 아니라 nuScenes 위에 쌓는다.

### 로드맵 이후의 정체성
nuScenes 중심의 **인지 데이터 품질 도구**. 3D 뷰가 메인이고 카메라 이미지는 확인용 보조 화면이다(규칙 #5).

| 기둥 | 답하는 질문 | 기능 |
|---|---|---|
| 라벨 품질 | 사람이 만든 정답이 맞나? | 3D 박스 검수 |
| 모델 품질 | 모델이 정답에 있는 것을 찾아내나, 못 찾는다면 어디서 왜? | 카메라 탐지 평가 |

두 기둥은 같은 데이터를 쓰고 서로 이어진다. 틀린 라벨을 고치면 평가가 더 정확해지고, 모델이 많이
틀리는 장면은 라벨부터 의심해 볼 장면이다.

### 순서 (임시)

| # | 기능 | 끝나면 사용자가 할 수 있는 것 |
|---|---|---|
| F3 | 스크롤 없는 작업 화면 | 화면 전체를 쓰는 고정 배치에서 목록, 3D 뷰, 카메라 뷰를 한꺼번에 보며 작업 |
| F4 | 3D 박스 검수 | 실측 3D 박스를 카메라 이미지 위 투영과 대조해 승인/반려, 사유 기록, 이어하기, 결과 내보내기 |
| F5 | 카메라 탐지 평가 | nuScenes 카메라 이미지에 돌린 2D 탐지 모델의 맞힘/잘못 찾음/놓침 확인, 놓친 객체를 3D 뷰에서 찾기, 거리별 탐지율 보기 |
| F6 | 카메라 6대 | 차량 주변 전체를 검수·평가, 특정 3D 박스를 어느 카메라가 보는지 찾기 |
| F7 | 장면 탐색 | 훨씬 많은 키프레임을 조건으로 검색 ("모델이 놓친 객체가 있는 장면" 포함) |
| F8 (도전) | 위에서 본 화면에서 3D 박스 수정 | 반려한 박스 고치기 (위치/크기/방향은 회전된 사각형으로, 높이는 숫자로), 실행 취소 |

순서의 근거: 화면 배치(F3)는 이후 모든 기능이 올라가는 바탕이다. 검수(F4)와 평가(F5)가 두 기둥이고,
F6·F7은 두 기둥이 쓰는 데이터를 넓힌다. 수정(F8)은 인터랙션이 가장 어려워 마지막이다.

**기술 고도화는 독립 기능이 아니라 필요할 때 한다.** 먼저 측정하고, 측정 결과가 뒷받침할 때만 바꾸며,
전후 수치를 기록한다. 대상: 서버 컴포넌트 데이터 로딩(F3에서 검토 후 미룸. 설계 문서 결정 6: 로딩 시간을 먼저 재고 별도 항목으로 판단),
`useTransition` / `useDeferredValue`(F5 이후 필터링이 실제로 버벅일 때만), 포인트클라우드 바이너리 전환 +
프레임별 지연 로딩 + Web Worker 파싱(F7에서 프레임 수가 늘면 필요해짐).

### 각 계획에서 정해야 할 것 (`/plan-feature`로 가져갈 것)
- **F3:** 패널 구역과 크기. 모바일 동작(도구 배치는 데스크톱 기준, 좁은 화면은 지금처럼 세로로 쌓을지).
  2026-11-25 렌더에서 찾은 문제 수정(2D/3D 패널 높이와 테두리 불일치, 헤더는 "40 detections"인데 목록은
  13개이고 화면에 이유가 없음, 목록의 읽을 수 없는 해시 ID, 히스토그램 축 글자가 과하게 큼, 영어 UI 속
  한국어 조작 안내).
- **F4:** 검수 상태의 형태와 위치. 백엔드 없는 저장 방식(IndexedDB?). 반려 사유 목록. 단축키. 내보내기 형식.
- **F5:**
  - **예측 ID와 불변 규칙 #1.** 모델 예측은 3D 짝이 없는 2D 전용 객체이고, 짝지어진 정답 박스와도 *다른*
    객체다. `instance`에서 나온 ID와 겹칠 수 없는 별도 ID 체계가 필요하다.
  - **정답 2D 박스를 만드는 방법.** nuScenes에는 사람이 그린 2D 박스가 없다. 3D 박스의 꼭짓점 8개를
    투영하면 헐렁한 사각형이 나와 IoU가 전반적으로 낮아진다. 박스 안 LiDAR 점으로 좁히면 나아지지만 점이
    적은 먼 객체에서는 부정확해진다.
  - **짝짓기 규칙**(IoU 기준, 중심점 거리)을 그 헐렁한 박스에 맞게 정하기.
  - **가려짐.** 완전히 가려진 객체도 정답에 들어 있다. nuScenes의 `visibility`를 준비 스크립트에서 가져와 거른다.
  - **클래스 대응표.** 탐지 모델의 클래스와 nuScenes 카테고리를 맞추고, 모델이 출력할 수 없는 클래스는 평가에서 뺀다.
  - **nuScenes 프레임에 confidence가 돌아온다.** 예측에는 실제 점수가 있으므로 confidence 슬라이더가 다시
    의미를 갖고, selector 단계에서 실시간으로 재평가해야 한다. 이는 F2-E와 부딪힌다. `frameHasConfidence`는
    `Frame.source`(프레임 단위) 기준인데, 이제 한 프레임 안에서 출처가 *객체마다* 다르다.
  - **정직한 표시.** 만들어낸 정답 2D 박스는 근사치이며 그렇게 표시해야 한다(규칙 #6과 같은 태도).
  - **파이프라인.** 탐지 모델은 `scripts/`에서 오프라인으로 실행한다(Step 11과 동일). IoU와 짝짓기는
    `lib/`의 순수 함수 + Vitest(규칙 #3). 런타임 백엔드 없음.
- **F6:** 키프레임당 이미지 6장일 때의 데이터 크기. 박스별 "어느 카메라가 보는지" 조회.
- **F7:** nuScenes-mini 키프레임(장면 10개, 약 400개, 현재 사용은 10개) 중 몇 개를 넣을지. 백엔드 없이
  장면 설명과 프레임별 개수로 검색하기. Vercel 호스팅 용량 한도. 위의 바이너리·지연 로딩 작업.
  *(F7에서 정함: 장면 10개 / 프레임 404개 전부, 나눈 파일 152 MB를 `public/`에. 검색은 메모리에 있는 박스를
  순수 함수로 훑는다. Vercel 배포 자체는 아직 확인하지 못했다.)*
- **F8:** 회전된 사각형 편집 인터랙션. 실행 취소 이력 모델.

### 알려진 한계 (결과를 보여주는 곳마다 밝힐 것)
- **표본이 작다.** 키프레임 10개 × 카메라 1대에서는 거리 구간마다 박스가 몇 개뿐이다. F5는 분석이
  동작함을 보여주는 단계이고, 수치를 인용할 수 있는 건 F6/F7 이후다.
  **F7 이후(2026-11-27):** 장면 10개, 404순간, 사진 2,424장, 채점한 정답 12,018개. 이제 숫자를 **조건을 붙인 관찰**로
  인용할 수 있다(표현 방침: F7 설계 문서 9장). 남은 한계: 장면 10개는 주행 8번에서 나왔고, 밤 장면 3개는 주행 1번이다.
  추가 학습 없는 작은 범용 모델 하나, 3D 박스에서 만든 2D 정답. "모델 성능"이라 부르지 않고 원인을 주장하지 않는다.
- **거리별 지표는 탐지율(Recall)뿐이다.** 잘못 찾은 것(FP)은 짝지어진 정답이 없어 거리를 알 수 없다.
- **만들어낸 2D 정답**은 근사치다(F5 참고).
- **평가 대상은 2D 카메라 탐지 모델이며, 3D 탐지가 아니다.**

### 범위 밖
- 3D 탐지 모델 실행(GPU 전용 연구용 도구, 여러 스캔을 겹치는 입력 준비, 회전된 박스 짝짓기).
- 백엔드, DB, 인증, 다중 사용자 권한, 서버 저장.
- WebGPU 렌더러 전환, 실시간 스트리밍.
- 2D 전용 라벨 유형(폴리곤, 마스크, 키포인트).

### 미정 / 보류
- **F4에서 발견한 것 (2026-11-25):** three.js 상시 비용은 **2026-11-26 별도 세션에서 고쳤다**(위 F6.5 항목.
  nuScenes 가만히 둔 상태의 JS 초당 67.7 → 15.0ms, 그리기 호출 119 → 41). F7에서 프레임이 커지면 다시 잰다. 불러오기의 `response.ok` 미확인은 **F5-0에서 고쳤다**(`lib/data/fetch-json.ts`).
- **F5에서 넘긴 것 (2026-11-26):** F6에서 자전거 거치대를 다시 확인하고(앞 카메라에는 하나도 없어 규칙이 필요 없었다),
  예측을 카메라별로 다시 돌린다(예측 파일 형식에 카메라 단계가 필요하다). 평가 숫자는 F6 / F7 이후에만 인용한다.
  나중에 할 수 있는 것: 예측에 대한 사람의 판정과 평가 결과 내보내기.
- **F7에서 넘긴 것 (2026-11-27):** 위 F7 항목의 "남은 것" 참고. 152 MB의 Vercel 배포 미확인, 박스 선 합치기(GPU에서
  화면이 끊길 때만 하는 후속 작업), 9 Mbps에서 재생 중 사진 지연, "근처에 정답이 없는 헛짚음" 약 1,380개의 정체,
  평가를 더 단단하게 하는 후보들(F7 설계 문서 13장), 데이터 부분 외의 README가 낡았다.
- **COCO 모드는 일단 그대로 둔다.** 보조 탭으로 남길지 정리할지는 F3 재설계 후 새 배치에서 그 탭이 어떻게
  보이는지 확인한 뒤 정한다(2026-11-25 사용자 결정). **F3이 끝났고 COCO는 새 화면 안에 그대로 있다. 아직
  결정하지 않았다**(캡처: `docs/plan-feature/assets/F3/2026-11-25_after/coco_*.jpg`).
- **이전 기록과의 관계:** F2의 "범위 밖" 항목이던 *멀티 카메라*와 *추가 장면*은 이제 로드맵 항목이다(F6,
  F7). COCO 정답 vs 예측 비교(데이터는 `sample.gt_backup.json`에 있음)는 F5로 대체됐고 선택 사항으로 남는다.
-->
