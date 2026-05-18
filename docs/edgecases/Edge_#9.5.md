# Edge Case Log #9.5 — UI Density & Polish

Covers both **Phase 1 (Stabilization + Tone)** and **Phase 2 (Identity +
Interaction)**. Each phase has its own section below; Phase 2 cases were
discovered during the post-implementation review pass after Phase 2 shipped.

---

# Phase 1 — Stabilization + Tone

## Context

Discovered during the post-implementation review pass after
**Step 9.5 Phase 1** — Viewer2D fixed-aspect wrapper, dark zinc/neutral tone,
sky accent, `<Grid>` + `<fog>` + hemisphere light, OrbitControls sensitivity,
and the `HintBox` overlay.

User-reported visual checks all passed (Timeline stable, no blue cast, grid
floor + fog visible, camera feels smoother). The two cases below were caught
in a follow-up audit of the **selection contract** that Step 5 introduced —
specifically the "click empty space deselects" path. Phase 1 added new
surfaces (the grid floor in 3D, and a letterbox band in 2D) that quietly
broke that contract before it could be tested visually.

- Affected modules: `components/viewer-3d/Scene.tsx`,
  `components/viewer-2d/Viewer2D.tsx`.
- Test suite: **85/85 passing** before and after fixes (no new tests; Step 5
  integration tests still lock the underlying `selectedObjectId` contract).

---

## Case A — `<Grid>` raycast steals the "click empty space" deselect in 3D

**Symptom.** After adding the drei `<Grid infiniteGrid>` floor to `Scene.tsx`,
clicking on empty 3D space (anywhere the user is not directly hitting a
`BBox3D`) no longer clears `selectedObjectId`. The 3D viewer's contract from
Step 5 — `<Canvas onPointerMissed={() => onSelect?.(null)}>` — silently stops
firing for the vast majority of the canvas surface.

**Root cause.** drei's `<Grid>` is implemented as a single `<mesh>` with a
`<planeGeometry>` and a custom `<gridMaterial>` (see
`node_modules/@react-three/drei/core/Grid.js`). With `infiniteGrid` enabled
the shader visually fades out at `fadeDistance`, but the underlying plane
mesh is **not** shrunk — it remains the full geometry plus an `infiniteGrid`
multiplier in the vertex shader. R3F's pointer raycaster intersects that
plane on essentially every click that misses a `BBox3D`. Because *something*
was hit, R3F's `onPointerMissed` does not fire, so the deselect path is
short-circuited.

**Why it was missed in the design pass.** Visual properties (cell size,
section size, fade, color) were considered; raycast was not. Step 5's
deselect contract lives one layer down — at the pointer-miss API — so a new
hit-testable mesh anywhere in the scene is enough to break it without any
visible regression.

**Fix.** Override the grid's `raycast` to a noop after mount, so it stays
visually present but is invisible to the raycaster:

```ts
// Scene.tsx
const gridRef = useRef<THREE.Mesh>(null);
useEffect(() => {
  if (gridRef.current) gridRef.current.raycast = () => {};
}, []);
// ...
<Grid ref={gridRef} ... />
```

Alternatives considered and rejected:

- `<Grid renderOrder={-1}>` — purely a draw-order hint, has no effect on
  raycasting.
- Wrapping in a `<group raycast={...}>` — R3F propagates raycast through
  groups; the inner mesh still hits.
- Shrinking the plane (`args={[2, 2]}`) — kills the `infiniteGrid` look that
  Phase 1 was added to deliver.
- Replacing `<Grid>` with a hand-rolled `<lineSegments>` floor — solves the
  raycast but loses the shader-based fade and would have to be re-tuned
  against `<fog>`. Disproportionate for the bug.

The ref-based noop preserves the Phase 1 visual outcome while restoring the
Step 5 deselect contract exactly.

**Test impact.** None — Step 5's integration tests
(`tests/integration/selection-sync.test.ts`) cover store-level deselect with
`setSelectedObject(null)`, not R3F's pointer pipeline. The contract is
canvas-level and stays manually verified. A regression test would require
mounting `<Canvas>` in jsdom, which the project policy excludes.

---

## Case B — Viewer2D letterbox/pillarbox clicks no longer deselect

**Symptom.** After wrapping `<svg>` in `aspect-[4/3]` for Timeline
stabilization, the SVG is letter- or pillar-boxed inside the wrapper whenever
the source image's aspect ratio differs from 4:3. Clicks on those padding
bands (still inside the visible Viewer2D cell, just outside the SVG itself)
do not clear `selectedObjectId`. From the user's perspective, "I clicked
empty space in the 2D viewer and nothing happened."

**Root cause.** The deselect handler lived on the `<svg>` element
(`onClick={() => onSelect?.(null)}`). With `preserveAspectRatio="xMidYMid
meet"`, the SVG content area shrinks to fit one axis and exposes wrapper
background on the other. Those wrapper bands are *outside* the SVG element,
so the SVG's `onClick` never sees them. The wrapper `<div>` had no handler.

Sample data evidence: all ten `frame_*.jpg` files are MS COCO val2017 images,
none of which are exactly 4:3. So in practice **every frame** has at least
one letterbox/pillarbox band visible, and the broken-deselect surface area
is non-trivial — large enough that a user clicking "off to the side" to
deselect would land in it.

**Fix.** Move the deselect handler from the `<svg>` to the wrapper
`<div>`. `<rect>` elements already call `e.stopPropagation()`, so bbox
clicks still resolve to a select (not select-then-deselect). `<image>` and
`<text>` clicks bubble up through the SVG to the wrapper and produce a
deselect — desirable, since clicking on the photo background or a label
*should* clear selection, matching the previous behaviour.

```tsx
// Viewer2D.tsx
<div
  className="relative w-full aspect-[4/3] bg-zinc-950 rounded overflow-hidden"
  onClick={() => onSelect?.(null)}
>
  <svg ... /* no onClick here */>...</svg>
</div>
```

Alternatives considered and rejected:

- Keep both handlers (SVG **and** wrapper) — `setSelectedObject(null)` fires
  twice per click in the SVG region. Idempotent in state, but causes two
  Zustand store updates per click. Not worth it.
- Stretch the SVG to fill the wrapper with `preserveAspectRatio="none"` —
  distorts the image and breaks bbox-to-pixel correspondence; unacceptable.

**Test impact.** None. The change is event-routing only and the
selection invariants (Immutable Rule #2) are unchanged. The two relevant
tests in `selection-sync.test.ts` ("deselect via `null`", and "same id
twice is idempotent") still apply at the store layer.

---

## Phase 1 Summary

| # | Case | Decision |
|---|------|----------|
| A | drei `<Grid>` plane mesh hits raycast; `<Canvas onPointerMissed>` never fires; 3D empty-space deselect broken | **Fixed** — `mesh.raycast = () => {}` via `useRef` + `useEffect` |
| B | Viewer2D letter/pillarbox bands outside `<svg>` cannot trigger SVG `onClick`; 2D empty-space deselect broken for any non-4:3 image | **Fixed** — deselect handler moved to the `aspect-[4/3]` wrapper `<div>`; `<rect>` `stopPropagation` keeps select-only intact |

## Phase 1 Carry-forward

None. Both cases were introduced and resolved within Phase 1. The Phase 1
"sensor checks" from the design doc (glow clipping, Grid Y-position) were
covered by user visual verification and required no adjustment.

---

# Phase 2 — Identity + Interaction

## Context

Discovered during the post-implementation review pass after
**Step 9.5 Phase 2** — `Header`, `ObjectList` confidence gauge bar +
auto-scroll-into-view, `Filters` Reset button + visible counter, `Timeline`
detection-count badge, and the `resetFilters` store action.

The audit focused on (a) the selection contract that Steps 5/8 lock down
(any new effect that touches selection must respect the same deselect/clear
paths) and (b) Phase 2's only side-effecting behavior — the new auto-scroll
on `selectedId` change.

- Affected modules: `components/object-list/ObjectList.tsx`.
- Test suite: **87/87 passing** before and after the fix (no new tests; the
  effect is purely DOM-side scroll, which the project's testing policy
  excludes).

---

## Case C — `scrollIntoView` propagates to outer scroll containers and can move the page

**Symptom.** On short viewports (mobile, or desktop with the browser window
shrunk vertically), selecting an object from outside the list — clicking a
2D bbox, clicking a 3D bbox — triggers `ObjectList`'s auto-scroll effect.
The list dutifully scrolls the selected row into its own visible area, but
the surrounding page **also scrolls vertically**, sometimes pulling the 2D
viewer halfway up off screen. The user feels like the app "jumped" in
response to a click that was supposed to just select something.

**Root cause.** The first implementation of the scroll effect used
`scrollIntoView({ block: 'nearest', behavior: 'auto' })`. Per the CSSOM-View
spec, `scrollIntoView` applies its alignment policy to **every scrollable
ancestor of the target**, walking up the DOM. With `block: 'nearest'`, each
ancestor is scrolled the minimum amount needed to expose the element. In
this layout:

```
<li>                       ← target
└── <ul overflow-y-auto>   ← scrollable: adjusted (intended)
    └── <div overflow-hidden>   ← not scrollable, alg continues up
        └── (grid cell)
            └── <main>
                └── <body>     ← scrollable: ALSO adjusted (unintended)
```

So even when the row was already visible *within* the list, if the list
itself was even partially below the page fold, the body would scroll up to
expose the list. `block: 'nearest'` reduces but does not eliminate the
chain.

**Why it was missed in the design pass.** The Phase 2 design called for
"selected row auto-scrolls into view when selection changes from outside
the list," reasoning by analogy with native `<select>` keyboard navigation.
That analogy assumes the scroll container *is* the only scrollable
ancestor, which holds for `<select>` (it owns its dropdown) but not for an
arbitrary `<ul>` inside a page layout. The scroll-container scoping was
implicit, not explicit.

**Fix.** Replace `scrollIntoView` with a manual `ul.scrollTop` adjustment
that, by construction, cannot touch any other scroll container:

```ts
useEffect(() => {
  if (!selectedId) return;
  const li = selectedRef.current;
  const ul = li?.parentElement;
  if (!li || !ul) return;
  const liTop = li.offsetTop;
  const liBottom = liTop + li.offsetHeight;
  const viewTop = ul.scrollTop;
  const viewBottom = viewTop + ul.clientHeight;
  if (liTop < viewTop) {
    ul.scrollTop = liTop;
  } else if (liBottom > viewBottom) {
    ul.scrollTop = liBottom - ul.clientHeight;
  }
}, [selectedId]);
```

The math is "scroll the minimum amount needed to bring the row inside the
list's visible band", same intent as `block: 'nearest'`, but applied only
to the `<ul>`. If the row is already visible, both branches are skipped
and nothing happens — the original idempotent behavior is preserved.

Alternatives considered and rejected:

- `scrollIntoView({ block: 'nearest', inline: 'nearest' })` — `inline` only
  governs horizontal alignment; the chain-up behavior is unchanged. Does
  not solve the page-scroll bug.
- A wrapper `<div tabIndex={-1} onFocus={preventDefault}>` to absorb focus
  changes — does not apply; we are not using focus-based scrolling.
- `useLayoutEffect` instead of `useEffect` — only changes timing relative
  to paint, not the scroll-container chain. Would not help.
- Polyfill `block: 'nearest'` via a custom Element prototype patch —
  overkill for a single use site, and patching DOM prototypes is exactly
  the kind of cross-cutting change CLAUDE.md "avoid editing unrelated
  files" pushes back on.

The direct `scrollTop` write also has a nice side effect: it is
instantaneous regardless of any `scroll-behavior: smooth` CSS the page
might pick up later, so quickly tabbing through selections never queues an
animation.

**Test impact.** None. The original Phase 2 plan deliberately added no
component-level tests (scroll-into-view is a DOM-side effect, not a pure
function). The integration tests from Step 5 still lock the underlying
selection contract; this fix is event-routing-only and does not change any
observable store state.

---

## Phase 2 Summary

| # | Case | Decision |
|---|------|----------|
| C | `scrollIntoView({ block: 'nearest' })` in `ObjectList` chains up to outer scroll containers (including `<body>`), pulling the whole page on short viewports | **Fixed** — replaced with a manual `ul.scrollTop` adjustment that is scoped to the list only |

## Phase 2 Carry-forward

None. The single case found was introduced and resolved within Phase 2.
The other Phase 2 surfaces audited (Header, Filters Reset / counter,
Timeline badge, `resetFilters` action) had no behavioral regressions —
the Reset button correctly stays inside `stopPropagation` so it does not
trigger the Filters-bar `onDeselect`; the gauge bar clips out-of-range
confidence values via the parent `overflow-hidden` track; the Timeline
badge is part of the same `<button>` so it has no event-routing surprise.
