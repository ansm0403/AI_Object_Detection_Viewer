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
