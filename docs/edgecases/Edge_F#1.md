# Edge Case Log F#1 — Visual Impact Pass (Features F1-A / F1-B / F1-C)

> Cases 1–3 are F1-A (point cloud depth color), Case 4 is F1-B (3D hover highlight),
> Case 5 is F1-C (drei `<Html>` anchor labels).

## Context

Discovered while implementing **F1-A — Point cloud depth color encoding**
(`post-mvp-checklist.md` → F1 Visual Impact Pass). The feature maps each point
cloud point's depth (`z`) through a two-color ramp via the pure function
`depthToColor(z, minZ, maxZ)` in `lib/geometry/depth-color.ts`.

- Affected modules:
  - `apps/ai_detection_viewer_client/src/lib/geometry/depth-color.ts`
    (new, pure — `depthToColor` + `depthRange`)
  - `apps/ai_detection_viewer_client/src/lib/geometry/depth-color.test.ts` (new)
  - `apps/ai_detection_viewer_client/src/components/viewer-3d/PointCloud.tsx`
    (per-vertex `color` BufferAttribute + `vertexColors`, point `size`)
  - `apps/ai_detection_viewer_client/src/components/viewer-3d/Viewer3D.tsx`
    (`flat` tone mapping — Case 3)
- Test suite: **114/114 passing** (15 new `depth-color` unit tests; the visibility
  fixes in Case 3 are render-only — no pure-logic tests per Testing Policy).
- Final status after fixes: **114/114 tests passing**, render-verified by screenshot.

---

## Case 1 — Fixed ramp domain `[MIN_Z, MAX_Z]` made the gradient invisible (FIXED → per-frame fit)

**Discovery.** Reported by the user after visual review: with all three candidate
palettes (cyan→indigo, sky→deepblue, light→dark) the cloud looked like a single
flat color — no perceptible near→far change. Three hypotheses were raised (points
too small / depth range too wide / palette unsuitable) and **measured against the
real sample data** instead of guessed.

**Measurement (47 sample detections, replicating the estimator formula).**

| Metric | Value |
|---|---|
| center `z` range | 4.88 – 7.99 (theoretical range is 1–8) |
| center `z` mean | **7.5** |
| center `z` histogram | z[6–7]: 5, **z[7–8]: 40**, z[<7]: 7 |
| normalized `t` of centers | 0.55 – 1.0, clustered ≈ 0.9–1.0 |

**Root cause.** The estimator maps `z = MAX_Z − areaRatio·(MAX_Z − MIN_Z)`. COCO
objects are small relative to the image (small `areaRatio`), so depth collapses
toward `MAX_Z`. **85% (40/47) of detections sit in z∈[7,8]** — the top ~15% of the
`[1,8]` ramp. Coloring over the full `[1,8]` domain therefore used almost none of
the ramp; every point resolved to nearly the same "far" color. The palette was NOT
the problem; the **domain was far wider than where the data actually lives**.

**Resolution.** Fit the ramp **per frame** to the frame's own point-z range. A pure
helper `depthRange(points): [min, max]` (also in `depth-color.ts`, kept out of the
component per Immutable Rule #3) computes the domain; `PointCloud` passes it as
`depthToColor(z, zMin, zMax)`. This stretches each frame's real spread across the
whole ramp. Measured per-frame point-z spans range from ~0.9 (all-similar-depth
frames 2/3/4) to ~8.6 (frame 9) — per-frame fit makes even the narrow-span frames
show a full gradient. The domain is computed from the **full frame** `points`
(pre-filter), so toggling class filters does not recolor the cloud; only frame
switches change it. Point size was also bumped `0.04 → 0.06` (with
`sizeAttenuation`) so far points stay visible — a secondary contributor.

**Trade-off accepted.** Per-frame fitting means the same object can shade
differently between frames. This is acceptable: estimated depth is a visualization
approximation (Immutable Rule #6), and the demo goal (read as 3D per frame)
outweighs cross-frame color comparability. Alternatives considered and rejected:
- *Fixed `[1,8]`* — the original, invisible (this case).
- *Global robust range (≈[2.5, 9.4])* — stable across frames, but the
  all-similar-depth frames (3 of 10) still mapped to ~12% of the ramp = still flat.

**Clamping note.** `depthToColor` still clamps `t` to `[0,1]` defensively. With the
domain fit to the actual point min/max, in-frame points no longer fall outside the
range, so clamping is now a safety net rather than a routine path.

---

## Case 2 — Degenerate range `minZ === maxZ` divides by zero (GUARDED)

**Discovery.** Identified while specifying the pure function. If the range passed
to `depthToColor` is degenerate (`maxZ − minZ === 0`) — e.g. a frame whose visible
points all share one `z`, which `depthRange` would report as `[v, v]` — the
normalization denominator is zero and `t` becomes `NaN`/`±Infinity`, producing
`NaN` color channels.

**Why it matters.** A `NaN` in a color BufferAttribute corrupts the GPU upload and
can blank or garble the whole cloud. The function must never emit `NaN`.

**Resolution.** `depthToColor` guards: `t = denom <= 0 ? 0.5 : clamp01(...)`. A
degenerate range returns the **ramp midpoint** — a stable, honest "no depth spread"
color that implies neither "nearest" nor "farthest". `depthRange` is the natural
upstream source of a degenerate `[v, v]` (single point / all-equal z); the two
functions are tested together so the pipeline never produces `NaN`. Locked by
`depth-color.test.ts` degenerate-range + `depthRange` all-equal tests.

---

## Case 3 — Gradient invisible despite correct data: point size + tone mapping (FIXED, render-verified)

**Discovery.** After Case 1 (per-frame domain) the user reported the gradient still
"barely shows." Rather than guess again, the running app was **screenshotted via
Playwright** (headless chromium, SwiftShader) — both the default view and an
orbited (~90°) view. The renders made the real causes visible; measurement had
already ruled out the domain (each object occupies 50–88% of the per-frame ramp).

**Root causes (two, compounding).**
1. **Points too small.** At `size = 0.06` (later `0.14`) with `sizeAttenuation`,
   points were sub-pixel specks; a 1–2px dot cannot show a color, and the sparse
   scatter gave no readable color field. Bumping to **`0.2`** made each point and
   its color legible.
2. **Tone mapping desaturation.** R3F's `<Canvas>` defaults to ACES filmic tone
   mapping, which lifts and desaturates bright colors toward white — the point
   colors (and even the bbox wireframes) washed out to pale/white regardless of
   palette. Setting **`flat`** on the `<Canvas>` (no tone mapping) made the
   saturated colors render true. This is a scene-wide change in `Viewer3D.tsx`,
   appropriate for a data-viz scene that wants accurate colors over a filmic look.

**Secondary finding — palette contrast.** With tone mapping off, the ends must
still differ in **hue**, not just lightness: cyan→periwinkle (two light blues)
read as one color at small sizes. Final palette is **cyan → violet**
(`#22d3ee → #a855f7`) — cool/on-theme and clearly readable; `cyanMagenta`
(`#22d3ee → #f472b6`) is kept as a higher-punch alternate (one-line `ACTIVE_PALETTE`
swap).

**On the camera / occlusion theory.** Because depth color runs along the camera's
view axis, near points partly occlude far ones, so the default view is biased
toward the near color. The orbit screenshot confirmed the gradient reads clearly
from the side. This was judged acceptable: with the size + tone-mapping fixes the
nearest objects (cyan) vs farther objects (violet) are already distinguishable
head-on, and OrbitControls lets the user rotate. The default camera was left
unchanged (no Viewer3D camera-position change), keeping Edge_#4 Case 2's rationale
intact.

**Note for future datasets.** These thresholds (size `0.2`, `flat`) were tuned by
eye on the sample data's scale/density. KITTI or a denser cloud may want a smaller
size; revisit visually if the dataset changes.

---

## Case 4 — Hovered 3D bbox unmounts before `onPointerOut`, leaving the cursor stuck (GUARDED) — Feature F1-B

**Discovery.** Identified while implementing **F1-B — 3D hover highlight**
(`post-mvp-checklist.md` → F1-B). Hovering a `BBox3D` sets `document.body.style.cursor =
'pointer'`, and `onPointerOut` resets it to `'auto'`. But `onPointerOut` is not guaranteed
to fire: if the hovered box **disappears while the pointer is still over it** — the frame
switches (`<Viewer3D key={frame.id}>` remounts) or a confidence/class filter removes that
detection (`visibleIds`) — the mesh unmounts without an out event, and the page-level cursor
would stay `'pointer'` indefinitely.

**Why it matters.** A `pointer` cursor lingering over empty 3D space (or worse, over other
UI) is a visible, confusing glitch — the affordance lies about what is clickable.

**Resolution.** Cursor is driven by an effect that acts **only when `hovered` is true** and
resets in its cleanup:

```ts
useEffect(() => {
  if (!hovered) return;
  document.body.style.cursor = 'pointer';
  return () => { document.body.style.cursor = 'auto'; };
}, [hovered]);
```

The cleanup runs both on un-hover **and on unmount**, so the disappearing-box case resets the
cursor defensively. Two ordering properties make this robust:
1. React runs all effect **cleanups before** all new effects on a commit, so moving the
   pointer from box A to box B (A's cleanup → `'auto'`, then B's effect → `'pointer'`) settles
   on `'pointer'`, never stuck on `'auto'`.
2. The effect is a no-op when `hovered` is false, so non-hovered boxes unmounting (the common
   case during frame switch / filtering) never touch the cursor and can't clobber another box's
   `'pointer'`.

No test (UI interaction, per Testing Policy); verified by reasoning about the effect lifecycle
**and by a Playwright hover run** — a click probe located a bbox, then a pointer move (no click)
over it confirmed `document.body.style.cursor` going `auto → pointer → auto` (the last on leave),
and that the hovered box stays non-selected. `onPointerOver`/`onPointerOut` also `stopPropagation`
(like the existing `onClick`) so only the front box highlights when boxes overlap.

**Render-review side note (hover strength).** The same screenshots showed the initial hover
look — `lerp(white, 0.45)` tint + `1.02` scale — barely read on the near-black background with
1px wires (the same failure mode as Case 3's depth colors). Raised to `lerp(white, 0.6)` + `1.06`
scale, which reads clearly while staying distinct from the selected white+pulse look (selected
scale stays in `0.96–1.04`). The cursor→`pointer` change remains the primary, unambiguous hover
affordance; tint+scale are secondary polish.

---

## Case 5 — drei `<Html>` label overlay could swallow empty-space deselect (GUARDED, render-verified) — Feature F1-C

**Discovery.** Anticipated while implementing **F1-C — 3D `<Html>` anchor labels**
(`post-mvp-checklist.md` → F1-C). drei's `<Html>` does not draw into the WebGL canvas — it
renders a real DOM node into an overlay `div` positioned ON TOP of the `<canvas>`. The 3D
viewer's deselect relies on `<Canvas onPointerMissed>` (a click that hits no mesh), which is a
**canvas** event. If the label overlay captures the click first (default `pointer-events: auto`),
the click never reaches the canvas, `onPointerMissed` never fires, and **empty-space deselect
silently breaks** — the same failure class as Edge_#9.5 Case A (the `<Grid>` mesh hijacking the
same event from the WebGL side).

**Why it matters.** Deselect-on-empty-click is a Step 5 contract. A regression here is invisible
in a quick smoke test (selection still *works*; you just can't clear it by clicking the
background) and easy to ship unnoticed.

**Resolution.** `BBoxLabel` sets `pointer-events: none` on BOTH the `<Html>` container
(`style={{ pointerEvents: 'none' }}`) and the inner pill `div` (`pointer-events-none` class), so
clicks pass straight through the label to the canvas underneath. The label is purely informational
(no buttons), so it never needs to be interactive in F1. `occlude` is left OFF (acceptable with
≤2 labels on screen).

**Verification (render).** Confirmed via Playwright (headless chromium/SwiftShader): selected a
bbox (label appears), then clicked empty space — the inspector returned to its placeholder, i.e.
`onPointerMissed` fired and deselect still works. Also confirmed the label tracks the box through
an orbit drag and that hovering a box shows its label while the box stays unselected. No DOM/UI
test (Testing Policy); the guard is a render-verified design decision.

**Note for F1-C+ (`<Html occlude>` / interactivity).** If a future label needs a clickable
control, `pointer-events-none` can't stay blanket — re-enable events only on the interactive
child and keep the deselect path working (e.g. stop the control's click from counting as a miss).
Turning `occlude` ON would also add a hidden occluder mesh; re-check it doesn't intercept
`onPointerMissed` the way `<Grid>` did.

---

## Cross-references

- `post-mvp-checklist.md` → F1-A (Decisions: z range source REVISED; Tests); F1-B (hover look,
  cursor reset decision); F1-C (label size, group split, deselect guard).
- `architecture.md` → PointCloud contract (per-frame depth color, F1-A) + estimator
  "Note (F1-A finding)" + `lib/geometry/` listing; BBox3D contract (F1-B hover tint + cursor).
- `Edge_#4.md` Case 4 — the GPU `dispose` pattern the color attribute rides on
  (color lives on the same geometry `useEffect` already disposes).

<!-- KO (move to a localized file)
# 엣지 케이스 로그 F#1 — 점 구름 깊이 색상 (F1-A)

F1-A 구현 중 발견. 점 색은 순수 함수 depthToColor(z,minZ,maxZ)(depth-color.ts)로 매핑.
범위 계산도 순수 함수 depthRange(points)로 분리(Rule #3). 테스트 114/114 통과.

## Case 1 — 고정 도메인 [1,8]이 그라데이션을 안 보이게 함 (수정 → 프레임별 fit)
사용자 시각 검토: 세 팔레트 모두 한 가지 색처럼 보임. 추측 대신 실제 데이터로 측정.
측정(47개): 중심 z 평균 7.5, 85%(40/47)가 z[7,8]에 몰림 → [1,8] 램프의 상위 15%만 사용.
원인: estimator z=8-면적비*7, COCO 객체가 작아 z가 먼 쪽으로 압축됨. 색이 아니라 도메인 문제.
해결: 프레임별로 그 프레임의 실제 점 z [min,max]에 램프를 맞춤(depthRange). 필터 전 full frame
기준으로 계산해 클래스 토글 시 재색칠 안 함, 프레임 전환 시에만 바뀜. 점 크기 0.04→0.06.
대가: 같은 객체가 프레임 간 색이 달라질 수 있음(깊이는 근사값, Rule #6 — 데모 목표가 우선).
글로벌 범위(≈[2.5,9.4])는 비슷한 깊이 프레임 3개가 여전히 평평해서 기각.

## Case 2 — 퇴화 범위 minZ===maxZ 0division 가드
denom=0이면 t가 NaN → 색 채널 NaN → GPU 손상. 해결: denom<=0이면 t=0.5(램프 중간색).
depthRange가 단일 점/all-equal에서 [v,v]를 반환할 수 있어 두 함수를 함께 테스트.

## Case 3 — 데이터는 맞는데 안 보임: 점 크기 + 톤매핑 (렌더로 검증)
도메인 고쳐도 여전히 약함 → 추측 대신 Playwright로 실제 화면 스크린샷(정면+90° 회전).
원인 2개: ① 점이 너무 작아(0.06) 색이 안 읽힘 → 0.2로 키움. ② R3F 기본 ACES 톤매핑이
밝은 색을 흰색으로 탈색 → Canvas에 `flat`(톤매핑 off)로 색 선명화(Viewer3D 전역 변경).
부차: 팔레트는 명도뿐 아니라 색상(hue) 대비 필요 → cyan→violet(#22d3ee→#a855f7) 확정,
cyan→magenta는 강대비 대안(ACTIVE_PALETTE 한 줄 스왑). 카메라는 안 건드림(Edge_#4 Case 2 유지).
-->
