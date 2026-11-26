# 데이터 구조, 상태 흐름
## 데이터 모델, 상태 흐름, 폴더 구조 상세

# Architecture

**Current Status: MVP (Steps 1–11) complete.** Post-MVP: **F1 ✅** (visual impact pass — point-cloud
depth color, 3D hover, `<Html>` labels). **F2-A ✅ Done** (nuScenes real-3D): lib core (transforms /
projection / parser), offline prep + sample data (`scripts/prep_nuscenes.py` →
`public/sample-data/nuscenes/`, scene-0916), **and UI integration** — dataset switcher +
Estimated/Measured badge (Header), measured 3D boxes with quaternion rotation, projected 2D boxes +
selection sync, a `lib/selectors` distance filter (per-dataset slider swap), and per-dataset 3D camera
framing + fog. **F2-B ✅ Done** (real LiDAR point cloud): offline `.pcd.bin` decode + voxel-grid
decimation in the prep script, `sensorToGlobal` transform, aligned `pointCloud` from the parser,
optional `Point3D.detectionId`, and the `selectVisiblePoints` selector (LiDAR/environment points always
shown). **F2-C ✅ Done** (sequence + tracking + autoplay): the `instance` token gives cross-frame
identity, so on nuScenes `selectedObjectId` SURVIVES a frame switch (tracking; COCO still clears —
unstable ids), a Timeline play/pause control steps the keyframes at ~2 Hz (pure `nextFrameIndex` in
`lib/sequence/`), and the nuScenes 3D camera no longer remounts/bounces per frame (dataset-aware
`Viewer3D` key + frozen initial framing). **F2-D ✅ Done** (motion/camera polish): an opt-in
Fixed/Follow camera toggle aims OrbitControls at the selected box (`selectFollowTarget`, falls back to
fixed), and during autoplay every box tweens between keyframes (position `lerpVec3` + rotation
`slerpQuat` in `lib/geometry/interpolation.ts`) while paused/scrubbing shows the exact measured
keyframe (Rule #6); the LiDAR cloud stays per-keyframe snap. **F2-E** (2026-10-25): measured
frames no longer render the parser's placeholder `confidence: 1.0` as a score — `frameHasConfidence`
(pure, keyed on `Frame.source`) swaps every confidence surface to "—" / a note (Rule #6). 206 tests.
**F2 complete.** **F3 ✅ Done** (2026-11-25, no-scroll workspace): a full-viewport `WorkspaceShell`
grid (top bar · filter bar · list | 3D | camera / details · timeline) replaces the stacked 12-column
page; the shell sizes every pane and the viewers only fill their cell; the object list, class counts
and timeline badges all count `detections3D` (the 3D view's basis); shared panel styling lives in
`components/workspace/Panel.tsx`. 213 tests. See "Layout (F3 workspace)".
For step-by-step history and per-Step decisions, see `mvp-checklist.md` (🔒 frozen).
Post-MVP feature work (in progress) is tracked in `post-mvp-checklist.md`.
For the original vision behind these decisions, see `docs/PROJECT_DESIGN.md` (read-only).
For Step 9.5 UI feature candidates and adopt/exclude rationale, see `docs/etc/NEW_UI.md` (private notes, not in the public repo).

## Folder Structure

The project is an **nx monorepo**. All Step 1–10 work happens inside the
`ai_detection_viewer_client` Next.js app. The backend app is out of MVP scope.

```
apps/ai_detection_viewer_client/
├── src/
│   ├── app/                # Next.js app router pages
│   │   └── page.tsx        # per-dataset load (COCO: parseCoco→enrich / nuScenes: parseNuScenes, F2-A) → auto-select frame → Header(switcher+badge) + Filters + Viewer2D + <Viewer3D/> + ObjectList + AnalyticsPanel + Timeline. Derives 2D + 3D visible-id sets (∩ distance filter). F2-C: `tracksAcrossFrames` (nuScenes) drives dataset-aware frame-switch selection (keep vs clear) + dataset-aware `Viewer3D` key (stable vs `frame.id`) + an `isPlaying` autoplay timer (nextFrameIndex @ ~2 Hz). F2-D: a page-level `cameraMode` (`'fixed'|'follow'`, nuScenes-only view flag, reset to fixed on dataset switch) + a `nextFrame` memo (the upcoming keyframe) are threaded to Viewer3D for camera-follow + box-tween. **F3:** renders every state (loading / error / empty / loaded) inside `WorkspaceShell` (one slot per pane; the Header stays live so the dataset switcher works while loading or after an error); `ObjectList` gets the 3D visible set; viewer name tags (`label3D` / `label2D`) are chosen from `Frame.source` (Rule #6).
│   │                       # F7: nuScenes comes from a scene catalog (useScenes); page state adds requestedScene,
│   │                       #     search conditions and hit order; three modes (explore | review | evaluate). See
│   │                       #     "Scenes, Chunked Loading and Search (F7)" below.
│   ├── components/
│   │   ├── workspace/      # ✅ F3 — the workspace frame + shared panel look
│   │   │   ├── WorkspaceShell.tsx  # zone layout only (no state): topBar, filterBar, list, main, camera, details, timeline slots + cameraAspect; exports TIMELINE_ROW_HEIGHT_CLASS
│   │   │   ├── Panel.tsx           # PANEL_CLASS, SECTION_TITLE_CLASS, PanelTitle, PanelHeader (32px title row), ViewerLabel (viewer corner tag)
│   │   │   ├── useScrollSelectedIntoView.ts  # ✅ F5 — keep the selected <li> of a scrolling list in view (moved out of ObjectList unchanged; shared with the result list)
│   │   │   └── index.ts            # barrel
│   │   ├── dataset/        # ✅ F7 — loading hooks (they hold results; parsing stays in lib/)
│   │   │   ├── useDataset.ts        # one single-file dataset (COCO): fetch → lib/data/buildFrames; state loading | ready | failed
│   │   │   ├── useScenes.ts         # nuScenes: catalog → the requested scene first → the other scenes in the background (2 at a time);
│   │   │   │                        #   returns {status, error, catalog, onScreen, pending, library, retry}; the previous scene stays
│   │   │   │                        #   on screen until the next is ready; a failed / empty scene never replaces it
│   │   │   ├── useFramePoints.ts    # the current frame's points file (+ N frames ahead), last `keep` kept; inline | ready | loading | failed
│   │   │   └── index.ts             # barrel
│   │   ├── scenes/         # ✅ F7 — choosing the scene
│   │   │   ├── ScenePicker.tsx      # button + ‹ › + list (day / night, drive, "1 drive · N scenes", frames, boxes, one stat per scene)
│   │   │   └── index.ts             # barrel
│   │   ├── explore/        # ✅ F7 — Explore mode UI. Presentation only; all logic is in lib/search
│   │   │   ├── ExploreBar.tsx       # filter slot: condition chips, "+ condition" dialog, presets, "N of M frames match", Reset
│   │   │   ├── ExploreResults.tsx   # list slot: one row per hit (thumbnail, scene, frame, value), order select
│   │   │   ├── SearchPanel.tsx      # details slot: this frame's value per condition, matches per scene, `pinned` slot
│   │   │   └── index.ts             # barrel
│   │   ├── camera/         # ✅ F6 — the six-camera UI (see "Six Cameras (F6)" below)
│   │   │   ├── CameraStrip.tsx      # the thumbnail row: props cameras (CameraThumb {name, imageUrl, marker?, badge?}), activeName, onSelect, shortcutHint?, slots? (fixed cell count). Knows nothing about review / evaluation. + CameraStripPlaceholder (loading)
│   │   │   ├── useActiveCamera.ts   # which camera the large image shows: follows the selection (pickCamera, decided while rendering), setCamera for a manual choice, resetCamera. View state, not a selection (Rule #2)
│   │   │   ├── usePhotoPreload.ts   # fetches a list of photo URLs in the background, 3 at a time (the list comes from lib/cameras/preload).
│   │   │   │                        #   F7: remembers only the last `keep` photos; no start delay when the list's first photo was already requested
│   │   │   └── index.ts             # barrel
│   │   ├── sample-check/   # ✅ F7.5 — the false-alarm sample check (see "Trustworthy Evaluation (F7.5)" below)
│   │   │   ├── useSampleCheck.ts            # derived state only: availability, population → seeded order → sample, summary, the current box (= selectedObjectId)
│   │   │   ├── useSampleCheckController.ts  # useSampleCheck + the actions (enter / exit, open, judge → next unjudged, clear, step, exportFile); SAMPLE_SCOPE; MIN_LOOK_MS
│   │   │   ├── SampleBar.tsx / SampleList.tsx / SamplePanel.tsx / icons.tsx   # filter-bar, list and details slots during the check. Presentation only
│   │   │   └── index.ts
│   │   ├── evaluation/     # ✅ F5 — camera-detection evaluation UI (see "Evaluation (F5)" below). Presentation only; all logic is in lib/evaluation
│   │   │   ├── IouChoice.tsx          # ✅ F7.5 — Min overlap (IoU) 0.3 | 0.5, in the filter bar's `afterMetric` slot
│   │   │   ├── EvaluationReport.tsx   # ✅ F7.5 — the report over the list + 3D view: conditions, totals, false alarms / sample estimate; hosts the two tables
│   │   │   ├── DriveTable.tsx         # ✅ F7.5 — recall per drive (8 rows on the shipped data)
│   │   │   ├── DayNightByDistance.tsx # ✅ F7.5 — day vs night per 10 m band, "night = 1 drive", the distance-mix sentence
│   │   │   ├── ModeSwitch.tsx         # top bar: Explore | Review | Evaluate (type WorkMode; Explore since F7); Evaluate blocked with a reason while practising
│   │   │   ├── EvaluationHeadline.tsx # top bar right: model name + overall Precision / Recall (or "Loading…" / "Predictions unavailable")
│   │   │   ├── EvaluationPanel.tsx    # the details panel in evaluate mode: pinned slot, Precision / Recall with counts, this frame's outcome counts, recall by distance / by class, notes F7: `scope` + the "All scenes" block (SceneScores), `photoNote`.
│   │   │   ├── SelectedResult.tsx     # pinned strip: outcome + class + distance + visibility, and the one-line reason (describeResult); "Not evaluated" for a box outside the evaluation
│   │   │   ├── ResultList.tsx         # the list in evaluate mode: one row per result, outcome chips ("Show"), footer "+ N boxes not evaluated"
│   │   │   ├── OverlayLegend.tsx      # camera legend: "model" (solid) / "label · approx. (projected 3D box)" (dashed)
│   │   │   ├── BoxColorLegend.tsx     # 3D legend: found / missed / not evaluated
│   │   │   ├── icons.tsx              # OutcomeIcon (check / cross / exclamation / dash — four shapes, not only four colours)
│   │   │   ├── SceneScores.tsx        # ✅ F7 — the "All scenes" block: total, recall per scene (row opens the scene), day / night with drives, limits
│   │   │   ├── useSettledValue.ts     # ✅ F7 — a value that follows its input only after it has rested N ms (all-scenes scoring waits for the slider)
│   │   │   ├── predictions-state.ts   # type only: none | loading | ready | failed. (F7: usePredictions.ts removed — predictions arrive with their scene)
│   │   │   ├── useFrameResults.ts     # memoises the per-frame derivations (order, queue, selected result, overlay, 3D colours)
│   │   │   └── index.ts               # barrel
│   │   ├── review/         # ✅ F4 — 3D box review UI (see "Review (F4)" below). Presentation only; all logic is in lib/review
│   │   │   ├── ReviewControls.tsx     # verdict buttons (Approve/Reject/Unsure) + reject reasons + note + queue-done banner; sits ABOVE the details scroll area
│   │   │   ├── EvidenceStrip.tsx      # one line above the buttons: LiDAR point count, visibility, in camera
│   │   │   ├── ReviewProgress.tsx     # top bar: reviewed / total + bar; "Not saved" when storage fails
│   │   │   ├── QueueBar.tsx           # under the list title: order dropdown + "N to review"
│   │   │   ├── ExportMenu.tsx         # top bar: Download JSON / CSV, two-click Reset F7: counts the records of ALL scenes (`scope`), `exportNote` when the file cannot cover everything.
│   │   │   ├── PracticeScoreCard.tsx  # practice mode: found / missed / false alarms, Reveal answers
│   │   │   ├── icons.tsx              # StatusIcon (verdict) + EvidenceBars (LiDAR points) for list rows
│   │   │   ├── labels.ts              # UI wording for verdicts / reasons / block messages
│   │   │   ├── download.ts            # downloadTextFile (Blob + <a download>), UTF8_BOM
│   │   │   ├── useReviewShortcuts.ts  # window keydown → resolveShortcut → page handler
│   │   │   └── index.ts               # barrel
│   │   ├── viewer-2d/      # ✅ Step 2, 5 — 2D image + SVG overlay, selection sync
│   │   │   ├── Viewer2D.tsx    # props: frame, selectedId?, onSelect?, visibleIds?, label?, zoom?, onToggleZoom?, zoomShortcut? (F2-E: bbox label = class only on measured frames; F3: fills its cell, corner tag; F4: Full/Zoom + projected 3D box, see "Review (F4)"; F5: optional `overlay` (ready-made rectangles drawn INSTEAD of the frame's boxes; zoom follows `overlay.focus`) + `legend` — the viewer does not know what the rectangles mean)
│   │   │   └── index.ts        # barrel
│   │   ├── viewer-3d/      # ✅ Step 4, 5 — R3F canvas, point cloud, 3D bboxes, selection sync
│   │   │   ├── Viewer3D.tsx    # props: frame, selectedId?, onSelect?, label?; hosts Canvas (F3: fills its cell, resized not remounted). F5: optional `boxColors` (wire colour per box id, replacing the class colour — recolours only, no remount) + `legend` under the name tag
│   │   │   ├── Scene.tsx       # lights + PointCloud + BBox3D + OrbitControls; passes selection (F5: passes `boxColors.get(id)` to each box)
│   │   │   ├── PointCloud.tsx  # THREE.BufferGeometry via useMemo + dispose; per-vertex depth color (F1-A)
│   │   │   ├── BBox3D.tsx      # EdgesGeometry wireframe + pick mesh (`visible={false}`: never drawn, still raycast — F6.5); selection highlight + hover tint (F1-B); mounts BBoxLabel (F1-C). F5: optional `color` overrides the wire's resting colour (selection white and hover tint still apply; the label pill keeps the class colour)
│   │   │   ├── BBoxLabel.tsx   # ✅ F1-C — drei <Html> info pill (class + confidence) anchored above the box; pointer-events-none
│   │   │   ├── HintBox.tsx     # ✅ Step 9.5 — corner mouse-controls overlay (plain HTML sibling of Canvas; English since F3)
│   │   │   └── index.ts        # barrel
│   │   ├── object-list/    # ✅ Step 6 — detection list panel; selection sync with 2D/3D
│   │   │   ├── ObjectList.tsx  # props: frame, selectedId?, onSelect?, visibleIds?, verdicts?, boxes?, orderKey?, toolbar? (F3: lists every 3D box; measured rows show in-camera icon + distance; 6-char display id. F4: LiDAR evidence bars + verdict icon per row, order supplied by the page, toolbar slot)
│   │   │   └── index.ts        # barrel
│   │   ├── filters/        # ✅ Step 7 — confidence slider + class toggles
│   │   │   ├── Filters.tsx           # props: classes, threshold, visibleClasses, filterMode, maxDistance, callbacks. F5: thresholdLabel / thresholdTitle / defaultThreshold (Reset target) / countNoun — evaluate mode shows the confidence slider as "Min score" resting at 0.25 and counts "results"
│   │   │   ├── ConfidenceSlider.tsx  # 0..1 range input (shown for COCO; F5: also evaluate mode, via `label`)
│   │   │   ├── DistanceSlider.tsx    # ✅ F2-A — metres range input (shown for nuScenes; swapped with ConfidenceSlider by filterMode)
│   │   │   ├── ClassToggles.tsx      # color chips per class
│   │   │   └── index.ts              # barrel
│   │   ├── timeline/       # ✅ Step 8 — the frame row. Two variants: `thumbnails` (COCO) and `scrubber` (nuScenes, F7)
│   │   │   ├── Timeline.tsx     # (F5: optional `badges` Map<frameId, TimelineBadge {text, title?, tone}> → shown instead of the count; evaluate mode passes "N missed" / "no preds") (F4: optional reviewCounts → thumbnail badge "reviewed/total") props: frames, selectedFrameId, onSelectFrame; (F2-C) optional isPlaying/onTogglePlay → play/pause button (nuScenes only); (F2-D-1) optional cameraMode/onToggleCameraMode → Fixed/Follow toggle (nuScenes only). F3: one 84px row (title + Play/Reset/Follow left, 96×56 thumbnails right); badge = detections3D count
│   │   │   │                    # F7: `variant`, `leading` slot (the scene picker), bars from lib/ui/timeline-bars, thumbnail on hover, tone `match`
│   │   │   └── index.ts         # barrel
│   │   ├── header/         # ✅ Step 9.5 Phase 2 — app title + frame meta line
│   │   │   ├── Header.tsx       # props: frameIndex, frameCount, detectionCount, datasetId, onSelectDataset, source?, children?, practiceActive?, practiceRequested?, onTogglePractice?. F3: flush 44px app bar; meta hidden when frameCount is 0 (loading/error). F4: `children` slot at the right (review progress + Export); Practice toggle + "Practice · labels modified" badge; below 1280px the "N detections" text yields when children are present. F5: `modeSwitch` slot after the badge; the practice badge reads "Practice" below 1280px (full text in the tooltip); the left group wraps on phone widths
│   │   │   └── index.ts
│   │   ├── analytics/      # ✅ Step 9.5 Phase 3 — right-rail analytics container
│   │   │   ├── AnalyticsPanel.tsx  # composes Inspector + charts. F4: optional title / headerRight / controls (above the scroll area) / bodyTop (top of the scroll area) slots — the page turns it into the "Review" panel on nuScenes; the panel itself knows nothing about reviews
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
│   │   │   ├── depth-color.ts               # ✅ F1-A — pure depthToColor + depthRange (per-frame z domain)
│   │   │   ├── depth-color.test.ts          # 15 tests (endpoints, monotonic, clamp, degenerate, range)
│   │   │   ├── transforms.ts                # ✅ F2 — global→ego + axis convention z-up→y-up (THREE Quaternion/Matrix4)
│   │   │   ├── transforms.test.ts           # 13 tests — global→ego yaw, axis flip, quaternion order/absent, size reorder
│   │   │   ├── projection.ts                # ✅ F2 — ego→camera + intrinsic; 8-corner AABB; behind-camera/off-screen cull. F4: projectBoxCorners (8 corner pixels, order kept) + BOX_EDGES / BOX_FRONT_FACE; the corner ORDER of boxCornersEgo is now a contract (index = 4·ix + 2·iy + iz; corners 4–7 = front)
│   │   │   ├── projection.test.ts           # 18 tests — known 3D→pixel, behind-camera null, off-screen clamp; F4: corner order, edge table, front face, corners ↔ bbox agreement
│   │   │   ├── camera-zoom.ts               # ✅ F4 — zoomRegion(bbox, imageW, imageH): the image region to show when zooming on one box (image aspect kept, clamped inside the image)
│   │   │   ├── camera-zoom.test.ts          # 8 tests — aspect, containment, 2.4× height, wide boxes, min size, edges, whole-image fallbacks
│   │   │   ├── camera-framing.ts            # ✅ F2-A frameBoxesForCamera() (fit camera to box cloud) + ✅ F2-D-1 selectFollowTarget() (selected box center | null)
│   │   │   ├── camera-framing.test.ts       # 9 tests — framing (center/behind+above/ground-cap/wider→farther) + selectFollowTarget (found/null/absent/empty)
│   │   │   ├── interpolation.ts             # ✅ F2-D-2 — pure lerpVec3 (position) + slerpQuat (rotation) for inter-frame box tween
│   │   │   ├── interpolation.test.ts        # 9 tests — lerp endpoints/midpoint/clamp; slerp endpoints/half-angle/unit-norm/identity
│   │   │   ├── frame-enricher.ts            # orchestrator: enrichFrame() (stamps source:'coco-estimated')
│   │   │   └── index.ts                     # barrel
│   │   ├── nuscenes/       # ✅ F2 (parser+types) — prepped nuScenes static JSON → internal Frame[]
│   │   │   ├── parser.ts                     # ✅ parseNuScenes: prepped JSON → Frame[] (NOT raw relational tables)
│   │   │   ├── parser.test.ts                # 49 tests (F7: + 1.3 frames, points files, wrong-frame rejection) — id share (Rule #1), source/confidence, behind-camera 2D drop, defensive, LiDAR; F4: annotation info (token / LiDAR points / visibility, optional + per-field tolerant), projected corners
│   │   │   ├── types.ts                      # ✅ prepped-JSON schema (nuScenes-native: quat [w,x,y,z], size [w,l,h], global)
│   │   │   ├── catalog.ts                    # ✅ F7 — parseSceneCatalog (scenes.json → SceneCatalog / SceneInfo), isNightDescription
│   │   │   ├── catalog.test.ts               # 8 tests
│   │   │   ├── scene-files.test.ts           # ✅ F7 — 13 tests on the SHIPPED files: 10 / 404 / 18,538 / 2,424; the ten reference frames
│   │   │   │                                 #   still give 349/182/107/180 and 91/83/13/26; all scenes 6,726/5,292/3,514/5,278; night = one drive
│   │   │   ├── test-helpers.ts               # readPublicJson, readReferenceFramesRaw / PredictionsRaw (first ten frames of scene-0916)
│   │   │   └── index.ts                      # barrel
│   │   ├── selectors/      # ✅ Step 7 — pure store derivations
│   │   │   ├── visible-detections.ts        # filter by threshold + visibleClasses (2D ids; + selectVisibleDetectionIds3D for the 3D viewer, F2-A)
│   │   │   ├── visible-detections.test.ts   # 11 tests; locks permissive-empty semantic
│   │   │   ├── distance-filter.ts           # ✅ F2-A — detectionDistance + selectIdsWithinDistance (pure)
│   │   │   ├── distance-filter.test.ts      # 10 tests — magnitude, inclusive boundary, NaN→empty
│   │   │   ├── confidence-buckets.ts        # ✅ Step 9.5 Phase 3 — histogram buckets (BUCKET_COUNT=10)
│   │   │   ├── confidence-buckets.test.ts   # 7 tests; locks bucket count + boundary rules
│   │   │   ├── class-counts.ts              # ✅ Step 9.5 Phase 3 — class → count map (first-appearance order). F3: counts detections3D (was detections2D)
│   │   │   ├── class-counts.test.ts         # 7 tests; locks key-by-class + iteration order + 3D basis (3D-only boxes counted, 2D ignored)
│   │   │   ├── frame-has-confidence.ts      # ✅ F2-E — frameHasConfidence(frame): is `confidence` a real score? (false on measured frames, Rule #6)
│   │   │   ├── frame-has-confidence.test.ts # 3 tests; coco / absent source → true, nuscenes-measured → false
│   │   │   └── index.ts                     # barrel
│   │   ├── ui/             # ✅ Step 9 — shared UI-layer constants (no React/Zustand/Three.js)
│   │   │   ├── class-colors.ts              # CLASS_COLORS map (+truck/bus/motorcycle F2-A), getClassColor(), DEFAULT_COLOR, SELECTED_COLOR
│   │   │   ├── distance.ts                  # ✅ F2-A — DISTANCE_MAX / DISTANCE_STEP (distance-filter slider + store default)
│   │   │   ├── display-id.ts                # ✅ F3 — displayId(id): first 6 chars of a long id (nuScenes token), short ids (COCO) unchanged. Display only (Rule #1)
│   │   │   ├── display-id.test.ts           # 5 tests — 32-char → 6, COCO unchanged, ≤8 kept, >8 shortened, empty
│   │   │   ├── class-label.ts               # ✅ after F6 — classLabel(name): short display name of an unmapped class ("static_object.bicycle_rack" → "bicycle_rack"); used by the filter chips, full name kept as tooltip
│   │   │   ├── class-label.test.ts          # 4 tests
│   │   │   ├── timeline-bars.ts             # ✅ F7 — timelineBars(frames, {reviewCounts, badges}) → one bar per frame (height, tone); timelineTicks
│   │   │   ├── timeline-bars.test.ts        # 15 tests
│   │   │   └── image-overlay.ts             # ✅ F5 — types only: ImageRect {key, bbox, color, dashed, emphasis, caption?, selectId?}, ImageOverlay {rects, focus}. The contract between "what to draw" (lib/evaluation/overlay) and Viewer2D
│   │   ├── data/           # ✅ F5-0 — loading helpers
│   │   │   ├── fetch-json.ts                # fetchJson(url, {signal, fetchImpl}): rejects with "HTTP <status> while loading <url>" on a non-2xx answer (used for the dataset AND the predictions)
│   │   │   ├── fetch-json.test.ts           # 5 tests
│   │   │   ├── build-frames.ts              # ✅ F7 — buildFrames(kind, raw, {practice?}) → {frames, planted}: the parse / enrich pipeline out of page.tsx
│   │   │   ├── build-frames.test.ts         # 6 tests
│   │   │   ├── bounded-cache.ts             # ✅ F7 — BoundedCache<K, V>: keeps the most recently used N entries (points, preloaded photos)
│   │   │   └── bounded-cache.test.ts        # 10 tests
│   │   ├── cameras/        # ✅ F6 — reading a frame through its cameras, all pure. See "Six Cameras (F6)" below
│   │   │   ├── names.ts          # DEFAULT_CAMERA, CAMERA_DISPLAY_ORDER (BL FL F FR BR B), cameraShortName, inDisplayOrder
│   │   │   ├── views.ts          # cameraViews, frameAsCamera, camerasSeeing, camerasByObject, detectionInCamera, hasCamera, defaultCameraName, SINGLE_VIEW
│   │   │   ├── pick.ts           # visibleFraction, camerasByBestView, bestViewsByObject, pickCamera, stepCamera
│   │   │   ├── preload.ts        # preloadOrder(frames, index, framesAhead); F7: upcomingFrames(frames, index, ahead), shared with the points loader
│   │   │   ├── test-helpers.ts   # view / multiCameraFrame / singleImageFrame / cornersOf builders
│   │   │   ├── *.test.ts         # 62 tests — names 7, views 18, pick 20, preload 8, sample-data 9 (the shipped file: 60 photos, boxes per camera, seen by 1 / 2 / 0 cameras)
│   │   │   └── index.ts          # barrel
│   │   ├── evaluation/     # ✅ F5 — camera-detection evaluation, all pure (no React / Zustand / DOM). See "Evaluation (F5)" below
│   │   │   ├── types.ts          # Prediction2D (id `pred:<frame>:<index>`, `score`), PredictionSet, EvaluationRules, EvalResult (found / missed / false-alarm / not-scored), FrameEvaluation, EvalSummary
│   │   │   ├── parse.ts          # parsePredictions (null for a wrong root; malformed items skipped), predictionId, isPredictionId
│   │   │   ├── iou.ts            # iou(a, b)
│   │   │   ├── classes.ts        # EVALUATED_CLASSES, toEvaluatedClass (model class → app class | null)
│   │   │   ├── match.ts          # evaluateFrame (greedy, same class, IoU ≥ IOU_THRESHOLD 0.3; visibility v0-40 not scored), DEFAULT_MIN_SCORE 0.25, findResult, selectionIdOf, countResults
│   │   │   ├── metrics.ts        # ratio (null when the denominator is 0), precisionOf, recallOf, summarize (totals + recall by 10 m band + by class)
│   │   │   ├── evaluate.ts       # evaluateFrames(frames, predictionSet, rules): per-frame map + summary; a frame with no entry in the file is left out (not "all missed")
│   │   │   ├── scenes.ts         # ✅ F7 — evaluateScenes(scenes, rules) → per scene, total, day / night (with the number of drives). F7.5: + byDistance, scoredObjects, combineScores
│   │   │   ├── unlabelled.ts     # ✅ F7.5 — isUnlabelledFalseAlarm, listUnlabelledFalseAlarms (fixed order: scene → frame → camera → result)
│   │   │   ├── drives.ts         # ✅ F7.5 — summarizeDrives(sceneScores): one row per drive, oldest first
│   │   │   ├── distance-compare.ts # ✅ F7.5 — compareByDistance(a, b, {minLabels}) (rows + standardised recall), distanceGap
│   │   │   ├── iou-choices.ts    # ✅ F7.5 — IOU_CHOICES [0.3, 0.5], BENCHMARK_IOU, describeIouChoice
│   │   │   ├── model-info.ts     # ✅ F7.5 — describeWeights (release file name → "not fine-tuned"), describeModelConditions
│   │   │   ├── outcomes.ts       # EVAL_KINDS (display order), OUTCOME_LABEL / HINT / COLOR, NOT_EVALUATED_COLOR, CONTEXT_COLOR, countOf, formatPercent (null → "—")
│   │   │   ├── list.ts           # orderResults, ResultFilter, isResultVisible, resultQueue (ids J / K walk)
│   │   │   ├── overlay.ts        # buildOverlay → ImageOverlay (labels dashed, model boxes solid, outcome colours, companion box, focus), unionBox
│   │   │   ├── describe.ts       # describeResult (the one-line reason), visibilityText
│   │   │   ├── box-colors.ts     # boxOutcomeColors(frame, evaluation): colour of every 3D box (found / missed / grey)
│   │   │   ├── test-helpers.ts   # box / makeFrame / makePrediction builders
│   │   │   ├── *.test.ts         # 207 tests after F6 and its follow-up fix (139 after F5): + per-photo / per-object evaluation, the bicycle-rack rule, predictions@1 and @2, six-camera numbers of the shipped sample. F5 breakdown was: iou 8, classes 5, parse 11, match 30, metrics 10, evaluate 6, outcomes 6, list 11, overlay 21, describe 9, box-colors 6, sample-data 16 (the SHIPPED files: 91 found / 83 missed / 13 false alarms / 26 not scored)
│   │   │   └── index.ts          # barrel
│   │   ├── sampling/       # ✅ F7.5 — drawing and reporting a sample, all pure. See "Trustworthy Evaluation (F7.5)" below
│   │   │   ├── order.ts          # SAMPLE_SEED, drawOrder(items, seed) (seeded Fisher–Yates), sampleOf(order, n) = the first n
│   │   │   ├── estimate.ts       # estimateShare(count, judged, population) → share + 95 % Wilson interval with finite-population correction; null when nothing judged
│   │   │   ├── sample-check.ts   # SampleVerdict ↔ review Verdict, summarizeSample, nextUnjudged, stepInSample, sampleSizeForRecords, SAMPLE_SIZES
│   │   │   ├── availability.ts   # sampleAvailability(scenes): ready only when EVERY scene is loaded with predictions
│   │   │   ├── describe.ts       # the wording: "41 of 100 sampled boxes → about 32–50% of all 1,452"; verdict labels / hints
│   │   │   ├── export.ts         # buildSampleExport → `ai-detection-viewer/false-alarm-sample@1`
│   │   │   └── *.test.ts         # 71 tests incl. the shipped data (population 1,452, same at IoU 0.5, the first five sampled boxes)
│   │   ├── review/         # ✅ F4 — review logic, all pure (no React / Zustand / DOM). See "Review (F4)" below
│   │   │   ├── types.ts          # Verdict, RejectReason (+ REJECT_REASONS order = keys 1–6), ReviewRecord, ReviewMap, ReviewScope
│   │   │   ├── records.ts        # reviewKey, getReview, withVerdict / withReasonToggled / withNote / withoutReview (return the SAME map on a no-op)
│   │   │   ├── progress.ts       # countFrameReviews, summarizeProgress, verdictsOfFrame (walk the data's boxes; stale records ignored)
│   │   │   ├── queue.ts          # orderBoxes (scene / evidence / camera), buildQueue (filtered), stepInQueue, nextUnreviewed, nextFrameWithUnreviewed (filter-aware)
│   │   │   ├── evidence.ts       # evidenceLevel / isWeakEvidence from the LiDAR point count (WEAK_EVIDENCE_MAX_POINTS = 4)
│   │   │   ├── availability.ts   # getReviewBlock: playing / no-selection / not-in-frame / hidden
│   │   │   ├── shortcuts.ts      # resolveShortcut(event) → ReviewAction | null; isTypingTarget; SHORTCUT_KEYS
│   │   │   ├── export.ts         # buildReviewExport, reviewExportToJson / ToCsv, reviewExportFilename. F7: buildSceneReviewExport → format review@2 (a `scene` on every row)
│   │   │   ├── persisted.ts      # sanitizeReviews: validate what was read back from storage
│   │   │   ├── practice.ts       # makePracticeSet (seeded box errors on the RAW prepped data) + scorePractice
│   │   │   ├── test-helpers.ts   # makeBox / makeFrame builders for the tests below
│   │   │   ├── *.test.ts         # records 16, progress 7, queue 30, evidence 10 (evidence + availability + verdictsOfFrame), shortcuts 19, export 17, persisted 9, practice 24
│   │   │   └── index.ts          # barrel
│   │   ├── scenes/         # ✅ F7 — which scenes to load, and loading one. Pure apart from the injected fetch
│   │   │   ├── load-order.ts     # SCENE_LOAD_CONCURRENCY (2), scenesToRequest (requested scene first, then catalog order), stepScene (wraps), countSceneStates
│   │   │   ├── load-scene.ts     # loadScene(scene, {signal, fetchImpl}) → frames + predictions in parallel, never rejects; loadPracticeScene
│   │   │   ├── *.test.ts         # 29 tests — load-order 20, load-scene 9
│   │   │   └── index.ts          # barrel
│   │   ├── search/         # ✅ F7 — search conditions, all pure (no React / Zustand / DOM). See "Explore mode and search"
│   │   │   ├── conditions.ts     # SearchCondition (objects | no-lidar | model | time), conditionValue, conditionBoxIds, matchesCondition,
│   │   │   │                     #   highlightedBoxIds, needsEvaluation, normalizeCondition, describeCondition / describeValue, sameCondition, resultsForConditions
│   │   │   ├── search.ts         # searchScenes → SearchResult {hits, frames, byScene, scenesWithMatches}, sortHits, stepHit, SEARCH_PRESETS (5)
│   │   │   ├── *.test.ts         # 49 tests — conditions 29, search 20 (incl. the shipped data: 177 frames / 7 scenes, 135 frames)
│   │   │   └── index.ts          # barrel
│   │   ├── sequence/       # ✅ F2-C — keyframe-sequence playback logic (pure; no React/Three.js)
│   │   │   ├── autoplay.ts                   # nextFrameIndex(index, count, {loop}) + AUTOPLAY_INTERVAL_MS (~2 Hz)
│   │   │   ├── autoplay.test.ts              # 8 tests — advance, loop-wrap, stop-at-end, not-found→0, single/empty/stale
│   │   │   └── index.ts                      # barrel
│   │   └── types/          # Frame, Detection2D, Detection3D, Point3D
│   └── store/          # ✅ Step 3 — Zustand stores
│       ├── viewer-store.ts        # UI state only (selection, filters). Never persisted
│       ├── viewer-store.test.ts
│       ├── review-store.ts        # ✅ F4 — review records, persisted to localStorage (zustand `persist`, skipHydration, safe storage wrapper)
│       ├── review-store.test.ts   # 19 tests — actions, scope isolation, no-op = no notify, save/load/validate, storage full / blocked / recovered
│       └── index.ts        # barrel
├── tests/
│   └── integration/        # ✅ Step 5, 8 — cross-module contract tests
│       ├── selection-sync.test.ts  # 5 tests
│       └── frame-switch.test.ts    # 3 tests — Edge_#5 Case 6 contract
├── public/
│   └── sample-data/        # sample COCO JSON + frame images
│       ├── sample.json
│       ├── frame_001.jpg ~ frame_010.jpg
│       └── nuscenes/       # ✅ F2 — offline-generated (scripts/prep_nuscenes.py). F7: all of nuScenes-mini, split files
│           ├── scenes.json           # ✅ F7 — the catalog (10 scenes): name, description, log, frameCount, boxCount, file paths
│           └── scenes/<scene>/       # ✅ F7 — per scene (format 1.3). 3,253 files, 152.49 MB in total
│               ├── frames.json       #   boxes + six cameras per frame; points are NOT here (lidar: {path, pointCount})
│               ├── predictions.json  #   predictions@2 — YOLOv8n on the ORIGINAL 1600×900 photos
│               ├── points/           #   one self-contained points file per frame
│               ├── cam_<channel>/    #   six photos per frame, 960×540 WebP
│               └── thumb/            #   front camera, 192×108 WebP
│                                     # (F2–F6: one nuscenes.json + predictions.json + cam_*/ jpgs for ten frames — removed in F7.)
└── vitest.config.ts        # include: src/**/*.test.ts + tests/**/*.test.ts

scripts/                    # ✅ F2 — offline, build-time only (repo root, like Step 11's
  prep_nuscenes.py          #   generate_predictions.py). Stdlib-only (NO nuscenes-devkit/numpy): JOINs
                            #   the nuScenes-mini tables (sample/sample_data/ego_pose/calibrated_sensor/
                            #   sample_annotation/instance/category) → public/sample-data/nuscenes/.
                            #   F2-B: also decodes LIDAR_TOP .pcd.bin (struct, 5×float32/pt) and
                            #   voxel-grid decimates it. Copies RAW values only, no coordinate math
                            #   (Rule #3; decimation is subsampling, not a transform). NOT a runtime backend.
                            #   F4: also copies per-box annotationToken / numLidarPts / visibility level (format 1.1).
                            #   Re-running is deterministic (verified: output identical apart from the new fields).
                            #   F6: exports all six cameras per frame as cameras[] (photo + its own ego_pose + calibration; format 1.2)
                            #   and copies their photos into cam_<channel>/. Still no coordinate math. Run twice → identical file.
                            #   F7: exports ALL scenes of the download as split files (scenes.json + scenes/<scene>/…, format 1.3):
                            #   frames without points, one points file per frame, photos reduced to 960×540 WebP and a 192×108
                            #   thumbnail (needs Pillow — the only non-stdlib import). Options --scenes, --out, --skip-photos.
                            #   Still no coordinate math. Run twice → identical files.
  predict_nuscenes.py       # ✅ F5 — runs YOLOv8n (ultralytics, CPU, imgsz 1280, conf 0.05) on the images listed in
                            #   nuscenes.json and writes predictions.json. Copies the model's output only: no class
                            #   filtering, no scoring (that is lib/evaluation's job, Rule #3). No timestamp in the file;
                            #   re-running is deterministic (verified: byte-identical). NOT a runtime backend.
                            #   F6: runs every camera's photo listed in nuscenes.json (60) and writes format predictions@2.
                            #   F7: reads scenes.json, opens the ORIGINAL photos (image.source under --dataroot) and writes one
                            #   predictions.json per scene. Options --data, --dataroot, --scenes.
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
  // (F2 ✅ added; UI badge pending) Provenance of the 3D data. Drives the UI
  // "Estimated" vs "Measured" badge so we never misrepresent depth source
  // (Immutable Rule #6 honored across datasets, not dropped). COCO frames =
  // 'coco-estimated'; nuScenes frames = 'nuscenes-measured'. Optional, so
  // existing COCO frames (which omit it) are unaffected.
  source?: 'coco-estimated' | 'nuscenes-measured';
  // (F6) Every camera that photographed the frame, default camera first. nuScenes
  // only; absent on COCO. INVARIANT: cameras[0] IS the view in the top-level
  // image fields above (detections2D is the same array). So on a nuScenes frame
  // `detections2D` means "the default camera's boxes" — use lib/cameras for
  // anything about another camera or all of them. See "Six Cameras (F6)".
  cameras?: CameraView[];
};

// (F6) One camera's photo of a frame, with the frame's 3D boxes projected into it.
type CameraView = {
  name: string;      // camera channel, e.g. "CAM_FRONT_LEFT"
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  detections2D: Detection2D[];   // same ids as the 3D boxes (Rule #1), also when two cameras see one object
};

type Detection2D = {
  id: string;        // shared with Detection3D.id
  class: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  // (F4) Pixel positions of the 3D box's 8 corners in this image, in the corner
  // order of `boxCornersEgo` (4–7 = front face). Only on PROJECTED 2D boxes
  // (nuScenes); `bbox` is then the rectangle around these points. Not clamped.
  corners?: [number, number][];
};

type Detection3D = {
  id: string;        // shared with Detection2D.id
  class: string;
  confidence: number;
  bbox3D: {
    center: [number, number, number];
    size: [number, number, number];
    // (F2 ✅ added) Orientation as a quaternion [x, y, z, w] (Three.js order).
    // Absent = no rotation (identity), so existing COCO estimated boxes stay
    // valid and F1 tests don't break. Three.js + nuScenes are quaternion-native
    // (nuScenes stores [w,x,y,z]; the parser reorders). See domain-glossary.
    rotation?: [number, number, number, number];
  };
  // (F4) Facts the DATASET records about this box's annotation — what a reviewer
  // needs besides geometry. nuScenes only; every field optional (format-1.0
  // sample files lack them; a wrong-typed value drops only that field).
  annotation?: {
    token?: string;        // sample_annotation.token — unique per box per frame (`id` repeats across frames)
    lidarPoints?: number;  // num_lidar_pts — counted by nuScenes on the ORIGINAL sweep, not our decimated cloud
    visibility?: 'v0-40' | 'v40-60' | 'v60-80' | 'v80-100';  // nuScenes bins: the object as a whole, across all 6 cameras (not one photo)
  };
};

type Point3D = {
  x: number;
  y: number;
  z: number;
  // (F2-B) Optional. COCO's estimated points set it (generatePointCloud) so they
  // filter by their owning bbox (Step 7 / Edge_#4 Case 5). Real LiDAR points
  // (nuScenes) have NO detectionId — they are environment, not owned by any one
  // detection — and are always shown (selectVisiblePoints).
  detectionId?: string;
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
(F4 adds a SECOND store, `review-store`, for review records — the only persisted state. It holds no
selection: see "Review (F4)".)

**F7 — nuScenes no longer arrives as one file.** The pipeline above is still what turns raw JSON
into `Frame[]` (`lib/data/buildFrames`), but it runs per scene, and the frames of a scene arrive
without their point cloud: scene catalog → the scene on screen → the other scenes in the background;
points and photos per frame, a few frames ahead. Frame data still lives in React state at the page
level (inside the `useScenes` / `useFramePoints` hooks); the store is unchanged. See "Scenes, Chunked
Loading and Search (F7)".

## Zustand Store Schema

```ts
type ViewerStore = {
  selectedFrameId: string | null;
  selectedObjectId: string | null;     // shared between 2D and 3D
  confidenceThreshold: number;         // 0.0 ~ 1.0
  visibleClasses: Set<string>;
  maxDistance: number;                 // F2-A — metres; nuScenes distance filter. Default DISTANCE_MAX (90, "off"). Inert on COCO (no distance slider shown).

  setSelectedFrame: (id: string) => void;
  setSelectedObject: (id: string | null) => void;
  setConfidenceThreshold: (v: number) => void;
  toggleClass: (className: string) => void;
  setMaxDistance: (v: number) => void; // F2-A
  resetFilters: () => void;            // Step 9.5 Phase 2 — restore filters to defaults (incl. maxDistance → DISTANCE_MAX)
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
| `setMaxDistance` | finite number | clamp to `[0, ∞)` (`Math.max(0, v)`) |
| `setMaxDistance` | `NaN` / `±Infinity` | `console.warn`, keep previous value (mirrors confidence; NaN would hide every box) |
| `resetFilters` | — | atomic: sets `confidenceThreshold = 0`, `visibleClasses = new Set()`, `maxDistance = DISTANCE_MAX`; selection slice untouched |

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

> **Note (F1-A finding).** The estimator compresses typical COCO detections toward the FAR
> end: `z = MAX_Z − areaRatio·(MAX_Z−MIN_Z)`, and COCO objects are small relative to the
> image, so on the sample data ~85% of detections land in `z∈[7,8]`. Depth-color therefore
> does NOT color over the fixed `[MIN_Z, MAX_Z]` (that used only the top ~15% of the ramp and
> looked flat); it fits the ramp per frame to the frame's actual point-z range. See the
> PointCloud contract and Edge_F#1.

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
- Use `instancedMesh` if rendering many similar 3D bboxes. (Not used so far. Re-measured at 40 boxes
  in F6.5: no hot spot. Re-measured in F7 on the largest frame, 156 boxes, one draw call per box:
  integrated GPU 60 fps / 159 ms of JS per second at idle, software GL 53 fps / 583 ms. Merging the
  box lines into one draw call is a recorded follow-up, not done — Edge_F#7 "Measured and NOT changed".)
- **Compare builds in one session.** Absolute idle numbers on the development machine drift by
  several times between days (the pre-F7 build measured 57 ms/s on the frame recorded as 34 ms/s in
  F6.5). To say "no regression", build the previous commit next to the new one and measure them
  alternately (F7: `git archive` into a temporary folder, second port).
- **A pick-only mesh is `visible={false}`, never "transparent with `opacity={0}`"** (F6.5). The
  raycaster ignores `visible` (it tests layers and geometry) and still reads `material.side`, so
  clicks and hover work on a mesh that is never drawn. `opacity: 0` is still drawn, still writes
  depth (it erased the grid behind boxes), and costs draw calls.
- **Avoid `transparent` + `side={DoubleSide}` on anything drawn per object, every frame.** three.js
  draws such a material in two passes and sets `needsUpdate` before each, so the shader program is
  re-evaluated twice per object per frame (`getParameters` / `getProgramCacheKey`) even though
  nothing changed. If a transparent double-sided material is really needed, set
  `forceSinglePass`. Measured: 40 such meshes were 78% of the idle JS time on nuScenes. See
  Edge_F#6.5 Case 1.
- **Performance claims come from the production build**, at idle and per interaction, with the
  environment stated (software GL vs GPU). `renderer.info.render.calls` and a material's `version`
  growing while nothing changes are the two cheap signals (how to read them: HANDOFF §8).

<!-- KO (move to a localized file)
- `instancedMesh`: 비슷한 3D 박스가 많으면 쓴다. (아직 쓰지 않았다. F6.5에서 박스 40개로 다시 쟀는데 두드러진 비용이
  없었다. F7에서 가장 큰 프레임(박스 156개, 박스마다 그리기 호출 1번)을 쟀다: 내장 GPU 60 fps / 가만히 있을 때 JS 초당
  159 ms, 소프트웨어 렌더링 53 fps / 583 ms. 박스 선을 한 번에 그리도록 합치는 일은 후속 작업으로 적어 두고 하지 않았다.)
- **빌드끼리 비교할 때는 같은 자리에서 번갈아 잰다.** 이 컴퓨터의 절대 숫자는 날마다 몇 배씩 달라진다(F6.5에서 34 ms/s로
  적은 프레임을 F7 이전 빌드로 다시 재니 57 ms/s였다). "느려지지 않았다"고 말하려면 이전 커밋을 따로 빌드해 번갈아 잰다.
- **클릭만 받는 mesh는 `visible={false}`로 한다. "투명 + `opacity={0}`"으로 안 보이게 하지 않는다** (F6.5).
  클릭 판정(raycaster)은 `visible`을 보지 않고 `material.side`는 읽으므로, 그리지 않는 mesh도 클릭과 마우스 올림을 받는다.
  `opacity: 0`은 여전히 그려지고, 깊이 값을 쓰고(박스 뒤 격자를 지웠다), 그리기 호출을 쓴다.
- **매 프레임 객체마다 그리는 것에 `transparent` + `side={DoubleSide}`를 함께 쓰지 않는다.** three.js는 그런 재질을 두 번에
  나눠 그리고 그때마다 `needsUpdate`를 켠다. 바뀐 것이 없어도 객체마다 프레임당 두 번 셰이더 정보를 다시 따진다.
  꼭 필요하면 `forceSinglePass`를 켠다. 측정: 그런 mesh 40개가 nuScenes에서 가만히 있을 때 JS 시간의 78%였다. Edge_F#6.5 Case 1.
- **성능에 관한 말은 배포용 빌드에서 잰 값으로 한다.** 가만히 둔 상태와 조작별로 재고, 환경(소프트웨어 렌더링인지 GPU인지)을
  함께 적는다. 값싼 신호 두 가지: `renderer.info.render.calls`, 그리고 아무것도 바뀌지 않는데 올라가는 재질의 `version`
  (읽는 방법은 HANDOFF 8장).
-->

## 3D Viewer Component Contract

```ts
type Viewer3DProps = {
  frame: Frame;           // must be enriched (has detections3D + pointCloud)
  selectedId?: string | null;              // highlights the matching bbox (Step 5)
  onSelect?: (id: string | null) => void;  // wire to store.setSelectedObject in Step 5
  visibleIds?: Set<string>;                // Step 7 — filters out hidden bboxes + points
  label?: string;                          // F3 — corner name tag (page passes it from Frame.source)
};
```

**F3:** the `Viewer3D` wrapper is `w-full h-full` (was `aspect-[4/3]`) — the `WorkspaceShell` cell
decides its size. A cell resize resizes the existing `<Canvas>` through R3F's ResizeObserver; it does
NOT remount it (no `key` change), so the GPU-resource concern of Edge_#4 Case 4 does not reopen.
Render-verified 2026-11-25: the same `<canvas>` element survived five window resizes, including a
switch to the narrow stacked layout.

| Component | Responsibility |
|---|---|
| `Viewer3D` | Hosts R3F `<Canvas>`. Camera is one-time init; never remounts unless `key` changes (**F2-C:** the `key` is dataset-aware — COCO uses `frame.id` so it remounts/resets per frame as before, nuScenes uses one stable key so the Canvas + OrbitControls persist across frames and autoplay; the nuScenes framing is also **frozen to the mount frame** via `useRef`+`useMemo` so the OrbitControls `target` doesn't re-aim each frame. Extension seam for camera-follow: pass the selected box center as `target` per frame. See Edge_F#2 Case 6). `onPointerMissed` deselects. Also mounts `<HintBox>` as a `<Canvas>` sibling for the corner controls overlay. **F1-A:** `<Canvas flat>` disables ACES tone mapping so the point-cloud depth colors (and bbox wires) render with true, un-desaturated color — verified by screenshot, see Edge_F#1 Case 3. **F2-A:** the camera is **dataset-aware**. COCO keeps `position=[0,0,-10]` looking +z with `far=100`. nuScenes (`frame.source==='nuscenes-measured'`) fits the camera to the measured box cloud via `frameBoxesForCamera(centers)` (behind+above, looking forward/−z), widens `far=600`, and passes `target`+`fog={false}` to `Scene`. Without this the COCO camera faces away from the nuScenes cloud and the COCO fog occludes it — see Edge_F#2 Case 3. **F2-D-1 (camera follow):** with `cameraMode='follow'` the OrbitControls `target` is `selectFollowTarget(frame.detections3D, selectedId)` — the selected box's CURRENT center, recomputed each frame so it tracks the moving box (snap). When it returns `null` (no selection / object absent in this frame) `target` falls back to the frozen framing — follow degrades to the F2-C fixed camera, never aiming at empty space. The camera POSITION stays the one-time init, so the view stays 3rd-person/orbitable (only the pivot tracks). **F2-D-2:** passes `nextFrame` + `playing` to `Scene` for the box tween. Both are nuScenes-only; COCO gets the defaults (fixed, no tween). See Edge_F#2 Case 7. |
| `Scene` | Camera **target** (prop; default COCO `[0,0,SCENE_CENTER_Z]`, nuScenes = fitted target), lighting (ambient + hemisphere + directional), `<Grid>` floor, optional `<fog>` for depth (prop `fog`, default on; nuScenes passes `false`), and scene root. The `<Grid>` mesh's `raycast` is no-oped at mount so it does not hijack `<Canvas onPointerMissed>` — without that, empty-space deselect from Step 5 silently breaks. See Edge_#9.5 Case A. Passes `isSelected`/`onClick` to each `BBox3D`. OrbitControls `rotateSpeed=0.5 / zoomSpeed=0.6 / panSpeed=0.6` are tuned here. **F2-D-2:** builds a memoized `Map<instanceId, bbox3D>` from `nextFrame.detections3D` (the upcoming keyframe) and passes each `BBox3D` its own `nextCenter`/`nextRotation` (or `undefined` if the object has no next match → hold pose), plus `playing` (gates the tween) and `frameId` (resets the per-box tween clock on a keyframe switch). |
| `PointCloud` | `THREE.BufferGeometry` + `THREE.Points`. Memoizes geometry; disposes on change/unmount. **F1-A:** each point carries a per-vertex `color` attribute from `depthToColor(z, zMin, zMax)` (`lib/geometry/depth-color.ts`); `<pointsMaterial vertexColors>` with a white base (multiplicative identity) shades each point by depth. The `[zMin, zMax]` domain is `depthRange(points)` fit to the **full frame** point-z range (computed pre-filter, so class toggles do NOT recolor — only frame switches do). The visible set comes from `selectVisiblePoints(points, visibleIds)`, and the color attribute rides the same geometry the dispose `useEffect` already cleans up. Base point `size` is `0.2` (with `sizeAttenuation`) and palette is **cyan→violet**; both were finalized by render verification (smaller points / dark-far-end / ACES tone mapping all made the gradient invisible). See Edge_F#1 Case 3. **F2-B:** the cloud is now real LiDAR for nuScenes frames (COCO stays estimated). `selectVisiblePoints` (in `lib/selectors`, pure) keeps points whose `detectionId` is in `visibleIds` (COCO's owned points) AND **always keeps points with no `detectionId`** (LiDAR environment points), so the box filters (distance slider / class toggles) never thin the measured cloud. Real `z` drives the depth color; `size`/decimation density were render-verified legible at the nuScenes scale (Edge_F#2 Case 4). |
| `BBox3D` | `THREE.EdgesGeometry` wireframe + invisible click mesh. **F6.5:** that pick mesh is `visible={false}` with `<meshBasicMaterial side={DoubleSide} />` — it is never drawn, and the raycaster (which ignores `visible` and reads `side`) still hits it from outside and from inside. It used to be drawn with `transparent opacity={0}`, which cost two draw calls and two shader-program re-evaluations per box per frame (Edge_F#6.5). White color + scale pulse when selected. **F1-B:** `onPointerOver`/`onPointerOut` on the same invisible mesh drive a local `hovered` state; a non-selected hovered box renders a lightened class tint (`THREE.Color(classColor).lerp(white, 0.6)`) + a static `1.06` scale (no pulse — kept distinct from the selected white+pulse look, whose scale stays in `0.96–1.04`; selection wins when both apply). Tint/scale strengths were render-verified (the initial `0.45`/`1.02` barely read on the near-black bg with 1px wires). Cursor → `pointer` while hovered via an effect whose cleanup also fires on unmount, so a hovered box that disappears (frame switch / filtered out) before `onPointerOut` still resets the cursor. Hover is 3D-local only — no store field, no 2D/ObjectList sync (Immutable Rule #2). See Edge_F#1 Case 4. **F1-C:** split into an outer (position-only) group and an inner (pulse/hover-scaled) group; when `isSelected || hovered`, mounts `<BBoxLabel>` on the OUTER group at the box top (`size.y/2 + pad`) so the selected-box pulse doesn't jitter the label anchor. **F2-A:** the inner group also carries `quaternion={bbox3D.rotation ?? [0,0,0,1]}` — measured nuScenes boxes render at their real heading; absent (COCO) → identity, so estimated boxes / F1 are unchanged. Rotation and the uniform pulse/hover scale compose independently; the label stays on the unrotated outer group so it hangs upright. **F2-D-2 (box tween):** the outer-group position and inner-group quaternion are now driven imperatively in `useFrame` (the JSX `position`/`quaternion` are kept only as first-render seeds). While `playing` AND a `nextCenter` exists, the box GLIDES from its current measured pose toward the next keyframe's pose — `lerpVec3` on position, `slerpQuat` on rotation — with `t = (elapsed − keyframeStart) / AUTOPLAY_INTERVAL_MS` clamped to `[0,1]`; the per-box clock resets on each `frameId` change (and on a play restart), so a tween always begins exactly on a measured pose. When NOT playing (paused / scrubbed) or with no next match, it shows the EXACT measured pose (Rule #6 — interpolated in-between poses are never shown as a static state). |
| `BBoxLabel` | **F1-C:** drei `<Html>` info pill anchored to a 3D point, re-projected each frame so it tracks the box as the camera orbits/zooms. Constant on-screen size (no `distanceFactor`). Shows class-color dot + class + `confidence` as a percent (**F2-E:** `confidence` is optional; `BBox3D` passes `undefined` when `Scene`'s `frameHasConfidence(frame)` is false — measured frames — so the pill shows the class alone instead of a placeholder "100%", Rule #6). `pointer-events-none` on both the `<Html>` container and the inner node so empty-space clicks still reach `<Canvas onPointerMissed>` (deselect). `occlude` OFF for F1. Shown only for selected/hovered boxes (≤2 at once) to avoid clutter; it's an in-scene complement to `SelectedObjectInfo`, not a replacement. See Edge_F#1 Case 5. |
| `ObjectList` | **F3 (supersedes "raw detections" below):** lists every `detections3D` box, not `detections2D` — on nuScenes most boxes have no camera projection (Edge_F#2 Case 1) and were otherwise reachable only by clicking in 3D; `visibleIds` is the 3D visible set. Measured rows (`frame.source==='nuscenes-measured'`) show a camera icon (box has a 2D projection with the same id, Rule #1) and the distance from the ego vehicle (`detectionDistance`, the distance filter's own function) in place of the old "—"; COCO rows keep the confidence gauge. The id cell shows `displayId(id)` (6 chars) with the full id as a tooltip. Header row = `PanelHeader` ("OBJECTS 40" + "13 in camera"); rows are 32px. Original contract: Non-spatial selection panel. Shows all raw detections (class, confidence, id). Clicking a row sets `selectedObjectId`. Selected row highlighted with bg + ring. **Phase 2:** confidence rendered as a sky-tinted gauge bar (**F2-E:** gauge + number replaced by "—" when `frameHasConfidence(frame)` is false — the measured 1.0 is a placeholder, Rule #6); on `selectedId` change the selected row is scrolled into view by manually adjusting the `<ul>` `scrollTop` (NOT `Element.scrollIntoView` — that propagates to outer scroll containers and can move the page; see Edge_#9.5 Case C). |

`Viewer3D` receives an enriched `Frame` (output of `enrichFrame`). It does NOT call `enrichFrame` —
coordinate math is `lib/geometry/`'s responsibility.

Selection highlight: selected BBox3D renders in white (`#ffffff`) and pulses via `useFrame`
(scale ±4% at ~0.64 Hz). An undrawn (`visible={false}`, F6.5) `<mesh><boxGeometry>` provides a reliable full-volume
click target (line segments alone are difficult to raycast in WebGL2).

For camera reset across frame switches, see `docs/edgecases/Edge_#4.md` Case 6 — resolved in Step 8 via `<Viewer3D key={frame.id} />` remount; `page.tsx` is the single wire point. **F2-C** then made this `key` dataset-aware: nuScenes uses a *stable* key (no remount → the camera holds during tracking/autoplay), COCO keeps `frame.id` (remount-reset). See Edge_F#2 Case 6.

### Frame-switch selection policy (dataset-aware, F2-C)

`page.tsx`'s `handleSelectFrame` clears or keeps the object selection based on `tracksAcrossFrames`
(true on nuScenes):
- **COCO** clears `selectedObjectId` on every switch — ids are `imageId-annId`, unstable across frames,
  so a kept id could ghost-highlight or match a different object (Edge_#5 Case 6).
- **nuScenes** KEEPS it — the id is an `instance` token, stable for the same object across frames, so
  keeping it tracks that object; absence in a frame just draws no highlight, and re-appearance
  re-highlights correctly (Edge_F#2 Case 5).
Either way it is one `selectedObjectId` (Immutable Rule #2) — only *when* it clears differs.

### Autoplay (F2-C)

An `isPlaying` flag in `page.tsx` drives a `setInterval` (`AUTOPLAY_INTERVAL_MS = 500` ≈ the real
nuScenes ~2 Hz cadence). Each tick reads the current frame via `useViewerStore.getState()` (no stale
closure) and advances using the pure `nextFrameIndex(index, count, {loop:true})` from `lib/sequence`
(loops at the end; a hard stop would flip `isPlaying` off). On nuScenes, advancing keeps the tracked
selection (no clear). The play/pause control is passed to the Timeline **only on nuScenes** (COCO's
independent frames make playback a meaningless slideshow). The boxes snap between keyframes (decision
4-A; the LiDAR cloud is per-keyframe too) — `Scene` keys each `BBox3D` on the stable instance id, so
the component persists frame to frame and is the seam for a future box-tween (lerp/slerp in
`lib/geometry`).

### Camera mode + inter-frame tween (F2-D)

Two viewing-smoothness layers on top of F2-C, both nuScenes-only and both built on the same seams
F2-C left clean. They share the gap they bridge: the scene renders at ~60 fps but keyframes update at
only ~2 Hz.

**F2-D-1 — camera follow (toggle).** A page-level `cameraMode: 'fixed' | 'follow'` (a pure VIEW flag,
NOT a selection field — Immutable Rule #2 untouched; mirrors `isPlaying`, reset to `'fixed'` on a
dataset switch). The Timeline header shows a `Fixed/Follow` button (nuScenes only). In `'follow'`,
`Viewer3D` sets the OrbitControls `target` to `selectFollowTarget(frame.detections3D, selectedId)` —
the selected box's current center, recomputed each frame so the pivot tracks the moving box (snap,
decision Q2). `selectFollowTarget` (pure, in `lib/geometry/camera-framing.ts`, tested) returns `null`
when nothing is selected or the selected instance is absent in the frame, and the caller falls back to
the frozen framing — so follow degrades gracefully to the F2-C fixed camera, never aiming at empty
space. The camera POSITION stays the one-time init (3rd-person, user-orbitable; only the aim tracks).
A consequence: a followed object that travels far still recedes (position is fixed) — accepted for the
short sequence. See Edge_F#2 Case 7.

**F2-D-2 — inter-frame box tween.** During autoplay each box GLIDES from its current keyframe pose to
the next instead of snapping. `page.tsx` computes `nextFrame` (the upcoming keyframe via
`nextFrameIndex`) and threads it + `playing` through `Viewer3D` → `Scene`, which builds a
`Map<instanceId, bbox3D>` of next poses and hands each `BBox3D` its own `nextCenter`/`nextRotation`.
`BBox3D` interpolates in `useFrame`: position via `lerpVec3`, rotation via `slerpQuat` (both pure, in
`lib/geometry/interpolation.ts`, tested), over `t = (elapsed − keyframeStart)/AUTOPLAY_INTERVAL_MS`
clamped to `[0,1]`. The per-box clock resets on each `frameId` change (and on a play restart) so a
tween always begins on a real measured pose. **Honesty (Rule #6):** the tween is gated on `playing`,
so paused / manual scrubbing shows the EXACT measured keyframe — an interpolated in-between pose is
never a static state, and the "Measured" badge keeps referring to the keyframe data. The LiDAR cloud
stays per-keyframe (the accepted box-smooth / points-snap dissonance). Objects with no next match hold
their current pose (no jump, no NaN). All visible boxes tween (cost negligible). See Edge_F#2 Case 8.

## Step 9.5 Component Contracts

All Step 9.5 components follow the same controlled-component pattern as
Step 5+ (props in, callbacks out; `page.tsx` is the single wire point).
Adopt/exclude rationale lives in `docs/etc/NEW_UI.md` (private notes, not in the public repo).

| Component | Phase | Responsibility |
|---|---|---|
| `Header` | 2 ✅ | **F3:** a flush 44px app bar (border-bottom, no card); the meta line is hidden while `frameCount` is 0 (loading / error), because the Header is rendered in every state. App title + frame meta (`Frame N/M · X detections`, X = `detections3D.length` — the 3D main view's count, F2-A). Pure presentation; reads no store directly. **F2-A:** also hosts the dataset switcher (segmented `COCO \| nuScenes`, props `datasetId`/`onSelectDataset`) and the Estimated/Measured badge driven by `Frame.source` (amber = estimated, emerald = measured) — provenance is surfaced here, app-level, not in the per-frame Filters. |
| `HintBox` (inside `Viewer3D`) | 1 ✅ | **F3:** text in English ("Drag · rotate / Scroll · zoom / Click · select") — it was the only Korean UI string. Small overlay in the 3D viewer corner showing mouse controls. Static text; no state. Mounted as a sibling of `<Canvas>` inside `Viewer3D`'s `relative` wrapper; `pointer-events-none` so OrbitControls still receives drag events over the hint area. |
| `AnalyticsPanel` | 3 ✅ | **F3:** the `details` zone of the workspace (right column, under the camera); `h-full` with a 32px `PanelHeader`, body scrolls inside. Right-rail container that composes `SelectedObjectInfo`, `ConfidenceHistogram`, `ClassCountBar`. Holds no state of its own. **F2-E:** when `frameHasConfidence(frame)` is false (measured frames) the histogram is swapped for a local `NoConfidenceNote` ("Measured annotations · no confidence scores") that keeps the same heading/spacing so the panel doesn't reflow on dataset switch — mirrors `Filters` swapping the confidence slider for the distance slider. Has no background-deselect handler — deselection stays scoped to Filters / ObjectList / Viewer empty-space (information panels deselecting on background click feels accidental). |
| `SelectedObjectInfo` | 3 ✅ | Renders class / confidence / 2D bbox / 3D bbox / frame id / detection id of the selected detection. **F2-E:** the Confidence row shows "—" when `frameHasConfidence(frame)` is false, the same affordance as the missing-modality bbox rows. Shows a placeholder card when `selectedObjectId` is null OR when the id is not found in the current frame (defensive — `handleSelectFrame` already clears on frame switch). |
| `ConfidenceHistogram` | 3 ✅ | **F3:** the SVG is stretched to the panel width at a fixed 48px height (`preserveAspectRatio="none"`, lines use `vector-effect: non-scaling-stroke`) and the 0 / 0.5 / 1 tick labels are HTML below it — text inside a width-scaled viewBox grew with the panel (8 units → ~28px in a 700px panel). Ticks are now 10px at any width. Pure SVG bars over `BUCKET_COUNT=10` buckets of `[0..1]`. Bars above the current `confidenceThreshold` render in sky; below-threshold bars in zinc. Threshold itself drawn as a dashed vertical line. Bucket data comes from `selectConfidenceBuckets(frame)`. Not mounted on measured frames (F2-E, see `AnalyticsPanel`). |
| `ClassCountBar` | 3 ✅ | **F3:** counts come from `detections3D` (same basis as the header, list and timeline badge); class-name column widened to `w-28` with the full name as a tooltip. CSS-only horizontal bars (one row per class), iteration order = `selectClassCounts` Map order (first-appearance). Clicking a row dispatches `toggleClass`, the same action `ClassToggles` uses — the chart is a second entry point to the same store slice. Permissive-empty visual matches `ClassToggles`. |

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

### Layout (F3 workspace) — current

Since F3 (2026-11-25) `page.tsx` renders everything inside `components/workspace/WorkspaceShell.tsx`.
The shell defines **where each zone sits and how big it is**; it holds no state and computes nothing.
Viewers no longer size themselves — they fill the cell they are given.

```
Wide (lg, ≥1024px): full viewport, the page never scrolls (lg:h-screen, min-h 640px)
[ topBar     (Header, 44px, flush bar)                                     ]
[ filterBar  (Filters, 40px, flush bar)                                    ]
[ list       | main = Viewer3D                 | camera = Viewer2D (aspect) ]
[ ObjectList |                                 | details = AnalyticsPanel   ]
[ timeline   (Timeline, 84px)                                              ]
  columns: 240px | 1fr | 360px   (≥1400px: 272px | 1fr | 400px), gap/padding 8px
```

| Zone | 1440×900 | 1280×720 |
|---|---|---|
| 3D view (main) | 736×708 | 648×528 |
| camera cell, nuScenes (16:9) | 400×225 | 360×203 |
| camera cell, COCO (4:3) | 400×300 | 360×270 |
| object list | 272×708 | 240×528 |

- **Only panels scroll inside.** The object list and the details panel scroll in place; the page does
  not (`document.documentElement.scrollHeight === clientHeight`, verified at 1440×900, 1280×720,
  1536×700 for both datasets, with a selection and during autoplay).
- **Camera cell ratio** comes from `cameraAspect` (page: nuScenes 16/9, COCO 4/3). The cell carries
  `min-h-0 overflow-hidden`: without them a box with `aspect-ratio` grows to fit its content, and a
  portrait COCO photo stretched the cell to 400×600 (Edge_F#3 Case 1).
- **Fixed bar heights on wide screens** (`lg:h-11`, `lg:h-10`, `TIMELINE_ROW_HEIGHT_CLASS`) so the
  loading skeleton and the loaded page have identical pane rectangles — the page does not jump when
  data arrives (verified: all five pane rects equal before/after load).
- **Narrow (< lg):** zones stack in one column and the page scrolls. Order via `order-*`:
  3D → camera → timeline → list → details (3D first, Rule #5). The right column uses
  `contents lg:flex` so camera and details can be ordered independently on narrow screens.
- **Loading / error / empty** render in the same shell: pane placeholders (pulsing while loading), the
  error message + Retry or "No frames." in the main slot. The Header stays live, so the dataset
  switcher works during loading and after a failed load.
- **Panel look** (`Panel.tsx`): `PANEL_CLASS` = zinc-900 background, 1px zinc-800 **border**,
  `rounded-lg`. A border, not `ring-inset`: an inset ring is painted under the content, so a photo or
  the 3D canvas filling the pane hid it. Data panels (list, details) have a 32px `PanelHeader`; viewers
  (3D, camera) get a corner `ViewerLabel` instead so the image keeps the full pane height. Section /
  filter labels share `SECTION_TITLE_CLASS` (11px, uppercase, semibold). Counts read "OBJECTS 40"
  (no parentheses).
- **Viewer labels follow provenance** (Rule #6): `Frame.source === 'nuscenes-measured'` →
  "LiDAR · measured 3D" / the name of the camera on screen (F6; "CAM_FRONT" until then); otherwise
  "3D · estimated from 2D" / "Image".
- **(F4 filled its spots — see "Review (F4)" below. F5 did not stack onto them: it added a
  Review | Evaluate mode in which each zone changes ROLE while the frame stays the same — see
  "Evaluation (F5)" below. F6 added the thumbnail row between the camera cell and the details panel —
  see "Six Cameras (F6)" below; the details panel is 43 px shorter than in the table above.)**
- **Reserved spots for later features** (F3 design doc §12): F4 review buttons at the top of the
  details panel and progress in the top bar, review status at the right of each list row; F5 summary
  in the details panel and a confidence slider in the filter bar; F6 cameras in the camera cell.

<!-- KO (move to a localized file)
### 배치 (F3 작업 화면) — 현재

F3(2026-11-25)부터 `page.tsx`는 모든 것을 `components/workspace/WorkspaceShell.tsx` 안에 그린다. 화면 틀은
각 영역의 **위치와 크기만** 정하고, 상태나 계산은 갖지 않는다. 뷰어는 더 이상 자기 크기를 정하지 않고 받은 칸을 채운다.

- 넓은 화면(lg, 1024px 이상): 화면 전체를 쓰고 페이지는 스크롤되지 않는다. 열 폭 240 | 나머지 | 360
  (1400px 이상은 272 | 나머지 | 400). 1440×900에서 3D 736×708, 카메라 400×225(nuScenes) / 400×300(COCO).
- 목록과 정보 패널만 패널 안에서 스크롤된다.
- 카메라 칸 비율은 `cameraAspect`(nuScenes 16:9, COCO 4:3). `min-h-0 overflow-hidden`이 없으면 `aspect-ratio`
  칸이 내용 크기만큼 늘어난다(세로 COCO 사진에서 400×600, Edge_F#3 Case 1).
- 넓은 화면에서 상단 바·필터 바·타임라인 높이를 고정해, 로딩 화면과 로딩 후 화면의 칸 위치가 같다.
- 좁은 화면: 세로로 쌓이고 페이지가 스크롤된다. 순서는 3D → 카메라 → 타임라인 → 목록 → 정보.
- 로딩·오류·빈 데이터도 같은 틀 안에 그린다. 헤더는 항상 살아 있어 로딩 중이나 오류 뒤에도 데이터셋을 바꿀 수 있다.
- 패널 모양(`Panel.tsx`): 배경 zinc-900, 1px zinc-800 테두리(border), rounded-lg. `ring-inset`은 내용 아래에
  그려져 사진·3D가 덮으면 가려지므로 쓰지 않는다. 데이터 패널은 32px 제목 줄, 뷰어는 모서리 이름표.
- 뷰어 이름표는 `Frame.source`로 정한다(규칙 #6). 실측이면 "LiDAR · measured 3D" / "CAM_FRONT",
  아니면 "3D · estimated from 2D" / "Image".
- 뒤 기능 자리: F4 검수 버튼은 정보 패널 맨 위, 진행률은 상단 바, 검수 상태는 목록 행 오른쪽. F5 요약은 정보 패널,
  confidence 슬라이더는 필터 바. F6 카메라는 카메라 칸.
-->

## Review (F4) — current

> **F6 note:** written when there was one camera. What six cameras changed in review (camera tags,
> "Seen by …", the two new orders, `[` / `]`, practice mode) is in "Six Cameras (F6)" below.

F4 (2026-11-25) turns the nuScenes view into a review tool: every measured 3D box can be approved,
rejected (with reasons) or marked unsure; the records are saved in the browser and exported. COCO is
untouched — its 3D is estimated, so there is nothing to approve or reject (Rule #6) — and renders
exactly as after F3. Design: `docs/plan-feature/F4_box_review.md`; edge cases: `Edge_F#4.md`.

### Data flow

```
selectedFrameId + selectedObjectId   (viewer-store — the ONLY selection state, Rule #2)
        │  page derives the target of every review action from these two
        ▼
review-store.reviews[scope]["frameId/objectId"] = ReviewRecord      (persisted)
        │
        ├─ summarizeProgress(frames, reviews) ──▶ Header progress, Timeline badges, panel "Frame n · x/y"
        ├─ verdictsOfFrame(frame, reviews) ─────▶ ObjectList row icons
        ├─ orderBoxes → buildQueue(visibleIds) ─▶ list order, J / K, "N to review"
        ├─ nextUnreviewed / nextFrameWithUnreviewed ─▶ auto-advance, N
        └─ buildReviewExport ──▶ JSON / CSV download
```

- **Review unit = one box in one frame.** The object id (`instance` token) repeats across frames,
  but each frame's box is drawn separately, so the key is the pair `reviewKey(frameId, objectId)`.
  Both ids are stored inside the record too; nothing ever splits a key.
- **No "box under review" state.** The store's actions take the target as arguments; the page always
  passes the current selection. Nothing derived (progress, queue, next box) is stored.
- **Scopes.** `'nuscenes'` = verdicts on the real annotations; `'nuscenes-practice'` = verdicts on
  the practice set. Separate maps — they never mix.

### review-store

```ts
type ReviewStore = {
  reviews: Record<'nuscenes' | 'nuscenes-practice', Record<string, ReviewRecord>>;
  storageFailed: boolean;   // true while saving is failing; NOT persisted
  setVerdict(scope, frameId, objectId, verdict, now?): void;
  toggleReason(scope, frameId, objectId, reason): void;   // rejected boxes only
  setNote(scope, frameId, objectId, note): void;          // rejected / unsure boxes only
  clearReview(scope, frameId, objectId): void;
  resetScope(scope): void;
};
```

| Concern | Behaviour |
|---|---|
| Transitions | Pure functions in `lib/review/records.ts`; a no-op returns the same map → no subscriber notification |
| Verdict change | Reasons survive only while `rejected`; the note survives for `rejected` and `unsure`; `approved` clears both. Same verdict again = no-op (timestamp kept) |
| Persistence | zustand `persist`, key `ai-detection-viewer.review`, `partialize` → `reviews` only, `skipHydration: true` |
| Loading | `page.tsx` calls `persist.rehydrate()` in an effect after mount → server HTML and first client render both start empty (no hydration mismatch) |
| Stored data | Treated as outside input: `merge` runs `sanitizeReviews` (drops records with bad ids / verdict, repairs soft fields, rebuilds keys) |
| Storage failure | `createSafeStorage` wraps the backend: nothing throws into an action; `storageFailed` goes true on a failed read/write and back to false on the next successful write (Edge_F#4 Cases 2, 7) |
| Other tabs | `page.tsx` rehydrates on the `storage` event so an older tab cannot overwrite newer records (Edge_F#4 Case 4) |
| Stale records | A record whose box is not in the loaded data is ignored by progress / export; it is deleted only by Reset |

### What blocks a verdict (`getReviewBlock`)

`playing` (boxes are at interpolated poses, Rule #6) → `no-selection` → `not-in-frame` (the tracked
selection has no box in this frame) → `hidden` (filtered out, so not drawn in 3D). Buttons are
disabled and the reason is shown; the page handlers re-check the same value.

### Queue, auto-advance, shortcuts

- **Order** (`QueueOrder`, page-level view state, reset on dataset switch): `scene` (dataset order),
  `evidence` (fewest LiDAR points first; unknown counts last), `camera` (in-camera first). Stable sorts.
- **Queue** = the ordered boxes that pass the filters. The list still shows every box (hidden ones
  dimmed); J / K and auto-advance walk the queue only.
- **Auto-advance:** Approve and Unsure select `nextUnreviewed` (wraps within the frame, never returns
  the current box); Reject stays (reasons). The frame never changes on its own.
- **N** = `nextFrameWithUnreviewed` with the SAME filter rule as the queue (Edge_F#4 Case 6), then
  selects that frame's first unreviewed box and stops playback.
- **Shortcuts** (`resolveShortcut`, pure): `A` `R` `U` verdicts, `C` clear, `J` `K` step, `1`–`6`
  reasons, `N` next frame, `Z` camera zoom. Not while typing (`isTypingTarget`), not with
  Ctrl / Meta / Alt; only J / K auto-repeat. With a non-Latin input method (`key` = "ㅁ" / "Process")
  the physical key (`code`) decides (Edge_F#4 Case 5). An open `ExportMenu` stops key events before
  they reach the shortcut listener.
- **Focus rule:** verdict / reason / clear / zoom buttons blur after a MOUSE click (`event.detail > 0`),
  because a verdict moves the selection and Space would re-fire the button on the next box.

### Camera cell (Viewer2D) in review

- `zoom` (page state, default on) + a selected box that is in the image → the SVG `viewBox` becomes
  `zoomRegion(bbox)` and the selected box is drawn as its **projected 3D box**: 8 white edges, the
  front face in sky with diagonals (`Detection2D.corners`, `BOX_EDGES`, `BOX_FRONT_FACE`). Other boxes
  become faint, label-less, still clickable rectangles. Zoom strokes use `non-scaling-stroke`.
- Full view, no selection, or a filtered-out selection → the pre-F4 rendering, unchanged.
- Selected box exists in 3D but not in this image → notice "Selected box is outside {label} · check
  it in the 3D view". Only on viewers that have the zoom toggle (nuScenes).
- Limit: the photo is 1600×900; a distant object is enlarged, not sharpened.

### Evidence strip

Above the verdict buttons, always visible: LiDAR point count (amber + "weak" at ≤ 4), visibility bin,
"In camera" / "Not in camera". All three are the dataset's records; tooltips state that the LiDAR count
is nuScenes' count on the original sweep and that visibility is across all 6 cameras (wording checked
against the nuScenes schema docs).

### Export

`buildReviewExport(frames, reviews, { scope, exportedAt })` → `{ format: 'ai-detection-viewer/review@1',
exportedAt, dataset, practice, summary, reviews[] }`; rows = reviewed boxes only, frame order then box
order, each with `frameIndex`, `frameId`, `objectId`, `annotationToken`, `class`, `verdict`, `reasons`,
`note`, `reviewedAt`. CSV: RFC 4180 quoting, CRLF, reasons joined by `;`, a leading `'` on a note a
spreadsheet would run as a formula; a UTF-8 BOM is added at download time. File name:
`review_<scope>_<YYYYMMDD-HHmm>.<ext>`.

### Practice mode (F4-F)

- `makePracticeSet(raw, { seed, inCamera })` modifies ~10% of each frame's boxes in the RAW prepped
  data (position 1.0–1.6 m, size ×1.45–1.7 or ×0.55–0.65 with the bottom kept, heading ±30–60°,
  class swap) and returns the modified copy + the answer key. The parser then runs as usual, so the
  3D box, its projection and the 2D rectangle agree, and ids are unchanged (Rule #1). The sample file
  is never written.
- Fairness rules: candidates need ≥ 5 LiDAR points or to be in the camera; at least half of a frame's
  errors go to in-camera boxes; class errors only in the camera; heading errors only on boxes ≥ 2 m
  and ≥ 1.5× elongated. Deterministic per seed (per-frame generator).
- **Honesty (Rule #6).** `page.tsx` keeps `plantedErrors` (set together with `frames`) as the truth of
  what is on screen; badge ("Practice · labels modified", never "Measured"), the 3D tag, the review
  scope and the export flag key on it, not on the toggle.
- `scorePractice` → found / foundWithReason / missed / pending / falseAlarms, per frame and overall.

### Width budget of the top bar

The bar is a fixed 44px slot and must stay on one line from 1024px. Below 1280px (`xl`) the
"· N detections" text (when review content is present) and the "N rejected / N unsure" texts are
hidden (Edge_F#4 Case 3). Anything added to the bar must be checked at 1024px.

<!-- KO (move to a localized file)
## 검수 (F4) — 현재

F4(2026-11-25)부터 nuScenes 화면은 검수 도구다. 실측 3D 박스를 승인 / 반려(사유) / 판단 불가로 판정하고,
기록은 브라우저에 저장되며 내보낼 수 있다. COCO는 3D가 추정값이라 검수 대상이 아니며 F3 때와 같다.

- 검수 단위는 "한 프레임의 박스 하나". 키는 (프레임 ID, 객체 ID) 쌍. "검수 중인 박스" 상태는 없고, 항상
  `selectedFrameId` + `selectedObjectId`에서 대상을 정한다(규칙 #2). 진행률·대기열·다음 박스는 저장하지 않고 계산한다.
- 범위(scope): `nuscenes`(원본) / `nuscenes-practice`(연습). 서로 섞이지 않는다.
- review-store: 전이는 `lib/review/records.ts`의 순수 함수. zustand `persist`로 localStorage에 저장하되
  화면이 뜬 뒤 불러온다(hydration 불일치 방지). 불러온 값은 검증한다. 저장소 접근을 감싸 실패가 판정을
  죽이지 않게 하고 `storageFailed`로 알린다. 다른 탭이 저장하면 다시 읽는다.
- 판정 불가 조건: 재생 중 → 선택 없음 → 이 프레임에 없음 → 필터로 가려짐.
- 대기열: 정렬(장면 순서 / LiDAR 점 적은 순 / 카메라에 보이는 것 먼저) 후 필터를 통과한 박스. 승인·판단 불가는
  다음 미검수로 자동 이동, 반려는 머묾. `N`은 대기열과 같은 필터 규칙으로 다음 프레임을 찾는다.
- 단축키: A R U 판정, C 지우기, J K 이동, 1~6 사유, N 다음 프레임, Z 카메라 확대. 입력 중·조합키는 무시,
  J K만 반복. 한글 입력 상태에서는 물리 키로 판단.
- 카메라 칸: 확대(기본) + 선택한 박스가 사진에 있으면 그 주변으로 확대하고 3D 박스를 투영한 선을 그린다.
  사진에 없으면 안내 문구. 전체 보기는 F4 이전과 같다.
- 근거 줄: LiDAR 점 개수(4개 이하면 weak), 가려짐 단계, 카메라에 보이는지. 모두 nuScenes의 기록이다.
- 내보내기: 검수한 박스만, 요약 포함. JSON / CSV.
- 연습 모드: 원본 JSON 단계에서 프레임당 약 10%의 박스를 시드에 따라 어긋나게 한다. 원본 파일은 바뀌지 않는다.
  화면의 표시(배지, 3D 이름표, 범위, 내보내기)는 토글이 아니라 실제로 불러온 데이터에 따라 정해진다.
- 상단 바는 1024px부터 한 줄이어야 한다. 1280px 미만에서는 일부 글자를 숨긴다.
-->

## Evaluation (F5) — current

> **F6 note:** written when there was one camera. The rules below are unchanged and now apply PER
> PHOTO; the data flow, the totals, the 3D colours and the numbers of the shipped sample are in "Six
> Cameras (F6)" below (60 photos: 349 / 182 / 107 / 180; the front camera alone is still 91 / 83 / 13 / 26).

F5 (2026-11-26) adds a second job to the nuScenes workspace: **scoring a 2D camera detector against
the labels.** YOLOv8n is run offline on the ten CAM_FRONT photos; the app compares its boxes with the
labels' 2D projections and shows what was found, missed and falsely reported — and *where in 3D* the
misses are. This evaluates a 2D camera detector, not 3D detection. COCO has no evaluate mode.
Design: `docs/plan-feature/F5_camera_detection_eval.md`; edge cases: `Edge_F#5.md`.

### Two modes, one workspace

`page.tsx` holds `mode: 'review' | 'evaluate'` (a view setting like `cameraMode`; not stored, reset to
`'review'` on a dataset switch). The frame and `selectedObjectId` are shared by both modes. The
`WorkspaceShell` zones stay where they are; each changes role:

| Zone | Review (F4) | Evaluate (F5) |
|---|---|---|
| top bar, left | dataset, badge, Practice | + `ModeSwitch`; Practice hidden while evaluating |
| top bar, right | review progress, Export | `EvaluationHeadline`: model name, overall Precision / Recall |
| filter bar | distance slider, class chips | **"Min score"** slider (the store's `confidenceThreshold`), class chips, "n/m results" |
| list | `ObjectList` (every 3D box) | `ResultList` (this frame's results: missed → false alarm → found → not scored) |
| 3D view | class colours | **outcome colours** via `boxColors` + legend (found green, missed red, everything else grey) |
| camera cell | labels; zoom draws the projected 3D box | `overlay`: labels dashed, model boxes solid, outcome colours; zoom shows both |
| details | "Review" panel | `EvaluationPanel` with `SelectedResult` pinned on top |
| timeline badge | reviewed / total | "N missed" (or "no preds") |

`evaluating = mode === 'evaluate' && reviewEnabled && plantedErrors === null`. Practice and evaluate
exclude each other in both directions (a practice set has deliberately wrong labels and cannot be an
answer key): Evaluate is blocked, with the reason in its tooltip, while practising, and the Practice
toggle is hidden while evaluating.

### Data flow

```
predictions.json ── usePredictions(url) ── parsePredictions ──▶ PredictionSet { model, camera, byFrame }
                                                                 (nothing filtered at parse time)
frames + PredictionSet + { minScore: confidenceThreshold, iouThreshold: 0.3 }
        │  evaluateFrames  (page, useMemo — re-runs on every slider move; 0.2–0.4 ms for 10 frames)
        ▼
DatasetEvaluation { byFrame: Map<frameId, FrameEvaluation>, summary, evaluatedFrames, framesWithoutPredictions }
        ├─ summary ─────────────────────────▶ EvaluationHeadline, EvaluationPanel (totals, by distance, by class)
        ├─ byFrame.get(id).counts ──────────▶ Timeline badges, panel "Frame n" row, list chips
        └─ useFrameResults(frame, predictions, frameEvaluation, selectedObjectId, class chips, outcome chips)
              ├─ orderResults ──────────────▶ ResultList rows
              ├─ resultQueue ───────────────▶ J / K
              ├─ findResult ────────────────▶ SelectedResult (describeResult)
              ├─ buildOverlay ──────────────▶ Viewer2D `overlay` (ImageRect[] + focus)
              └─ boxOutcomeColors ──────────▶ Viewer3D `boxColors`
```

- **Predictions are a separate type and a separate file** (`Prediction2D`, field `score`; not in
  `Frame`). `detections2D` / `detections3D` stay the 2D / 3D halves of one object with one id
  (Rule #1); a prediction has no 3D half and is not the label it may match. Surfaces that draw labels
  therefore keep hiding the placeholder confidence with `frameHasConfidence` unchanged (F2-E), and
  only prediction-drawing surfaces show a score.
- **Scoring happens at the selector level**, from (frames, predictions, score). The file is never
  filtered when parsed, so the slider re-scores everything (CLAUDE.md: threshold filtering at the
  selector level).
- **Load.** `predictions.json` is requested next to the dataset (`PREDICTION_SOURCES`). It is
  independent of the dataset request: if it fails, review works and evaluate mode says "Predictions
  unavailable" with the reason. Both requests go through `fetchJson`, which reports an HTTP failure
  as its status instead of a JSON parse error (F5-0).

### The rules (`lib/evaluation/match.ts`)

1. **Labels** = the frame's `detections2D` (boxes that project into the camera image) of an evaluated
   class (`person, bicycle, car, motorcycle, bus, truck`). Their 2D rectangle is the projection of the
   3D box — **approximate**, looser than the object (Rule #6; stated in the camera legend and the
   panel).
2. **Predictions** that take part = an evaluated class and `score ≥ minScore` (default 0.25).
3. **Greedy matching**, highest score first: each prediction takes the still-unmatched label **of its
   class** it overlaps most; `IoU ≥ 0.3` → the label is **found**. One label, one prediction.
   0.3, not the benchmark 0.5, because the projected labels are loose: at 0.5 more than 20 correct
   detections are each counted as a miss plus a false alarm (`sample-data.test.ts` locks this; the
   design probe measured 28).
4. **Not scored** = labels with nuScenes visibility `v0-40`: neither found nor missed, and a
   prediction of the same class lying on one is dropped rather than called a false alarm. Caveat:
   nuScenes rates visibility over all six cameras, not the front camera alone.
5. Every other unmatched label is **missed**; every other unmatched prediction is a **false alarm**.
6. Each miss / false alarm carries its **nearest** box of the other kind and the one fact that kept
   it from counting (`wrong-class`, `below-min-score`, `low-overlap`, `matched-elsewhere`). These are
   facts for the reader, not a diagnosis of the model.

`Precision = found / (found + falseAlarm)`, `Recall = found / (found + missed)`; both are `null`
(shown "—", never 0%) when the denominator is 0. Breakdowns (10 m distance bands, class) are recall
only — a false alarm has no matched label, hence no measured distance.

**A frame with no entry in the file is not evaluated** (badge "no preds", left out of the totals); a
frame with an empty entry was run and all its scored labels are missed.

On the shipped sample at the default rules: found 91, missed 83, false alarms 13, not scored 26 →
Precision 88%, Recall 52%; recall by class car 18/22, person 73/112, motorcycle 0/40. **Ten frames,
one camera, one scene — a demonstration that the analysis works, not a statement about the model.**

### Selection (Rule #2)

Still one `selectedObjectId`. A label result (found / missed / not scored) is selected by its
**object id**, so the 3D box, the list row and both rectangles highlight together; a false alarm is
selected by its **prediction id** `pred:<frameId>:<fileIndex>` (cannot collide with a hex instance
token; carries the frame so a stale id can never point at another prediction). `findResult` resolves
either id; `selectionIdOf(result)` is the id to store. One page effect drops a prediction id when it
no longer names a result on screen (frame change, leaving evaluate mode, the slider passing it,
predictions unavailable). A false alarm highlights nothing in the 3D view: a model box is a 2D
rectangle with no depth, and no 3D position is invented for it (Rule #6).

### Viewer contracts added by F5

- **`Viewer2D` `overlay?: ImageOverlay`, `legend?`.** With an overlay the viewer draws
  `overlay.rects` instead of the frame's boxes and, in zoom mode, crops to `overlay.focus`. Strokes
  and dashes are in screen pixels (`non-scaling-stroke`); captions scale with the visible region so
  they are the same size on screen at any zoom. A rectangle without `selectId` lets clicks through.
  The viewer knows nothing about evaluation; `lib/evaluation/overlay.ts` decides what is drawn
  (labels dashed, model boxes solid, outcome colour, selected emphasised and captioned, the rest
  dimmed, plus the selected result's **companion** box — the one its explanation refers to, even if
  it is below the minimum score). Without an overlay the review / COCO paths are untouched.
- **`Viewer3D` `boxColors?: ReadonlyMap<id, colour>`, `legend?`.** Passed down to `BBox3D` as
  `color`. Only the material colour changes: same components, same keys, same Canvas — verified that
  mode switches, slider moves, frame switches and autoplay do not re-create the canvas.
- **`Timeline` `badges?`**, **`Header` `modeSwitch?`**, **`Filters` `thresholdLabel` /
  `defaultThreshold` / `countNoun`** — slots and labels; none of these components knows what
  evaluation is.

### Filters in evaluate mode

- The store's `confidenceThreshold` is the model's minimum score: set to 0.25 on entering, to 0 on
  leaving; it never filters labels in this mode (`labelThreshold = 0`), and the distance filter is
  off (`labelMaxDistance = DISTANCE_MAX`).
- **Class chips** hide (rows dimmed, boxes not drawn in the photo or the 3D view); **outcome chips**
  (`shownKinds`, page state) filter the list and the photo. **Neither changes a number** — totals
  are always over everything (the same principle as F4: the queue follows the filters, the progress
  denominator does not).
- **Reset** returns the score to 0.25 and clears the class chips; it leaves review mode's distance
  filter alone (Edge_F#5 Case 1).
- Below the file's own minimum (`model.minScore`, 0.05) the panel states the score actually in
  effect (Edge_F#5 Case 2).

### Shortcuts

`resolveShortcut` is reused unchanged. In evaluate mode the page handles `step` (J / K, over
`resultQueue`) and `toggle-zoom` (Z) and ignores every action that writes a review.

### Width budget

The mode switch (126px) is in the top bar's left group. Checked one line / no page scroll at 1024,
1100, 1279 and 1280 in review, practice and evaluate (evaluate also at 1440, 1536 and 1920); the
tightest is review at 1024 (68px between the groups). The practice badge reads "Practice" below 1280px. Below 1024px the layout
stacks (F3) and the left group wraps.

<!-- KO (move to a localized file)
## 평가 (F5) — 현재

F5(2026-11-26)는 nuScenes 화면에 두 번째 일을 더했다. **2D 카메라 탐지 모델을 정답과 비교해 채점**하는 것이다.
YOLOv8n을 앞 카메라 사진 10장에 미리 돌려 두고, 앱이 그 박스를 정답의 2D 투영과 비교해 찾음 / 놓침 / 헛짚음과
"놓친 것이 3D 어디에 있는지"를 보여준다. 3D 탐지 평가가 아니다. COCO에는 평가 모드가 없다.

- **모드:** `page.tsx`의 `mode`(`review` | `evaluate`). 화면 설정이며 저장하지 않는다. 프레임과 `selectedObjectId`는
  두 모드가 함께 쓴다. 화면 틀은 그대로이고 칸의 역할만 바뀐다(위 표). 연습 모드와 평가 모드는 서로 막는다.
- **데이터 흐름:** `predictions.json` → `parsePredictions`(읽을 때는 아무것도 거르지 않음) → 슬라이더 값과 함께
  `evaluateFrames`(page의 `useMemo`, 슬라이더가 움직일 때마다 다시 계산, 10개 프레임에 0.2~0.4ms) → 상단 숫자,
  패널, 타임라인 배지, 그리고 `useFrameResults`가 목록 순서, J/K 대기열, 선택한 결과, 사진에 그릴 사각형, 3D 색을 만든다.
- **예측은 별도 타입, 별도 파일**이다(`Prediction2D`, 필드 이름 `score`, `Frame`에 넣지 않음). 그래서 규칙 #1(2D와 3D의
  ID가 같다)이 그대로이고, 정답을 그리는 곳은 F2-E대로 점수를 숨긴다.
- **채점 규칙:** 정답 = 사진에 투영되는 박스 중 평가 대상 클래스(근사치임을 화면에 표시). 예측 = 평가 대상 클래스이고
  점수가 기준 이상(기본 0.25). 점수가 높은 예측부터 **같은 클래스**의 짝 없는 정답 중 가장 많이 겹친 것과 짝짓고
  IoU 0.3 이상이면 찾음. 가시성 0~40%인 정답은 채점 제외(그 위의 같은 클래스 예측도 헛짚음으로 세지 않음).
  나머지 정답은 놓침, 나머지 예측은 헛짚음. 놓침과 헛짚음에는 "가장 가까운 상대"와 이유 한 가지가 붙는다.
- Precision = 찾음 ÷ (찾음 + 헛짚음), Recall = 찾음 ÷ (찾음 + 놓침). 분모가 0이면 `null`이고 화면에는 "—".
  거리별·클래스별 지표는 Recall뿐이다.
- **예측 파일에 없는 프레임은 평가하지 않는다**("no preds", 합계에서 제외). 예측이 0개인 프레임은 돌린 것이므로 전부 놓침.
- 실제 데이터의 기본 결과: 찾음 91, 놓침 83, 헛짚음 13, 채점 제외 26 → Precision 88%, Recall 52%.
  **프레임 10개, 카메라 1대, 장면 1개다. 분석이 동작함을 보이는 것이지 모델 성능의 주장이 아니다.**
- **선택(규칙 #2):** 여전히 `selectedObjectId` 하나. 정답 쪽 결과는 객체 ID, 헛짚음은 예측 ID(`pred:<프레임>:<번호>`).
  예측 ID는 그 결과가 화면에서 사라지면(프레임·모드 전환, 슬라이더) 해제한다. 헛짚음은 3D에 표시하지 않는다(위치 정보가 없음).
- **뷰어에 더한 입력:** `Viewer2D`의 `overlay`(그릴 사각형 목록)와 `legend`, `Viewer3D`의 `boxColors`(박스별 색)와
  `legend`, `Timeline`의 `badges`, `Header`의 `modeSwitch`, `Filters`의 이름·기본값·개수 단위. 이 컴포넌트들은 평가가
  무엇인지 모른다. 3D는 색 값만 바뀌고 캔버스를 다시 만들지 않는다(확인함).
- **필터:** 평가 모드에서 `confidenceThreshold`는 모델의 최소 점수다(들어갈 때 0.25, 나올 때 0). 클래스 칩과 결과 칩은
  보이는 것만 거르고 숫자는 바꾸지 않는다. Reset은 검수 모드의 거리 필터를 건드리지 않는다.
- **단축키:** 평가 모드에서는 J / K / Z만 동작하고 검수 기록을 쓰는 키는 무시한다.
- **상단 바 폭:** 전환 버튼 126px. 1024px(검수 모드)에서 두 묶음 사이 여유 68px이 가장 빠듯하다.
-->

## Six Cameras (F6) — current

F6 (2026-11-26) makes the nuScenes workspace use all six cameras of the vehicle (`CAM_FRONT`,
`CAM_FRONT_LEFT`, `CAM_FRONT_RIGHT`, `CAM_BACK`, `CAM_BACK_LEFT`, `CAM_BACK_RIGHT`). Review (F4) and
evaluation (F5) keep their structure; what changes is that "the photo" became "one of six photos".
COCO is untouched (one image, no `cameras`). Design: `docs/plan-feature/F6_six_cameras.md`; edge
cases: `Edge_F#6.md`. **Where this section and the F4 / F5 sections above disagree about cameras,
this section is current** (those describe the single-camera state they were written in).

### Data: `Frame.cameras`

```ts
type Frame = {
  /* …existing fields… */
  cameras?: CameraView[];   // nuScenes only; default camera first
};
type CameraView = {
  name: string;             // "CAM_FRONT_LEFT"
  imageUrl: string; imageWidth: number; imageHeight: number;
  detections2D: Detection2D[];   // this frame's 3D boxes projected into THIS photo; same ids (Rule #1)
};
```

- **Invariant:** `frame.cameras[0]` IS the view in the top-level fields — `frame.detections2D ===
  frame.cameras[0].detections2D`. So on a nuScenes frame `frame.detections2D` means "the default
  camera's boxes", never "any camera's". Anything about another camera or all of them goes through
  `lib/cameras`. (Audited in F6-D: the only direct readers left are code that is handed a
  camera-view frame, the COCO paths, and the timeline's front-camera thumbnail.)
- **`frameAsCamera(frame, name)`** returns the frame with that camera's photo and 2D boxes in the
  top-level fields (3D boxes, points and id shared, not copied). It is what lets everything written
  for one photo — `Viewer2D`, `selectVisibleDetectionIds`, `evaluateFrame`, `buildOverlay`,
  `SelectedObjectInfo` — work on any camera unchanged. Returns the same object for the default
  camera / an unknown name / a frame without cameras.
- **Prepped file, format 1.2:** each frame gains `cameras: [{ channel, image, egoPose,
  calibratedSensor }]`; the top-level `image` / `egoPose` / `calibratedSensor` stay (= CAM_FRONT =
  `cameras[0]`). A 1.0 / 1.1 file has no `cameras` and parses as the one camera it always was.
- **Each photo's own ego pose.** The six cameras fire up to 35 ms apart (the car moves 3–17 cm), so
  nuScenes stores an `ego_pose` per photo. The parser projects into a camera with THAT pose
  (`globalToEgo(ann, camera.egoPose)` → camera calibration); reusing CAM_FRONT's shifted rectangles
  by a median of 2.8 px and up to 41 px. **The 3D frame is unchanged:** 3D boxes and LiDAR points
  are still expressed in the top-level (CAM_FRONT) ego pose, so nothing in the 3D view or in any
  distance moved.
- **Sample:** 60 photos (8.04 MB), `nuscenes.json` 1,535 KB. 583 boxes: 443 seen by one camera, 140
  by two, 0 by none; per camera 200 / 79 / 184 / 55 / 36 / 169.

### `lib/cameras` (pure)

| Function | What it answers |
|---|---|
| `cameraViews(frame)` | every view, default first; a frame without `cameras` → one unnamed view (`SINGLE_VIEW = ''`) |
| `frameAsCamera(frame, name)` | the frame as one camera sees it (above) |
| `camerasSeeing` / `camerasByObject` | which cameras have a 2D box of an object |
| `visibleFraction(detection)` | share of the projected box inside the photo: clamped `bbox` area ÷ area around the unclamped `corners` |
| `camerasByBestView` / `bestViewsByObject` | the cameras seeing an object, best first: larger visible share, then larger on the image, then camera order |
| `pickCamera(frame, objectId, current)` | the camera to show: keep `current` if it sees the object (the photo must not change under the user); otherwise the best view; nothing selected / seen by none → `current` |
| `stepCamera(row, current, ±1)` | neighbour in the thumbnail row, wrapping (the cameras form a ring) |
| `CAMERA_DISPLAY_ORDER`, `inDisplayOrder`, `cameraShortName` | look-around order BL FL F FR BR B (neighbours in the row are neighbouring cameras); "CAM_FRONT_LEFT" → "FL" |
| `preloadOrder(frames, index, framesAhead)` | photo URLs to fetch ahead: current frame, then following frames in playback order, wrapping, no duplicates |

### Active camera (page view state)

`useActiveCamera(frame, selectedObjectId)` → `{ activeCamera, setCamera, resetCamera }`. Which photo
the camera cell shows is a VIEW setting like `cameraMode` / `cameraZoom`: not stored, not a
selection — `selectedObjectId` stays the only selection (Rule #2), and the camera follows FROM it.

- **Automatic** when the selection or the frame changes: `pickCamera`. This also makes the photo
  follow a tracked object from one camera to the next during playback.
- **Manual:** a thumbnail click or `[` / `]` (`setCamera`) holds until the selection or frame changes.
- Chosen **while rendering** (state adjusted when the `(frame, selection)` key changes), not in an
  effect, so no frame is painted with the old photo and its "outside this camera" notice.
- `page.tsx` derives `viewFrame = frameAsCamera(currentFrame, activeCamera)`; `Viewer2D`, the 2D
  visible set, the details panel's 2D row and the per-photo evaluation take `viewFrame`; the 3D view,
  the object list and every review action take `currentFrame`.

### Layout: the thumbnail row

`WorkspaceShell` has an optional `cameraStrip` slot between the camera cell and the details panel
(same `order` as the camera cell, so on narrow screens it stays under the photo). `CameraStrip` is a
grid of `cameraSlots` cells — the largest camera count of any frame — so a frame with fewer cameras
leaves cells empty instead of resizing the row (Edge_F#6 Case 2); shown when `cameraSlots > 1`. Each
thumbnail: the photo (the same file as the large image), short name, sky ring on the active camera,
a white marker where the selected box is, and in evaluate mode a badge with that photo's miss count.
The row's height follows its width (16:9 cells): 400×35 in the 400 px column, 360×32 in the 360 px
one. **Cost:** the details panel is 43 px shorter than after F5 (232 px at 1536×700).

| Zone | 1536×700 | 1280×720 | 1440×900 |
|---|---|---|---|
| camera cell | 400×225 | 360×203 | 400×225 |
| thumbnail row | 400×35 | 360×32 | 400×35 |
| details panel | 400×232 | 360×278 | 400×432 |

Photos are preloaded in the background (`usePhotoPreload(preloadOrder(frames, index,
PRELOAD_FRAMES_AHEAD))`, 2 at a time, 300 ms after a change); all ten frames today. 60 photos are
fetched in exactly 60 requests — large image, thumbnail, timeline and preloader share a file.

### Review with six cameras

- Object-list rows show a **camera tag** instead of the camera icon: the short name of the box's best
  view, plus "+" when a second camera sees it ("B+"); full names in the tooltip. Single-camera
  frames keep the icon.
- The evidence line says **"Seen by B · BR"** (best view first) or "No camera sees it".
- `Viewer2D` `outsideNote`: "Selected box is outside CAM_FRONT_RIGHT · seen by B, BR".
- **Orders** (`QueueOrder`): `camera` now groups by best-view camera in look-around order, unseen
  boxes last ("By camera"; with one camera it is the old "in camera first"); `unsure` puts boxes
  marked unsure first ("Unsure first") and reads the live records — `orderBoxes(frame, order,
  reviews?)`. Under `unsure`, Approve / Unsure advance to `nextUnsure` before `nextUnreviewed`.
  Because a verdict can now move the selected row, `ObjectList` keys its scroll-into-view on the
  row's index as well (Edge_F#6 Case 1).
- **Shortcuts:** `[` / `]` → `{ type: 'camera', direction }` (once per press, not while typing).
- **Practice mode:** "the camera sees it" = any camera does (`cameraViews`). Same seed, different
  planted errors than before F6 (the candidate pool grew from 200 to 583 boxes).
- Review records are keyed by (frame, object) and are unaffected.

### Evaluation with six cameras

**One photo is the unit.** A 2D detector sees one photo at a time, so each photo is scored on its own
and the counts are added; an object in the overlap of two cameras is two labels.

```
predictions.json (@2) ── parsePredictions ──▶ PredictionSet { model, cameras, byFrame: Map<frameId, Map<camera, Prediction2D[]>> }
frames + PredictionSet + rules
        │  evaluateFrames
        ▼
DatasetEvaluation { byFrame: Map<frameId, FrameCamerasEvaluation>, summary (per photo), byCamera[], objects, ignored,
                    evaluatedFrames, evaluatedPhotos, framesWithoutPredictions, photosWithoutPredictions }
FrameCamerasEvaluation { byCamera: Map<camera, FrameEvaluation>, counts (sum), objects: Map<objectId, ObjectOutcome>,
                         camerasWithoutPredictions, ignored, notEvaluated }
        ├─ byCamera.get(activeCamera) ─▶ useFrameResults → ResultList, Viewer2D overlay, J / K   (the photo on screen)
        ├─ objects ────────────────────▶ boxOutcomeColors → Viewer3D                             (per object)
        ├─ counts ─────────────────────▶ Timeline badge, panel "Frame n" row                     (sum of the frame's photos)
        └─ byCamera.get(c).counts ─────▶ thumbnail badges
```

- **`FrameEvaluation` now means one photo** (name kept from F5). `evaluateFrame(frame, predictions,
  rules)` is unchanged apart from the rack rule; it is handed `frameAsCamera(frame, name)`.
- **Per object** (`mergeObjectOutcomes`): found if ANY camera's photo found it, else missed if any
  photo scored it, else not scored. Used for the 3D colour (one box, one colour; legend "found by a
  camera / missed by all") and the panel's "By object" line — never mixed into precision / recall.
- **Bicycle-rack rule** (`match.ts`, checked last): an unmatched bicycle / motorcycle prediction whose
  CENTRE lies inside a `static_object.bicycle_rack` label is `ignored` — not a result, not counted,
  not selectable; drawn grey on the photo with its rack. `EvaluationRules.ignoreRackRegions: false`
  turns it off. The nuScenes detection benchmark filters the same boxes, by centre.
- **Prediction ids** carry the camera: `pred:<frameId>:<camera>:<index>`. A false-alarm selection is
  dropped when another camera's photo is shown (Edge_F#6 Case 3). File format `@1` (one camera per
  file) is still read.
- **"Not run" vs "ran and found nothing" is per photo.** A frame entry without a camera → that photo
  is not evaluated (thumbnail "–", list message, left out of the totals); a frame none of whose photos
  was run is left out entirely (Edge_F#6 Case 4).
- **Pinned strip:** a label result adds what the other cameras made of the object ("other camera: F
  missed", `describeOtherViews`); a selected box without a result in this photo says which of four
  reasons applies (not in this photo — with where it is; seen by no camera; a class the model cannot
  name; a bicycle rack).
- **Panel:** precision / recall and every breakdown are per photo ("349 of 531 labels in 60 photos");
  "Recall by camera" is new, with the per-object line under it; the frame row is the sum over the
  frame's photos, the list is one photo (its title carries the camera tag).

On the shipped sample at the default rules: **349 found, 182 missed, 107 false alarms, 180 not scored
→ Precision 77%, Recall 66%** (rack rule off: 121 false alarms, 74%). The front camera alone is
unchanged: 91 / 83 / 13 / 26. Per camera (found / missed / false alarms / not scored): F 91/83/13/26,
FL 58/17/2/3, FR 102/34/40/48, B 19/21/1/8, BL 16/12/2/4, BR 63/15/49/91. Per object: 295 of 418
found by at least one camera. **One scene, ten moments — still a demonstration, not a statement about
the model.**

<!-- KO (move to a localized file)
## 카메라 6대 (F6) — 현재

F6(2026-11-26)부터 nuScenes 작업 화면은 차량의 카메라 6대를 모두 쓴다. 검수(F4)와 평가(F5)의 구조는 그대로이고,
"사진 한 장"이 "사진 6장 중 한 장"이 됐다. COCO는 그대로다(사진 하나, `cameras` 없음). **이 절과 위의 F4·F5 절이
카메라에 대해 다르게 말하면 이 절이 현재 상태다**(그 절들은 카메라가 한 대이던 때의 기록이다).

### 데이터: `Frame.cameras`
- `Frame`에 `cameras?: CameraView[]`(nuScenes만, 기본 카메라가 맨 앞). `CameraView`는 카메라 이름, 사진, 그 사진에
  비춘 2D 박스 목록이다. 같은 객체는 어느 카메라에서든 ID가 같다(규칙 #1).
- **불변 조건:** `frame.cameras[0]`이 곧 최상위 필드의 내용이다(같은 배열). 그래서 nuScenes 프레임의
  `frame.detections2D`는 "기본 카메라의 박스"이지 "어느 카메라든"이 아니다. 다른 카메라나 전체에 관한 것은 `lib/cameras`를 쓴다.
- `frameAsCamera(frame, 이름)`은 그 카메라의 사진과 2D 박스를 최상위 필드에 넣은 프레임을 돌려준다. 사진 한 장을
  다루던 코드(`Viewer2D`, 2D 필터, `evaluateFrame`, `buildOverlay`)가 고치지 않고 어느 카메라에서든 동작한다.
- 준비 파일 형식 1.2: 프레임마다 `cameras` 배열이 생겼고 최상위 필드는 그대로다. 1.0 / 1.1 파일은 카메라 하나로 읽는다.
- 사진마다 자기 차 위치(ego pose)를 쓴다. 카메라 6대는 최대 35ms 차이로 찍히고 그 사이 차가 3~17cm 움직인다.
  3D 장면의 기준은 그대로 CAM_FRONT의 차 위치다(3D 박스, 점, 거리가 하나도 바뀌지 않았다).

### `lib/cameras` (순수 함수)
한 카메라로 본 프레임, 박스를 보는 카메라들, 사진 안에 들어온 비율(`visibleFraction`), 잘 보이는 순서
(`camerasByBestView`), 보여줄 카메라 고르기(`pickCamera`: 지금 카메라가 보면 그대로, 아니면 가장 온전히 보이는 쪽),
옆 카메라(`stepCamera`, 끝에서 돈다), 썸네일 순서와 짧은 이름, 미리 받을 사진 순서(`preloadOrder`).

### 지금 보는 카메라 (page의 화면 설정)
`useActiveCamera`가 관리한다. 선택 상태가 아니라 화면 설정이다(규칙 #2). 선택이나 프레임이 바뀌면 자동으로 고르고
(재생 중에도 물체를 따라감), 썸네일 클릭이나 `[` `]`로 직접 고른 것은 그때까지 유지된다. 효과(effect)가 아니라
렌더 중에 정해서, 옛 사진과 "밖에 있음" 안내가 한 프레임 보이는 일이 없다.

### 배치: 썸네일 줄
`WorkspaceShell`의 `cameraStrip` 자리(카메라 칸과 정보 패널 사이). 칸 수는 데이터셋에서 가장 많은 카메라 수로 고정해,
카메라가 적은 프레임에서도 줄의 크기와 아래 패널이 움직이지 않는다. 대가: 정보 패널이 F5 뒤보다 43px 낮다
(1536×700에서 232px). 사진은 뒤에서 미리 받는다(지금은 10개 프레임 전부, 60장이 정확히 60번의 요청).

### 검수
목록에 카메라 이름표("B+"), 근거 줄 "Seen by B · BR", 안내문에 어느 카메라에 있는지, 정렬 "By camera"(잘 보이는 카메라별로
모음)와 "Unsure first"(다시 판정하면 다음 판단 불가 박스로), 단축키 `[` `]`, 연습 모드는 어느 카메라든 기준.
판정으로 선택한 줄이 옮겨질 수 있으므로 목록은 줄의 위치도 보고 스크롤한다. 검수 기록의 키는 그대로다.

### 평가
**사진 한 장이 채점 단위다.** 사진마다 따로 채점해 더하고, 두 카메라에 보이는 물체는 정답 두 개로 센다.
물체 단위 결과("어느 카메라에서든 찾음")는 3D 박스 색과 패널의 한 줄에만 쓴다. 거치대 규칙: 짝 없는 자전거·오토바이
예측의 중심이 거치대 정답 안이면 뺀다(결과가 아니고, 사진에 회색으로 그림). 예측 ID에 카메라가 들어간다.
"돌리지 않은 사진"과 "돌렸는데 아무것도 못 찾은 사진"을 사진 단위로 구분한다. 목록과 사진은 지금 보는 카메라,
3D 색은 물체 단위, 타임라인과 패널의 프레임 줄은 그 프레임의 6장 합계, 썸네일 숫자는 그 사진의 놓친 개수다.

실제 숫자(기본 규칙): 찾음 349, 놓침 182, 헛짚음 107, 채점 제외 180 → Precision 77%, Recall 66%(거치대 규칙을 끄면
헛짚음 121). 앞 카메라만은 그대로 91 / 83 / 13 / 26. 물체 단위로는 418개 중 295개. **장면 하나, 열 순간이다.
모델 성능이 아니라 분석이 동작한다는 시연이다.**
-->

## Scenes, Chunked Loading and Search (F7) — current

F7 (2026-11-27) grows the nuScenes side from ten frames of one scene to all of nuScenes-mini:
**10 scenes, 404 keyframes, 18,538 boxes, 2,424 photos.** Nothing is loaded "all at once" any more,
the scene on screen can be chosen, and frames can be found by condition in a third mode, **Explore**.
Review (F4), evaluation (F5) and the six cameras (F6) keep their structure. COCO is untouched.
Design: `docs/plan-feature/F7_scene_exploration.md`; edge cases: `Edge_F#7.md`. **Where this section
and the F4 / F5 / F6 sections above disagree about how much data there is or how it is loaded, this
section is current** (those describe the ten-frame, single-file state they were written in).

### Files (prepped format 1.3)

```
public/sample-data/nuscenes/
├── scenes.json                  # the catalog: per scene — name, description, log (the drive it was cut
│                                #   from: name, location, date), frameCount, boxCount, the two file paths
└── scenes/<scene>/
    ├── frames.json              # every frame's boxes + six cameras. NO points: `lidar: {path, pointCount}`
    ├── predictions.json         # predictions@2 for this scene's photos (YOLOv8n, run on the ORIGINAL photos)
    ├── points/<frame>.json      # one frame's LiDAR points + the pose / calibration needed to place them
    ├── cam_<channel>/*.webp     # six photos per frame, reduced to 960×540 (WebP q75)
    └── thumb/<frame>.webp       # front camera, 192×108 — the timeline's hover preview, search result rows
```

3,253 files, 152.49 MB (photos 98.33, points 42.39, boxes 7.45, predictions 3.22, thumbnails 1.09).

- **Pixel coordinates stay those of the original photo (1600×900).** `image.width / height` in
  `frames.json` are the original size; the reduced photo is only what is *displayed* (the SVG overlay
  scales with its viewBox). So projected boxes, predictions and IoU are unchanged by the reduction.
  `image.source` is the original's path in the nuScenes download — used only by
  `predict_nuscenes.py`, never by the app.
- **A points file is self-contained:** `{token, frameEgoPose, lidar: {egoPose, calibratedSensor,
  points}}`. `parseNuScenesPoints(raw, expectedToken)` turns it into `Point3D[]` with the same
  conversion the single file used, and **rejects a file that names another frame** (measured points of
  one moment are never drawn under another moment's boxes — Rule #6, Edge_F#7 Case 3).
- `next.config.js` sends `Cache-Control: public, max-age=86400` for `/sample-data/nuscenes/scenes/*`
  (the files only change when the prep script is re-run).
- Day / night is **not a nuScenes field**: `isNightDescription` reads the scene description
  ("Night, …"). Three scenes are night scenes, and all three were cut from **one drive** (one log).

### Loading (`components/dataset/`, `lib/scenes/`, `lib/data/`)

```
scenes.json ──parseSceneCatalog──▶ SceneCatalog                       (useScenes)
   │
   ├─ the scene on screen FIRST: frames.json + predictions.json in parallel
   │      loadScene → buildFrames('nuscenes') + parsePredictions → LoadedScene {frames, predictions}
   └─ then every other scene, in the background, two at a time (SCENE_LOAD_CONCURRENCY)
          → `library`: what search and the all-scenes evaluation read

frame on screen ──useFramePoints──▶ its points file (+ the next 3 frames'), last 24 kept (BoundedCache)
frame on screen ──usePhotoPreload─▶ the next 3 frames' photos, 3 at a time, last 72 kept
```

- `lib/scenes/load-order.ts` (pure) decides WHICH scenes to request next: the requested scene always,
  regardless of the limit; the rest in catalog order. `lib/scenes/load-scene.ts` fetches one scene
  and never rejects (a failed scene is a state, not an exception). Parsing stays in `lib/nuscenes`
  and `lib/evaluation` (Rule #3); the hooks only hold the results.
- `useScenes(catalogUrl, requested, defaultScene, practice)` returns `{status, error, catalog,
  onScreen, pending, library, retry}`. **`onScreen` is the last scene that finished loading** — while
  another scene is requested, the previous one stays on screen and `pending` names the one on its way
  (or its error). A scene that fails, or has no frames, never replaces the scene on screen.
- `Frame.pointCloud` is `[]` for a 1.3 frame and `Frame.pointCloudSource {url, count}` says where the
  points are. `page.tsx` builds `frame3D` = the frame + the fetched points and gives that to the 3D
  viewer; the tag in the 3D cell says "loading points…" / "points unavailable" otherwise. Points are
  stored by frame id and only returned for the frame on screen, so a late answer for an earlier frame
  cannot be drawn.
- Practice mode builds its set per scene (`loadPracticeScene`, same seeded errors as F4).
- React development mode runs effects twice; each file is still requested once (a per-catalog
  "requested" set; results are accepted only while their catalog is current).

### Changing the scene

`requestedScene` is page state (not the store — it is not selection and not a filter). The scene
picker (`components/scenes/ScenePicker`, in the timeline's leading slot) shows the scene, ‹ › and a
list with day / night, drive, frames, boxes and one number per scene (review progress, or recall in
evaluate mode). Scenes cut from one drive carry a "1 drive · N scenes" badge.

When the new scene is ready: selection is cleared, playback stops, the frame index goes to 0 (or to
the frame a search result asked for), filters and mode are kept. **The 3D canvas is not re-created.**
`Viewer3D` takes `framingKey` (the scene name); when it changes, `CameraPlacement` (inside the
canvas, `useThree`) moves the existing camera to the new scene's framing. A class that is switched on
in the filter but absent from the new scene keeps its chip, so the filter can still be undone.

### Timeline: the scrubber

`Timeline` has two variants. COCO keeps `thumbnails` (ten pictures). nuScenes uses `scrubber`: one
cell per frame with a bar, so 41 frames fit the row without scrolling (cells 30 / 28 / 24 / 18 px at
1536 / 1440 / 1280 / 1024 px). `lib/ui/timeline-bars.ts` (pure) computes each cell: bar height from
the box count, tone from the mode (`boxes` · review progress `good` · evaluation `alert` · search
`match` · `muted` for frames that do not match), and the tick labels. The thumbnail appears on hover
(`position: fixed`, the panel clips). Below 1024 px the cells stack under the controls.

### Explore mode and search (`lib/search/`, `components/explore/`)

`WorkMode = 'explore' | 'review' | 'evaluate'`. Explore answers "where in the data is …?".

- **A condition measures one number on a frame and compares it with a minimum** — and the same
  function names the boxes that were counted. So the number in the result list, the number in the
  panel and the coloured boxes in 3D cannot disagree.

  | `kind` | Counts | Example chip |
  |---|---|---|
  | `objects {class, within, min}` | 3D boxes of a class within a distance of the car (same distance as the filter, inclusive) | `person within 20 m ≥ 5` |
  | `no-lidar {min}` | boxes with 0 LiDAR points | `no-LiDAR boxes ≥ 10` |
  | `model {what, min}` | evaluation results of the frame's six photos: `missed`, `false-alarm`, or `unlabelled` (a false alarm with no label nearby) | `model missed ≥ 15` |
  | `time {night}` | the scene's day / night | `night scene` |

- Conditions are AND-ed. `searchScenes(scenes, conditions, evaluations)` walks the scenes already in
  memory with these functions — no precomputed index (measured: 105 ms from click to paint for a
  label condition, 198 ms the first time a model condition scores all ten scenes).
- **Model conditions use fixed rules** (`DEFAULT_EVALUATION_RULES`: score ≥ 0.25, IoU ≥ 0.3), not the
  evaluate mode's slider — a search result must not change because a slider elsewhere moved.
- A hit is `{scene, frameId, frameIndex, values}`. `sortHits` orders by scene or by value; `stepHit`
  is what J / K walk — across scenes (opening a hit in another scene requests that scene and lands on
  the frame once it is ready). `SEARCH_PRESETS` are five ready-made condition sets.
- On screen: `ExploreBar` (chips, "+ condition", presets, "N of 404 frames match", Reset) in the
  filter slot; `ExploreResults` (rows with thumbnail and value) in the list slot; `SearchPanel` (this
  frame's value per condition, matches per scene) in the details slot. In 3D the boxes a condition
  counts keep their class colour and the rest are dimmed. With a model condition the photo draws only
  the results that condition counts, and each camera thumbnail carries its count.
- Search state (`conditions`, `hitOrder`) is page state. **`selectedObjectId` is untouched by Explore
  (Rule #2)**; the search highlight is a separate, derived colour map.
- Locked by tests on the shipped data: "person within 20 m ≥ 5" → 177 of 404 frames in 7 scenes;
  "model missed ≥ 15" → 135.

### Evaluation over all scenes (`lib/evaluation/scenes.ts`)

`evaluateScenes(scenes, rules)` → `{scenes: SceneScore[], notEvaluated, total, day, night}`; the day
and night groups carry `scenes` and `drives` (how many logs). The evaluation panel shows the scene on
screen as before, plus an "All scenes" block: the total, recall per scene (a row opens the scene),
day vs night **with the number of drives**, and the limits in words.

- The scene on screen is scored at once on every slider step. All scenes are re-scored only when the
  rules have rested for 250 ms (`useSettledValue`); meanwhile the block is dimmed (`aria-busy`).
  `useDeferredValue` was tried and measured: the deferred pass still ran after every step and blocked
  the next paint (Edge_F#7 Case 8).
- At the default rules, all 404 frames (2,424 photos): **6,726 found / 5,292 missed / 3,514 false
  alarms / 5,278 not scored → Precision 65.7%, Recall 56.0%.** Day 5,711 of 8,916 labels (64%), night
  1,015 of 3,102 (33%). The first ten frames of scene-0916 still give 349 / 182 / 107 / 180 and, front
  camera only, 91 / 83 / 13 / 26 (tests on the shipped files).
- **How these may be worded** (design doc §9): the day / night difference was *observed*; the night
  scenes are one drive, so it is not "the model is worse at night"; the total is not "the model's
  performance" (ten scenes, one small general-purpose model, labels projected from 3D boxes); no cause
  is claimed. The panel says the same.

### Review across scenes

Records are still keyed by frame id + object id in `review-store` (`reviewKey`, unchanged; a nuScenes
frame id is unique across scenes), so they survive scene changes. The top-bar progress is per scene. The export covers every scene:
`buildSceneReviewExport` writes format **`ai-detection-viewer/review@2`** — each row names its scene,
`frameIndex` counts within the scene, the file lists the scenes it covers; the CSV gains a leading
`scene` column. The export / reset menu counts the records of all scenes and says "in all scenes"
(Edge_F#7 Case 2); while some scenes are still loading it says the file cannot cover them yet.

### Measured (production build, 2026-11-27, headless Chromium; medians of three)

| | 20 Mbps | 9 Mbps |
|---|---|---|
| First screen (boxes, photo) | 0.97 s | 1.62 s |
| Points drawn | 1.34 s | 2.01 s |
| All ten scenes' boxes in memory | 2.6 s | 5.3 s |
| Photos late during playback (24 frames) | 0 | 11 (≤ 0.32 s) |

First screen needs 210 KB of data (compressed). JS heap after visiting all ten scenes: 53.8 MB.
3D idle cost on the 40-box frame equals the pre-F7 build when the two are measured alternately in
one session (integrated GPU: 57 vs 64 ms/s of JS, 42 draw calls, 60 fps both). On the largest frame
(156 boxes): integrated GPU 60 fps / 159 ms/s, software GL 53 fps / 583 ms/s — the box lines were
NOT merged (user decision; follow-up in HANDOFF §4, Edge_F#7 "Measured and NOT changed").
Not verified: a Vercel deployment with these 152 MB.

<!-- KO (move to a localized file)
## 장면, 나눠 받기, 검색 (F7) — 현재

F7(2026-11-27)부터 nuScenes 쪽은 장면 하나의 프레임 10개가 아니라 nuScenes-mini 전체를 쓴다:
**장면 10개, 프레임 404개, 박스 18,538개, 사진 2,424장.** 한꺼번에 받지 않고, 보는 장면을 고를 수 있고,
세 번째 모드 **Explore**에서 조건으로 프레임을 찾는다. 검수(F4), 평가(F5), 카메라 6대(F6)의 구조는 그대로다.
COCO는 그대로다. **이 절과 위의 F4·F5·F6 절이 데이터 양이나 받는 방법을 다르게 말하면 이 절이 현재 상태다.**

### 파일 (형식 1.3)

- `scenes.json`: 장면 목록(이름, 설명, 주행 기록(log), 프레임 수, 박스 수, 파일 경로).
- `scenes/<장면>/frames.json`: 프레임마다 박스와 카메라 6대. 점은 없고 "점 파일이 어디 있는지"만 있다.
- `scenes/<장면>/predictions.json`: 그 장면 사진의 예측(YOLOv8n, **원본 사진**으로 돌림).
- `scenes/<장면>/points/<프레임>.json`: 프레임 하나의 LiDAR 점 + 그 점을 제자리에 놓는 데 필요한 값.
- `cam_<채널>/*.webp`: 960×540으로 줄인 사진. `thumb/*.webp`: 앞 카메라 192×108.
- 파일 3,253개, 152.49 MB.
- **픽셀 좌표는 원본 사진(1600×900) 기준 그대로다.** 줄인 사진은 화면에 보이는 그림일 뿐이라, 투영한 박스·예측·IoU는
  바뀌지 않는다.
- **점 파일은 혼자서 완결된다.** `parseNuScenesPoints(raw, expectedToken)`은 다른 프레임의 파일이면 거절한다
  (한 순간의 측정 점을 다른 순간의 박스 밑에 그리지 않는다 — 규칙 6).
- 낮/밤은 nuScenes에 있는 값이 아니다. 장면 설명("Night, …")에서 읽는다. 밤 장면 3개는 모두 **주행 한 번**에서 잘라낸 것이다.

### 받기

- 목록 → **화면에 띄울 장면 먼저** → 나머지 장면은 뒤에서 두 개씩. 뒤에서 받은 장면들이 검색과 전체 장면 평가의 재료다.
- 점은 지금 프레임과 다음 3개만 받고 최근 24개를 기억한다. 사진은 다음 3프레임 것을 3장씩 받고 최근 72장을 기억한다.
- `useScenes`의 `onScreen`은 **마지막으로 다 받은 장면**이다. 다른 장면을 받는 동안 이전 장면이 화면에 남는다.
  실패하거나 프레임이 없는 장면은 화면의 장면을 밀어내지 않는다.
- 어느 장면을 먼저 받을지는 순수 함수(`lib/scenes/load-order.ts`)가 정한다. 변환은 `lib/nuscenes`, `lib/evaluation`에
  그대로 있다(규칙 3). 훅은 결과만 들고 있다.

### 장면 바꾸기

- `requestedScene`은 page의 상태다(선택도 필터도 아니므로 store에 넣지 않는다).
- 새 장면이 준비되면: 선택 해제, 재생 멈춤, 첫 프레임(또는 검색 결과가 가리킨 프레임)으로. 필터와 모드는 유지.
- **3D 캔버스를 다시 만들지 않는다.** `framingKey`가 바뀌면 캔버스 안의 `CameraPlacement`가 기존 카메라를 옮긴다.

### 타임라인: 눈금 막대

- COCO는 썸네일 10장 그대로. nuScenes는 프레임마다 막대가 있는 칸 하나(`scrubber`) — 41개가 스크롤 없이 들어간다.
- 칸의 높이·색은 순수 함수 `lib/ui/timeline-bars.ts`가 계산한다. 썸네일은 마우스를 올리면 나온다.

### Explore 모드와 검색

- **조건 하나는 프레임에서 숫자 하나를 재고 최솟값과 비교한다.** 같은 함수가 "센 박스"도 알려 준다. 그래서 목록의 숫자,
  패널의 숫자, 3D에서 색이 남은 박스가 어긋날 수 없다.
- 조건 종류: 물체(클래스·거리·최소 개수), LiDAR 점 0개 박스, 모델(놓침 / 헛짚음 / 근처에 정답 없는 헛짚음), 밤 장면.
  여러 조건은 "모두 만족"이다.
- 미리 만든 색인 없이, 메모리에 있는 장면을 화면이 쓰는 함수로 그대로 훑는다(측정: 105 ms, 모델 조건 첫 번째 198 ms).
- **모델 조건은 고정 규칙(점수 0.25, IoU 0.3)으로 계산한다.** 평가 모드의 슬라이더를 움직였다고 검색 결과가 바뀌면 안 된다.
- J / K는 결과를 장면을 넘나들며 이동한다.
- **Explore는 `selectedObjectId`를 건드리지 않는다(규칙 2).** 검색 강조는 따로 계산한 색 지도다.
- 실제 데이터로 잠근 값: "20 m 안 보행자 5명 이상" → 404개 중 177개(장면 7개), "모델이 15개 이상 놓침" → 135개.

### 전체 장면 평가

- `evaluateScenes`가 장면별·전체·낮/밤을 계산한다. 낮/밤에는 **주행이 몇 번인지**를 함께 낸다.
- 화면의 장면은 슬라이더를 움직일 때마다 바로 채점하고, 전체 장면은 슬라이더가 250 ms 멈춘 뒤에 한 번 채점한다
  (`useSettledValue`). `useDeferredValue`는 재 보니 매 단계마다 돌아서 화면을 막았다(Edge_F#7 Case 8).
- 기본 규칙, 404프레임(사진 2,424장): 찾음 6,726 / 놓침 5,292 / 헛짚음 3,514 / 채점 제외 5,278 → Precision 65.7%,
  Recall 56.0%. 낮 64%, 밤 33%. scene-0916의 첫 10프레임은 여전히 349 / 182 / 107 / 180, 앞 카메라 91 / 83 / 13 / 26.
- **표현 방침:** 낮/밤 차이는 "관찰됐다"고 쓴다. 밤 장면은 주행 1회라는 단서를 붙인다. 전체 숫자를 "모델 성능"이라
  부르지 않는다. 원인을 주장하지 않는다. 화면에도 같은 말이 있다.

### 장면을 넘는 검수

- 기록은 그대로 "프레임 ID + 물체 ID"로 저장한다(nuScenes의 프레임 ID는 장면이 달라도 겹치지 않는다). 그래서 장면을 바꿔도 남는다. 위쪽 진행률은 장면별이다.
- 내보내기는 전체 장면을 담는다(`review@2`: 줄마다 장면 이름, CSV 맨 앞에 `scene` 열). 메뉴의 개수도 전체 장면 기준이다.

### 측정 (배포용 빌드, 2026-11-27)

- 첫 화면 0.97초(20 Mbps) / 1.62초(9 Mbps). 점 1.34 / 2.01초. 장면 10개 전부 2.6 / 5.3초. 첫 화면 데이터 210 KB.
- 재생 중 늦은 사진: 20 Mbps 0프레임, 9 Mbps 11프레임(0.32초 이하).
- 박스 40개 프레임의 3D 비용은 F7 이전 빌드와 같다(같은 자리에서 번갈아 잼). 박스 156개 프레임: 내장 GPU 60 fps,
  소프트웨어 렌더링 53 fps. 박스 선을 합치지 않았다(사용자 결정, 후속 작업으로 기록).
- 확인하지 못한 것: 152 MB를 실은 Vercel 배포.
-->

## Trustworthy Evaluation (F7.5) — current

F7.5 (2026-11-27) adds nothing to WHAT is evaluated. It makes what evaluate mode already shows
checkable: a sample check of the false alarms that have no label nearby, a choice of the IoU
threshold, a report with the per-drive table and the day / night comparison at equal distance, and
the conditions next to every number. **No scoring rule changed** — every number locked before F7.5
is unchanged. Design: `docs/plan-feature/F7.5_trustworthy_evaluation.md`; edge cases: `Edge_F#7.5.md`.

### What is fixed and what follows the controls

| | Rules |
|---|---|
| Evaluate mode (scene on screen, "All scenes", the report's totals and tables) | `{ minScore: slider, iouThreshold: IoU choice }` |
| Explore's model conditions (F7) | `DEFAULT_EVALUATION_RULES` (0.25 / 0.3) — unchanged |
| The sample check: its population, AND everything on screen while it is open | `DEFAULT_EVALUATION_RULES` |
| The report's "1,452 of 3,514" block | `DEFAULT_EVALUATION_RULES` (it says so) |

`page.tsx`: `evaluationRules = sampleCheckOn ? DEFAULT_EVALUATION_RULES : { minScore, iouThreshold }`.
`iouThreshold` is page state (a view setting; `IOU_THRESHOLD` by default, reset by Reset and by a
dataset switch, kept across mode switches). The store is untouched. The slider's value is never
written by the sample check, so it is where it was on leaving.

### The sample check

```
all scenes in memory (useScenes.library) ── sampleAvailability ──▶ ready | loading n/N | unavailable(reason)
        │ ready
        ▼
evaluateFrames(scene, DEFAULT rules) per scene ─▶ listUnlabelledFalseAlarms   (POPULATION, fixed order: 1,452)
        ▼ drawOrder(population, SAMPLE_SEED)                                   (one seeded shuffle)
        ▼ sampleOf(order, size)                                               (SAMPLE = the first 100 / 200 / 300)
review-store.reviews['nuscenes-false-alarms']["frameId/predictionId"] = ReviewRecord
        ├─ summarizeSample ─▶ counts + estimateShare per verdict (Wilson 95 %, finite population)
        ├─ nextUnjudged ────▶ auto-advance after a verdict (across scenes)
        └─ buildSampleExport ─▶ false-alarm-sample@1 (JSON)
```

- **Population** = false alarms with `nearest === null` (IoU < `NEAREST_MIN_IOU` 0.1 with every label
  of the photo) at the default rules. It is the same set at IoU 0.3 and 0.5 (a box that overlaps
  nothing cannot be matched or absorbed at either), so the IoU choice cannot move the sample. Locked
  by tests: 1,452 boxes, equal to Explore's "unlabelled" count.
- **The sample exists only when every scene of the catalog is loaded with predictions.** Drawn from a
  part of the population it would be another list, and stored verdicts would silently stop matching.
  Until then: "n of N are loaded…"; a failed scene or a scene without predictions → no sample, with
  the reason (never "the other nine").
- **Order, not a subset.** The population is shuffled once; the sample of size N is its first N. So
  200 starts with the 100 already judged. The size is page-hook state; before the user picks one it
  is `sampleSizeForRecords` — the smallest offered size that contains every stored verdict.
- **Selection (Rule #2).** A sampled box is selected like any false alarm: `selectedObjectId` =
  its prediction id. There is no "box being judged" state — `current` is the sampled item whose id is
  selected. `useActiveCamera(frame, selectedId, enabled, preferred)` got `preferred =
  cameraOfPredictionId(selectedId)`: a model box belongs to exactly one photo and its id names it, so
  selecting it from anywhere shows that photo.
- **Opening a box** in another scene uses the same path as a search hit: `handleOpenHit({scene,
  frameId, objectId})` → request the scene, remember `pendingFrame`, and once that scene is on screen
  select the frame AND the object. The pending effect is declared after the scene-change effect that
  clears the selection (effects run in declaration order).
- **Verdicts** are ordinary review records in a third scope. `approved` / `rejected` / `unsure` read
  as a review of the model's box: real object with no label / model wrong / unclear
  (`toSampleVerdict`, spelled out in words in the export). Nothing that reads the two label scopes
  reads this one; the `storage` sync and `sanitizeReviews` cover it unchanged. A record whose box is
  not in the current sample is ignored.
- **Keys:** `resolveShortcut` unchanged; while the check is on, the page routes `verdict` / `clear` /
  `step` to the controller and ignores reasons and next-frame.
- **`MIN_LOOK_MS` = 400:** a verdict is accepted only after its box has been current for that long
  (Edge_F#7.5 Case 1). Blocked entirely while the sequence plays.
- **Wording (Rule #6):** `lib/sampling/describe.ts` builds every sentence — always "N of M" and, for
  the population, "about X–Y %". Never a count of the whole set, never "≈ N boxes".
- **What is NOT done with the verdicts:** nothing is re-scored. Precision still counts all 1,452 as
  false alarms; the panel and the report say so.

### IoU choice and the conditions line

- `IouChoice` sits in `Filters`' new `afterMetric` slot (`afterMetricIsDefault` keeps Reset honest).
  `Filters` also has an `extra` slot on the right (the "Sample check" entry). The bar still knows
  nothing about evaluation.
- `EvaluationPanel` renders `ConditionsLine` between the pinned result and the scrolling area:
  `describeModelConditions(model)` + score (the file minimum when the slider is below it) + IoU. "no
  fine-tuning" appears only when `describeWeights(model.weights)` recognises an Ultralytics release
  file name; any other name is shown as `weights <name>` with no claim. The panel header now states
  what was scored ("6 cameras · 246 photos").
- At IoU 0.5 the notes add why the benchmark value is strict for projected labels.

### The report

`WorkspaceShell` has an `overlay` slot: a grid item in the same cells as the list and the 3D view
(columns 1–2, row 1; `order-first` when stacked), above them (`z-20`). The zones underneath stay
mounted — the canvas is not re-created — and the review shortcuts are off while it is open.
`EvaluationReport` (role `dialog`, Esc closes, opened from the top bar's "Report" or the link under
"All scenes"):

| Block | From |
|---|---|
| "Measured with" chips | `describeModelConditions` + the rules in effect |
| Total (one decimal), "N labels are M distinct objects … in D drives" | `evaluateScenes(...).total` (`scoredObjects`, `drives`) |
| False alarms: "1,452 of 3,514 (41%)" + "Not checked yet" / the sample's progress and estimate | `useSampleCheck` (fixed rules) |
| Recall by drive | `summarizeDrives(scenes)` |
| Day vs night at the same distance | `compareByDistance(day.byDistance, night.byDistance)`, `distanceGap` |

- `evaluateScenes` now also returns, per scene and per group, `byDistance` (the 10 m recall bands) and
  `scoredObjects` (distinct object ids with a scored label; scenes also carry the id set so a group
  counts the union). `SceneInput` takes `driveDate` / `driveLocation` for the drive rows.
- Bands are listed up to the last one with ≥ 50 labels in BOTH groups; everything beyond is one
  open-ended row. The sentence under the table subtracts the percentages AS PRINTED.
- Columns: three from 1536 px, two from 1280 px, one below; the tables keep a minimum width and
  scroll sideways inside their block on a phone.

### Numbers (shipped data, default rules unless said; locked by tests)

- Population 1,452 of 3,514 false alarms (41 %). By scene 0103: 445, 0655: 260, 0757: 154, 0553: 140,
  0061: 122, 0916: 94, 1094: 94, 1100: 62, 0796: 53, 1077: 28. By class car 1,129, person 238, bus 34,
  truck 30, bicycle 21.
- IoU 0.5: 5,462 / 6,556 / 5,231 / 5,278 → P 51.1 %, R 45.4 %; day 52.3 %, night 25.9 %.
- 12,018 scored labels = 654 distinct objects (483 day, 171 night) in 8 drives.
- Day vs night recall per band (found/labels): 0–10 m 838/1108 vs 154/280 … 80–90 m 42/115 vs 1/56,
  90 m+ 15/80 vs 3/77. Night recall re-weighted to the day distance mix: 33.9 % (plain 32.7 %; day
  64.1 %) — the distance mix accounts for 1.2 of the 31.4 points.
- `estimateShare(41, 100, 1452)` → 32.2–50.5 %.

<!-- KO (move to a localized file)
## 믿을 수 있는 평가 (F7.5) — 현재

F7.5(2026-11-27)는 무엇을 평가하는지에는 아무것도 더하지 않는다. 평가 모드가 이미 보여 주는 것을 확인할 수 있게 한다:
근처에 정답이 없는 헛짚음의 표본 검수, IoU 기준 고르기, 주행 단위 표와 같은 거리끼리의 낮/밤 비교가 든 보고서,
모든 숫자 옆의 조건. **채점 규칙은 바뀌지 않았다.** F7.5 전에 잠긴 숫자는 모두 그대로다.

### 고정된 것과 조작을 따르는 것
- 평가 모드(화면의 장면, "All scenes", 보고서의 전체 숫자와 표): 슬라이더의 점수 + 고른 IoU.
- Explore의 모델 조건(F7): 기본 규칙(0.25 / 0.3) 그대로.
- 표본 검수의 모집단, 그리고 표본 검수가 열려 있는 동안 화면의 모든 것: 기본 규칙.
- 보고서의 "1,452 of 3,514" 블록: 기본 규칙(그렇게 적혀 있다).
- `iouThreshold`는 page의 화면 설정이다(기본 0.3, Reset과 데이터셋 전환으로 되돌아가고 모드 전환에는 유지). store는
  바뀌지 않았다. 표본 검수는 슬라이더 값을 쓰지 않으므로 나올 때 그대로다.

### 표본 검수
- 흐름: 모든 장면이 메모리에 있는가(`sampleAvailability`) → 장면별 기본 규칙 채점 → `listUnlabelledFalseAlarms`
  (모집단, 고정된 순서, 1,452개) → `drawOrder`(고정 시드로 한 번 섞음) → `sampleOf`(앞의 100 / 200 / 300개).
  판정은 `review-store`의 `nuscenes-false-alarms` 구역에 (프레임 ID, 예측 ID)로 저장된다. `summarizeSample`이 개수와
  추정(Wilson 95%, 유한 모집단 보정)을, `nextUnjudged`가 판정 뒤의 다음 박스를, `buildSampleExport`가 내보내기를 만든다.
- 모집단은 기본 규칙에서 `nearest === null`인 헛짚음이다. IoU 0.3과 0.5에서 같은 집합이라 IoU 고르기가 표본을 바꿀 수 없다.
- 표본은 목차의 모든 장면이 예측과 함께 올라왔을 때만 있다. 일부만으로 뽑으면 다른 목록이 되고 저장된 판정이 조용히
  어긋난다. 그 전에는 "n of N are loaded…", 장면이 실패했거나 예측이 없으면 이유와 함께 표본 없음.
- 부분집합이 아니라 순서다: 한 번 섞은 순서의 앞 N개가 표본이라, 200개는 이미 판정한 100개로 시작한다. 크기를 고르기
  전에는 저장된 판정을 모두 담는 가장 작은 크기로 연다(`sampleSizeForRecords`).
- 선택(불변 규칙 #2): 표본의 박스도 `selectedObjectId`에 예측 ID를 넣어 고른다. "판정 중인 박스"라는 상태는 없다.
  `useActiveCamera`가 `preferred = cameraOfPredictionId(selectedId)`를 받는다(모델 박스는 한 사진에만 있고 ID에 카메라가
  들어 있다).
- 다른 장면의 박스 열기는 검색 결과를 여는 길과 같다(`handleOpenHit({scene, frameId, objectId})`). 장면이 올라온 뒤
  프레임과 물체를 함께 선택한다. 선택을 지우는 장면 전환 효과보다 뒤에 선언돼 있다(효과는 선언 순서로 실행된다).
- 판정은 세 번째 구역의 보통 검수 기록이다. `approved` / `rejected` / `unsure`를 모델 박스에 대한 판정으로 읽는다
  (진짜 물체인데 정답 없음 / 모델이 틀림 / 애매함). 정답 박스 구역을 읽는 코드는 이 구역을 읽지 않는다.
- 키: `resolveShortcut`은 그대로다. 표본 검수 중에는 page가 판정 / 지우기 / 이동을 컨트롤러로 보내고 사유와 다음
  프레임 키는 무시한다.
- `MIN_LOOK_MS` = 400: 박스가 화면에 그만큼 있은 뒤에만 판정을 받는다(Edge_F#7.5 Case 1). 재생 중에는 막는다.
- 문구(불변 규칙 #6): 모든 문장을 `lib/sampling/describe.ts`가 만든다. 항상 "N of M", 모집단에 대해서는 "about X–Y %".
- 판정으로 하지 않는 것: 다시 채점하지 않는다. Precision은 여전히 1,452개를 모두 헛짚음으로 센다(그렇게 적혀 있다).

### IoU 고르기와 조건 한 줄
- `IouChoice`는 `Filters`의 새 자리 `afterMetric`에 들어간다(`afterMetricIsDefault`로 Reset이 켜지고 꺼진다).
  오른쪽의 `extra` 자리에는 "Sample check" 버튼이 있다. `Filters`는 여전히 평가를 모른다.
- `EvaluationPanel`의 `ConditionsLine`: 모델, 학습, 입력 크기, 점수(슬라이더가 파일의 최솟값 아래면 그 최솟값), IoU.
  "no fine-tuning"은 가중치 파일 이름이 알려진 배포 파일일 때만 나온다. 패널 제목 옆은 무엇을 채점했는지를 말한다.

### 보고서
- `WorkspaceShell`의 `overlay` 자리: 목록과 3D 화면과 같은 칸에 놓이고 그 위에 그려진다. 밑의 칸은 그대로 있어 캔버스가
  다시 만들어지지 않고, 열려 있는 동안 검수 단축키는 꺼진다.
- `EvaluationReport`: 조건 칩, 전체(소수 한 자리)와 "정답 N개는 서로 다른 물체 M개, 주행 D번", 헛짚음("1,452 of 3,514"와
  "Not checked yet" 또는 표본의 진행과 추정), 주행 표(`summarizeDrives`), 같은 거리끼리의 낮/밤(`compareByDistance`,
  `distanceGap`).
- `evaluateScenes`가 장면과 무리마다 `byDistance`와 `scoredObjects`도 준다. 구간은 두 무리 모두 정답 50개 이상인 마지막
  구간까지 따로, 그 밖은 한 줄로 합친다. 표 아래 문장은 화면에 찍힌 퍼센트끼리 뺀다.
- 칸: 1536px부터 세 칸, 1280px부터 두 칸, 그 아래 한 칸. 휴대폰에서는 표가 그 칸 안에서 옆으로 스크롤된다.

### 숫자 (실린 데이터, 테스트가 잠금)
- 모집단 1,452 / 헛짚음 3,514(41%). IoU 0.5: 5,462 / 6,556 / 5,231 / 5,278 → Precision 51.1%, Recall 45.4%, 낮 52.3%,
  밤 25.9%. 채점된 정답 12,018개 = 서로 다른 물체 654개(낮 483, 밤 171), 주행 8번. 거리 분포를 낮에 맞춘 밤 Recall
  33.9%(그대로는 32.7%, 낮 64.1%). `estimateShare(41, 100, 1452)` → 32.2~50.5%.
-->

### Layout (after Step 9.5) — superseded by F3

Kept as history. Proposal B was the adopted layout from Phase 3 until F3. `page.tsx`
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
| `lib/nuscenes/`  | (F2 ✅) Parse the offline-prepped nuScenes static JSON into `Frame[]` (`parseNuScenes`) | Touch React / Zustand; traverse raw relational tables (the prep script flattens those) |
| `lib/geometry/`  | 2D→3D math, point cloud generation; (F2) coordinate-frame transforms (global→ego, **sensor→global** for LiDAR, axis convention), 3D→2D projection, and 3D camera framing (`frameBoxesForCamera`); (F2-D) follow-target selection (`selectFollowTarget`) + pose interpolation (`lerpVec3`/`slerpQuat`) | Touch React / Zustand             |
| `lib/selectors/` | Pure store derivations: filters (Step 7), chart aggregations (Step 9.5), (F2) distance filter, (F2-B) `selectVisiblePoints` (point-cloud visibility: owned points obey the box filter, environment points always show), (F2-E) `frameHasConfidence` (provenance → whether `confidence` is a real score worth rendering) | Touch React / Zustand / Three.js  |
| `lib/ui/`        | Shared UI-layer constants (colors etc.) | Touch React / Zustand / Three.js |
| `lib/sequence/`  | (F2-C) Pure keyframe-sequence playback logic — `nextFrameIndex` (which frame is next, loop/stop) + the autoplay cadence constant | Touch React / Zustand / Three.js; own the timer (the `setInterval` lives in `page.tsx`) |
| `store/`         | UI state (selection, filters)          | Hold frame data, do parsing       |
| `components/`    | Rendering, event handling              | Do parsing or coordinate math     |
| `scripts/`       | (F2 ✅ `prep_nuscenes.py`) **Offline, build-time only** — flatten chosen nuScenes-mini frames into static JSON + copy assets; (F2-B) decode LIDAR_TOP `.pcd.bin` and voxel-grid **decimate** the points. NOT runtime. Mirrors Step 11's `generate_predictions.py`. | Run at request time / be a backend server; do coordinate math (decimation is subsampling, not a transform — the real transforms live in `lib/`, tested) |

## COCO Raw Schema Types

External COCO JSON is described by a separate type set in `lib/coco/types.ts`.
These are kept distinct from the internal `Frame` / `Detection2D` types so that
adding another input dataset (nuScenes — see "nuScenes Integration" below) does
not leak through the rest of the app. nuScenes is added *alongside*
COCO (a dataset switcher), not as a replacement, so the Step 11 YOLO / confidence
work stays live.

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

## nuScenes Integration (F2-A ✅, F2-B ✅, F2-C ✅ Done)

Structure/contract notes only; per-feature progress + decisions live in
`post-mvp-checklist.md` (F2). nuScenes replaces *estimated* 3D with *measured* 3D.

**Status (F2-A complete):** pure `lib/` core (`lib/geometry/transforms.ts` +
`projection.ts` + `camera-framing.ts`, `lib/nuscenes/parser.ts` + `types.ts`),
offline prep + sample data (`scripts/prep_nuscenes.py` → `public/sample-data/
nuscenes/nuscenes.json` + `cam_front/`, scene-0916), **and the full UI**: a
Header dataset switcher + Estimated/Measured badge (`Frame.source`), `BBox3D`
rotation, projected 2D + selection sync, a `lib/selectors` distance filter
(`detectionDistance` + `selectIdsWithinDistance`) surfaced via a per-dataset
slider swap, and per-dataset 3D camera framing + fog. Two visible-id sets are
derived in `page.tsx` (2D for Viewer2D/ObjectList, 3D for Viewer3D) so measured
3D-only boxes still render (Edge_F#2 Case 2). Render-verified via Playwright.
The app **opens on nuScenes by default** (`page.tsx` initial `datasetId =
'nuscenes'`) so the landing view is the measured-3D headline; the Header switcher
flips to COCO.

**Status (F2-B complete):** the empty `pointCloud` is replaced by the frame's real
**LiDAR_TOP** points. The prep script decodes the `.pcd.bin` sweep (stdlib `struct`,
5×`float32`/point) and **voxel-grid decimates** it (~6.5k pts/frame), carrying the
raw sensor-frame points inline in `nuscenes.json` (`lidar.points`, flat array) plus
the LiDAR `ego_pose` + `calibrated_sensor`. `parseNuScenes` aligns each point to the
boxes — `sensorToGlobal` → `globalToEgo` → `egoToThree` — and emits `Point3D`s with
**no** `detectionId`. Those environment points are always shown
(`selectVisiblePoints`), independent of the box filters. Render-verified: the
concentric LiDAR rings centre on the ego/sensor origin and the boxes sit embedded in
the surrounding cloud. **Next:** F2-C (sequence + tracking).

**Transform pipeline (implemented).** Two outputs are derived from one
GLOBAL-frame annotation, both pure math in `lib/geometry`:
- *3D render coords:* `globalToEgo` (`R_ego⁻¹·(p−t_ego)`, physical z-up) → axis
  flip `egoToThree` `(x,y,z)→(-y,z,-x)` (det=+1 pure rotation: up→y, fwd→−z;
  preserves handedness so quaternions/orientation stay correct). Rotation:
  `globalQuatToEgo` then `egoQuatToThree` (= `q_flip · q_ego`). Size `[w,l,h]`
  (nuScenes) → `[l,w,h]` local-axis order (`nuSizeToLocal`).
- *2D box:* the SAME physical-ego box is projected (`egoToCamera` + intrinsic
  `cameraToPixel`) and the AABB of its 8 projected corners becomes the
  `Detection2D.bbox`. Projection stays in the physical convention (NOT the
  render-flipped frame). A box with any corner behind the camera, or that falls
  fully off-screen, yields **no 2D box but still renders in 3D** — Rule #1 is
  "same object ⇒ same id", not "every 3D has a 2D". See Edge_F#2 Case 1.

- *LiDAR points (F2-B):* points are born in the **LiDAR sensor frame**, so they take
  an extra hop before joining the boxes: `sensorToGlobal` (LiDAR `calibrated_sensor`
  → LiDAR `ego_pose`, the inverse direction of `globalToEgo`) → `globalToEgo` (the
  frame's **CAM_FRONT** `egoPose`, the frame the boxes live in) → `egoToThree`.
  Routing through GLOBAL is deliberate: the LiDAR and camera fire at slightly
  different times, so their `ego_pose`s differ; going via the fixed global frame
  absorbs that offset and keeps points on the boxes (applying the LiDAR calibration
  alone would leave the cm-scale mismatch).

Quaternion order: nuScenes is `[w,x,y,z]`; Three.js / `Detection3D.rotation` is
`[x,y,z,w]`. `quatNuToThree` is the single conversion point (absent → identity).

**Why a prep step at all.** nuScenes is a relational token graph
(`sample → sample_data → {ego_pose, calibrated_sensor}`, `sample_annotation →
instance → category`) and ships large LiDAR files. Traversing/decoding that in the
browser at runtime is impractical and we run no backend. So a **one-time offline
script** (`scripts/`, build-time only — like Step 11's `generate_predictions.py`)
selects a few keyframes from **nuScenes-mini**, flattens the tables, copies the few
camera images, and emits a compact static JSON the browser parses like COCO.

**Where the coordinate math lives.** The prep script does *no* coordinate math — it
only flattens and copies **raw** values. All transforms live in `lib/` TypeScript
(Immutable Rule #3) and are Vitest-tested. The prepped JSON therefore carries the
raw inputs the transforms need:
- 3D boxes in the **global** frame (center, size, rotation quaternion),
- `ego_pose` (global→ego) and `calibrated_sensor` (ego→sensor + camera `intrinsic`),
- the `instance` token per annotation (→ stable id; also the F2-C track id),
- (F2-B) `lidar`: decimated sensor-frame points (flat `[x,y,z,…]`) + the LiDAR's own
  `ego_pose` and `calibrated_sensor` (the two extra poses `sensorToGlobal` consumes).

**Two facts that shape the first slice (verified during planning):**
1. nuScenes annotations are in the **global** frame, so even "boxes only" needs a
   real transform (global→ego) + the z-up→y-up axis convention. There is **no**
   zero-transform path like KITTI Level 1.
2. nuScenes core annotations are **3D-only** — no 2D boxes. To keep the 2D↔3D sync
   signature, `lib/` **projects** each 3D box into the camera image (intrinsic +
   extrinsics) to produce the `Detection2D`. 2D and 3D derive from the **same
   `instance` annotation**, so they share one id → Immutable Rule #1 preserved.

**Phasing** (see F2 in `post-mvp-checklist.md`):
- **F2-A** — measured 3D boxes (global→ego + axis) + projected 2D boxes + 2D↔3D
  sync; `bbox3D.rotation` quaternion; distance filter; `source` badge. `pointCloud`
  stays empty (no fake points). No sequence.
- **F2-B** ✅ — real LiDAR point cloud: decode/decimate `pcd.bin` (offline, voxel grid),
  align in `lib/` via `sensorToGlobal` → `globalToEgo` → `egoToThree`. Environment
  points (no `detectionId`) always render via `selectVisiblePoints`.
- **F2-C** ✅ — sequence + tracking + autoplay: the `instance` token gives cross-frame identity, so
  on nuScenes `selectedObjectId` SURVIVES a frame switch (tracking) and a Timeline play/pause control
  steps the keyframes at ~2 Hz showing the same object move; the 3D camera is held stable (no
  per-frame remount + frozen framing). COCO is unchanged (clears selection, remount-resets). Logic
  split: pure `nextFrameIndex` in `lib/sequence` (Rule #3), timer + dataset-aware policy in `page.tsx`.
  Boxes snap between keyframes (no tween); seams for box-tween and camera-follow are left clean. See
  Edge_F#2 Case 5 (selection persistence) + Case 6 (camera stability).
- **F2-D** ✅ — motion/camera polish on top of F2-C, built on those two seams. **D-1 camera follow:**
  an opt-in Fixed/Follow toggle aims OrbitControls at the selected box (`selectFollowTarget`), falling
  back to the fixed framing when nothing is followable. **D-2 box tween:** during autoplay each box
  glides between keyframes (`lerpVec3`/`slerpQuat`), while paused/scrubbing snaps to the exact measured
  pose (Rule #6); the LiDAR cloud stays per-keyframe. See Edge_F#2 Case 7 + Case 8.

**Filter (F2-A ✅):** a pure **distance** selector in `lib/selectors/distance-filter.ts`
(`detectionDistance` = `|bbox3D.center|`; `selectIdsWithinDistance(detections3D, max)`).
Because the ego→three axis flip is a pure rotation (det = +1), `|center|` is the real
distance in metres from the ego vehicle. The UI **swaps** the slider per dataset
(`filterMode`): nuScenes shows the **Distance** slider (metres, store `maxDistance`,
default `DISTANCE_MAX=90` = "All"); COCO shows the **Confidence** slider. A metre
filter is never shown over COCO's *estimated* depth, and no fake confidence is
injected on nuScenes (confidence = 1.0 annotation) — Immutable Rule #6.

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

**Cell-filling wrapper (F3, replaces the Step 9.5 fixed-aspect wrapper).** The
`Viewer2D` wrapper is `w-full h-full`: the `WorkspaceShell` camera cell decides
the size (16:9 on nuScenes, 4:3 on COCO via `cameraAspect`). The SVG still uses
`w-full h-full` with `preserveAspectRatio="xMidYMid meet"`, so a photo whose
ratio differs from the cell (COCO portrait / square) is letter- or pillar-boxed
inside it. Timeline stability — the reason for the old fixed wrapper — now comes
from the shell: the timeline row sits at the bottom of a fixed-height grid, so
it cannot move when a frame switch changes the photo's aspect ratio.

Step 9.5 history: `Viewer2D` was wrapped in an `aspect-[4/3]` container
(mirroring `Viewer3D`) so the grid row height was deterministic and the
Timeline stopped jittering on frame switches.

**Corner tag (F3).** Optional `label` prop renders a `ViewerLabel` in the
top-left corner (`pointer-events-none`, so clicks still reach the wrapper's
deselect handler).

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
  label?: string;                          // F3 — corner name tag ("CAM_FRONT" / "Image")
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

**nuScenes sample (F7).** `public/sample-data/nuscenes/` holds all of **nuScenes-mini** in the
prepped, split form described in "Scenes, Chunked Loading and Search (F7)": 10 scenes, 404
keyframes, 18,538 boxes, 2,424 photos — 3,253 files, 152.49 MB. Generated by
`scripts/prep_nuscenes.py` and `scripts/predict_nuscenes.py` from the download at
`C:\data\sets\nuscenes` (outside the repo); both scripts are deterministic. nuScenes is licensed
CC BY-NC-SA 4.0 (non-commercial); the attribution is in the README. The photos are reduced copies
(960×540 WebP) — the originals are not in the repo.

## Testing Boundaries

Tests follow the same layer boundaries as "Separation of Concerns". Each layer has a designated test style.

| Layer            | Test style                | What to verify                                                  |
|------------------|---------------------------|-----------------------------------------------------------------|
| `lib/coco/`      | Unit                      | COCO JSON → `Frame[]` conversion correctness and edge cases     |
| `lib/geometry/`  | Unit                      | 2D bbox → 3D bbox / point cloud math correctness                |
| `lib/selectors/` | Unit                      | Filter semantics; locked invariants (e.g. permissive-empty)     |
| `lib/review/`    | Unit                      | (F4) Record transitions, progress, queue / next box, shortcuts key map, export text, stored-data validation, practice set determinism + scoring |
| `lib/search/`, `lib/scenes/`, `lib/data/` | Unit | (F7) Condition value = the boxes it names; normalisation; hits, order, stepping across scenes; which scenes to request next (a hanging scene does not block the others); cache eviction order |
| Shipped data     | Unit (reads `public/`)    | (F5–F7) The numbers the docs quote are computed from the shipped files (`sample-data.test.ts`, `scene-files.test.ts`): if the data or the rules change, the test says which number moved |
| `store/`         | Unit                      | Actions update state correctly; selectors return expected data. (F4) `review-store`: built per test with an in-memory storage backend (`createReviewStore(backend)`) — save / load / validate / storage failure |
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
