# MVP 진행 체크리스트
## MVP 1~10번 진행 상태 추적

# MVP Checklist

Track MVP progress here. Each step has a goal, scope, and "done when" criteria.
Work on ONE step at a time. Mark with [x] when complete.

## Step 1 — COCO Parsing
- [ ] Goal: Convert COCO JSON into internal `Frame[]` structure.
- Scope: `lib/coco/parser.ts`, `lib/types/*`.
- Done when:
  - Sample COCO JSON loads without errors.
  - Each `Frame` has correct `detections2D` populated.
  - `Detection2D.id` is generated and unique within a frame.
  - Invalid/empty inputs return `[]` with a console.warn, not a crash.

## Step 2 — 2D Image Viewer
- [ ] Goal: Display image + 2D bounding boxes via SVG overlay.
- Scope: `components/viewer-2d/*`.
- Done when:
  - Image renders with bboxes positioned correctly.
  - Each bbox is clickable (placeholder handler is fine for now).
  - Bbox labels show class name and confidence.

## Step 3 — Zustand Store
- [ ] Goal: Set up global UI state.
- Scope: `store/viewer-store.ts`.
- Done when:
  - Store exposes `selectedFrameId`, `selectedObjectId`, `confidenceThreshold`, `visibleClasses`.
  - Setters work and trigger re-renders.
  - Frame data is NOT stored here.

## Step 4 — 3D Scene (basic)
- [ ] Goal: Render point cloud + 3D bboxes in R3F with OrbitControls.
- Scope: `components/viewer-3d/*`, `lib/geometry/*`.
- Done when:
  - `Detection2D` data is converted into `Detection3D` + `Point3D[]` via `lib/geometry/`.
  - Point cloud renders using `BufferGeometry`.
  - 3D bboxes render as wireframe boxes at estimated positions.
  - OrbitControls allows mouse navigation.

## Step 5 — 2D ↔ 3D Selection Sync
- [ ] Goal: Clicking an object in 2D highlights it in 3D, and vice versa.
- Scope: viewer-2d, viewer-3d, store.
- Done when:
  - Clicking a 2D bbox sets `selectedObjectId`.
  - Clicking a 3D bbox sets `selectedObjectId`.
  - The selected object highlights in BOTH views.
  - Clicking empty space deselects.

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