'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AUTOPLAY_INTERVAL_MS, nextFrameIndex } from '@/lib/sequence';
import {
  detectionDistance,
  selectClassCounts,
  selectConfidenceBuckets,
  selectIdsWithinDistance,
  selectVisibleDetectionIds,
  selectVisibleDetectionIds3D,
} from '@/lib/selectors';
import { Viewer2D } from '@/components/viewer-2d';
import {
  CameraStrip,
  CameraStripPlaceholder,
  useActiveCamera,
  usePhotoPreload,
  type CameraThumb,
} from '@/components/camera';
import { Viewer3D } from '@/components/viewer-3d';
import { ObjectList } from '@/components/object-list';
import { Filters } from '@/components/filters';
import { Header, type DatasetId } from '@/components/header';
import { useDataset, useFramePoints, useScenes } from '@/components/dataset';
import { ScenePicker, type SceneStat } from '@/components/scenes';
import { ExploreBar, ExploreResults, SearchPanel } from '@/components/explore';
import { Timeline, type TimelineBadge } from '@/components/timeline';
import { AnalyticsPanel } from '@/components/analytics';
import { PANEL_CLASS, WorkspaceShell } from '@/components/workspace';
import {
  BevEditor,
  EDIT_BLOCK_MESSAGES,
  EditBar,
  EditPanel,
  useBoxDraft,
  useBoxEditor,
  useDraftFrame,
  useEditShortcuts,
  useEditedFrames,
  useEditedSummary,
  useStoredEdits,
} from '@/components/box-edit';
import {
  BoxColorLegend,
  EvaluationHeadline,
  EvaluationPanel,
  EvaluationReport,
  IouChoice,
  ModeSwitch,
  OverlayLegend,
  ResultList,
  SelectedResult,
  useFrameResults,
  useSettledValue,
  type PredictionsState,
  type NotEvaluatedBox,
  type WorkMode,
} from '@/components/evaluation';
import {
  SampleBar,
  SampleList,
  SamplePanel,
  useSampleCheckController,
} from '@/components/sample-check';
import { toSampleVerdict } from '@/lib/sampling';
import {
  BICYCLE_RACK_CLASS,
  DEFAULT_MIN_SCORE,
  IOU_THRESHOLD,
  cameraOfPredictionId,
  compareByDistance,
  frameOfPredictionId,
  describeOtherViews,
  evaluateFrames,
  evaluateScenes,
  findResult,
  formatPercent,
  isPredictionId,
  outcomeCountLabel,
  recallOf,
  selectionIdOf,
  summarizeDrives,
  visibilityText,
  type EvalKind,
  type EvaluationRules,
} from '@/lib/evaluation';
import { DISTANCE_MAX } from '@/lib/ui/distance';
import {
  camerasByBestView,
  cameraShortName,
  cameraViews,
  frameAsCamera,
  inDisplayOrder,
  preloadOrder,
  stepCamera,
} from '@/lib/cameras';
import {
  ExportMenu,
  PracticeScoreCard,
  usePracticeCloseness,
  QueueBar,
  ReviewControls,
  ReviewProgress,
  UTF8_BOM,
  downloadTextFile,
  useReviewShortcuts,
} from '@/components/review';
import {
  SHORTCUT_KEYS,
  buildQueue,
  buildSceneReviewExport,
  getReview,
  getReviewBlock,
  nextFrameWithUnreviewed,
  nextUnreviewed,
  nextUnsure,
  orderBoxes,
  reviewExportFilename,
  reviewExportToCsv,
  reviewExportToJson,
  scorePractice,
  stepInQueue,
  summarizeProgress,
  verdictsOfFrame,
  type QueueOrder,
  type RejectReason,
  type ReviewAction,
  type ReviewExportFileType,
  type ReviewScope,
  type Verdict,
} from '@/lib/review';
import { REVIEW_STORAGE_KEY, useReviewStore, useViewerStore } from '@/store';
import { stepScene } from '@/lib/scenes';
import {
  SEARCH_PRESETS,
  conditionValue,
  describeValue,
  highlightedBoxIds,
  matchesCondition,
  needsEvaluation,
  resultsForConditions,
  searchScenes,
  sortHits,
  stepHit,
  type HitOrder,
  type SearchCondition,
  type SearchFrameContext,
  type SearchHit,
  type SearchScene,
} from '@/lib/search';
import type { Frame, Point3D } from '@/lib/types';

// Static sample sources. Everything is served from /public; there is no
// backend (nuScenes was flattened offline by scripts/prep_nuscenes.py).
//  - COCO: one file with every frame.
//  - nuScenes (F7): a catalog of scenes; each scene's boxes, each frame's
//    points and photos are fetched as they are needed (see `useScenes`).
const COCO_SOURCE = '/sample-data/sample.json';
const NUSCENES_CATALOG = '/sample-data/nuscenes/scenes.json';
// The scene the app opens on. Its first ten frames are the ten frames the app
// shipped before F7, so saved reviews and familiar numbers are where they were.
const DEFAULT_SCENE = 'scene-0916';

// (F6, F7) How many frames ahead of the current one the photos and point
// clouds are fetched in the background. One frame is six photos plus a points
// file (~300 KB); playback moves every half second. Three frames is 1.5 s of
// lead — enough at ordinary speeds without downloading a scene nobody plays.
const PRELOAD_FRAMES_AHEAD = 3;
// (F7) How much fetched data is held in memory; older entries are dropped (and
// are still in the browser's HTTP cache). With ten frames nothing was dropped;
// with 404 that would grow without end.
const POINT_CLOUDS_KEPT = 24; // frames (~0.4 MB of points each)
const PHOTOS_KEPT = 72; // photos = 12 frames × 6 cameras

// (F7) How long the score slider must rest before all scenes are re-scored.
const ALL_SCENES_SETTLE_MS = 250;

const NO_FRAMES: Frame[] = [];
const NO_POINTS: Point3D[] = [];
const NO_CLASS_FILTER = new Set<string>();
const NO_HITS: SearchHit[] = [];
const NO_KIND_FILTER: ReadonlySet<EvalKind> = new Set();
// (F7) Explore: the wire colour of boxes that do NOT count toward the search.
const SEARCH_DIM_COLOR = '#52525b'; // zinc-600
// (F7) Conditions about the model (missed labels, false alarms) are offered
// in Explore. They are evaluated at the default rules, not the slider's.
const MODEL_CONDITIONS = true;
const DEFAULT_EVALUATION_RULES: EvaluationRules = {
  minScore: DEFAULT_MIN_SCORE,
  iouThreshold: IOU_THRESHOLD,
};

// Set intersection (no Set.prototype.intersection in our target runtimes).
const intersectIds = (a: Set<string>, b: Set<string>): Set<string> =>
  new Set([...a].filter((id) => b.has(id)));

export default function Index() {
  // The active dataset. COCO and nuScenes coexist (F2-A) — the switcher in the
  // Header flips this, which re-runs the loader below. Default = nuScenes so the
  // app opens on the measured-3D headline feature.
  const [datasetId, setDatasetId] = useState<DatasetId>('nuscenes');
  // (F2-C) Autoplay: step through the keyframe sequence on a timer. Only
  // meaningful on nuScenes, where objects keep their `instance` id across frames
  // (track id) so playing shows real motion; COCO frames are independent.
  const [isPlaying, setIsPlaying] = useState(false);
  // (F2-D-1) Camera mode. 'fixed' = the F2-C frozen overview (default + fallback);
  // 'follow' = keep the SELECTED object centered as it moves across keyframes.
  // A pure VIEW flag — separate from `selectedObjectId`, so Immutable Rule #2
  // (single selection field) is untouched. nuScenes only (see the Timeline +
  // Viewer3D wiring below); reset to 'fixed' on a dataset switch.
  const [cameraMode, setCameraMode] = useState<'fixed' | 'follow'>('fixed');
  // (F4) How the object list / review queue is ordered. A VIEW preference, like
  // `cameraMode`: page-level, not saved, reset on a dataset switch.
  const [queueOrder, setQueueOrder] = useState<QueueOrder>('scene');
  // (F4-D) Camera image: zoom on the selected box (default) or the full frame.
  // In the full frame a distant box is ~14×25 px — too small to judge — so
  // review starts zoomed; Z or the corner toggle shows the whole photo. A VIEW
  // flag, like `cameraMode`: no effect on selection (Rule #2).
  const [cameraZoom, setCameraZoom] = useState(true);
  // (F4-F) Practice mode: the same nuScenes scene with a few boxes deliberately
  // made wrong (lib/review/practice), to practise — and score — catching errors.
  //  - `practice` is what the user ASKED for (the toggle);
  //  - `plantedErrors` is set together with `frames`, so it says what the data
  //    on screen actually IS: null = the real annotations, an array = the
  //    practice set and its answer key.
  // Everything that must stay honest (badge, labels, review scope, export flag)
  // keys on `plantedErrors`, never on the toggle — so nothing can claim
  // "practice" or "measured" for one render while the other data is still shown.
  const [practice, setPractice] = useState(false);
  // (F7) Which nuScenes scene the user asked for; null = the default scene. The
  // scene actually ON SCREEN is `scenes.onScreen` — it lags this while the
  // requested scene is still loading, so the workspace (and its 3D canvas) is
  // never replaced by a loading placeholder when switching scenes.
  const [requestedScene, setRequestedScene] = useState<string | null>(null);
  // The data. Two loaders, one in use at a time (the other gets no url):
  //  - COCO: one file (`useDataset`).
  //  - nuScenes: the catalog, the scene on screen, and — in the background —
  //    every other scene's boxes (`useScenes`).
  // `frames` holds FINAL frames ready to render: COCO frames with estimated 3D,
  // nuScenes frames with measured 3D and their points still to be fetched.
  const coco = useDataset('coco', datasetId === 'coco' ? COCO_SOURCE : null, false);
  const scenes = useScenes(
    datasetId === 'nuscenes' ? NUSCENES_CATALOG : null,
    requestedScene,
    DEFAULT_SCENE,
    practice,
  );
  const sceneOnScreen = datasetId === 'nuscenes' ? scenes.onScreen : null;
  // (F8) `sceneFrames` are the frames as the DATA has them. `frames` (below,
  // once the mode is known) are the same frames with the reviewer's box
  // edits laid over — in review mode only.
  const sceneFrames: Frame[] | null =
    datasetId === 'coco'
      ? coco.frames
      : scenes.status === 'ready'
        ? (sceneOnScreen?.frames ?? NO_FRAMES)
        : null;
  const plantedErrors = sceneOnScreen?.plantedErrors ?? null;
  const error = datasetId === 'coco' ? coco.error : scenes.error;
  // Every scene whose boxes are in memory (the one on screen first, the others
  // as they arrive in the background).
  const sceneLibrary = scenes.library.scenes;
  // (F5) What the workspace is used for: reviewing the labels, or evaluating a
  // camera detector against them. A VIEW setting like `cameraMode` — the frame
  // and the selected object are shared by both modes (Rule #2: still one
  // `selectedObjectId`). nuScenes only; reset to 'review' on a dataset switch.
  const [mode, setMode] = useState<WorkMode>('review');
  // (F8) The frames everything on screen is drawn from. In review mode the
  // stored box edits are laid over the data's own boxes (the data itself is
  // never changed). In evaluate and explore mode they are NOT: every number
  // those modes report — and the sample check's population — is computed from
  // the dataset's boxes, whatever was edited (those modes also read
  // `sceneLibrary`, which is never overlaid). Practice edits are kept apart
  // from edits of the real annotations, like the practice verdicts.
  const storedEdits = useStoredEdits(plantedErrors ? 'nuscenes-practice' : 'nuscenes');
  const frames = useEditedFrames(
    sceneFrames,
    storedEdits.edits,
    datasetId === 'nuscenes' && mode === 'review',
  );
  // The model's predictions for the scene on screen. They arrive with the scene
  // but are independent of it: if they fail, review still works (F5).
  const scenePredictions = sceneOnScreen?.predictions ?? null;
  const scenePredictionsError = sceneOnScreen?.predictionsError ?? null;
  const predictions = useMemo<PredictionsState>(() => {
    if (datasetId !== 'nuscenes') return { status: 'none', set: null, error: null };
    if (!sceneOnScreen) return { status: 'loading', set: null, error: null };
    if (scenePredictions) return { status: 'ready', set: scenePredictions, error: null };
    return {
      status: 'failed',
      set: null,
      error: scenePredictionsError ?? 'This scene has no predictions file.',
    };
  }, [datasetId, sceneOnScreen, scenePredictions, scenePredictionsError]);
  // (F5) Which outcomes the result list and the camera image show (empty = all
  // four, the same convention as `visibleClasses`). A VIEW filter of evaluate
  // mode; it never changes a number.
  const [shownKinds, setShownKinds] = useState<ReadonlySet<EvalKind>>(() => new Set());
  // (F7) Explore mode: the search conditions (all must hold) and how the result
  // list is ordered. VIEW state of the page, like the mode itself — the store is
  // not involved, and the selected frame / object are still the store's single
  // ones (a result row that is "open" simply IS the selected frame).
  const [conditions, setConditions] = useState<SearchCondition[]>([]);
  const [hitOrder, setHitOrder] = useState<HitOrder>('scene');
  // A frame to open once its scene is on screen (a search result in another
  // scene). (F7.5) `objectId`: what to select in that frame once it is open —
  // a sampled model box in another scene.
  const [pendingFrame, setPendingFrame] = useState<{
    scene: string;
    frameId: string;
    objectId?: string;
  } | null>(null);
  // (F7.5) The overlap a model box needs to count as having found a label: this
  // tool's default (0.3) or the usual benchmark value (0.5). A VIEW setting of
  // evaluate mode, like the mode itself: not stored, reset by Reset and by a
  // dataset switch. Explore and the sample check do not read it (fixed rules).
  const [iouThreshold, setIouThreshold] = useState(IOU_THRESHOLD);
  // (F7.5) The sample check: judging a random sample of the false alarms that
  // have no label nearby. A state of evaluate mode (not a fourth mode); a VIEW
  // setting like the mode itself. Which box is being judged is NOT stored — it
  // is `selectedObjectId` (Rule #2).
  const [sampleChecking, setSampleChecking] = useState(false);
  // (F7.5) The evaluation report is open (laid over the list and the 3D view).
  // A VIEW flag of evaluate mode.
  const [reportOpen, setReportOpen] = useState(false);

  // (F2-C) Whether the active dataset tracks objects across frames. nuScenes ids
  // are `instance` tokens — stable for the SAME object across frames — so the
  // object selection should SURVIVE a frame switch (and re-highlight if the
  // object leaves then re-enters). COCO ids are `imageId-annId`, unstable across
  // frames, so its selection is cleared on every switch (Edge_#5 Case 6). This
  // one flag drives both the selection-persistence and the camera-stability
  // (no-remount) branches below.
  const tracksAcrossFrames = datasetId === 'nuscenes';

  const selectedFrameId = useViewerStore((s) => s.selectedFrameId);
  const setSelectedFrame = useViewerStore((s) => s.setSelectedFrame);
  const selectedObjectId = useViewerStore((s) => s.selectedObjectId);
  const setSelectedObject = useViewerStore((s) => s.setSelectedObject);
  const confidenceThreshold = useViewerStore((s) => s.confidenceThreshold);
  const setConfidenceThreshold = useViewerStore((s) => s.setConfidenceThreshold);
  const visibleClasses = useViewerStore((s) => s.visibleClasses);
  const toggleClass = useViewerStore((s) => s.toggleClass);
  const maxDistance = useViewerStore((s) => s.maxDistance);
  const setMaxDistance = useViewerStore((s) => s.setMaxDistance);
  const resetFilters = useViewerStore((s) => s.resetFilters);

  // (F4) Review records. They live in their own persisted store; WHICH box an
  // action applies to is always derived here from `selectedFrameId` +
  // `selectedObjectId` — there is no separate "box under review" state
  // (Immutable Rule #2).
  const reviewsByScope = useReviewStore((s) => s.reviews);
  const setVerdict = useReviewStore((s) => s.setVerdict);
  const toggleReason = useReviewStore((s) => s.toggleReason);
  const setNote = useReviewStore((s) => s.setNote);
  const clearReview = useReviewStore((s) => s.clearReview);
  const resetReviewScope = useReviewStore((s) => s.resetScope);
  const reviewStorageFailed = useReviewStore((s) => s.storageFailed);
  // Practice verdicts are about modified boxes; they live in their own scope
  // and never mix with verdicts on the real annotations.
  const reviewScope: ReviewScope = plantedErrors ? 'nuscenes-practice' : 'nuscenes';
  const reviews = reviewsByScope[reviewScope];

  // (F4) Load saved reviews AFTER mount. The store starts empty on both the
  // server render and the browser's first render, so the two match; this effect
  // then fills it from localStorage (see `skipHydration` in review-store).
  //
  // The same storage is shared by every tab of this app. Each tab keeps its own
  // in-memory copy and saves ALL records on every change, so without syncing, a
  // tab that was opened earlier would overwrite what another tab saved since
  // (verified: 3 approvals made in tab A vanished after one verdict in tab B).
  // The browser fires `storage` in the OTHER tabs whenever one tab writes;
  // re-reading then keeps every tab on the latest records.
  useEffect(() => {
    void useReviewStore.persist.rehydrate();
    const onStorage = (event: StorageEvent) => {
      // key === null means the whole storage was cleared.
      if (event.key === REVIEW_STORAGE_KEY || event.key === null) {
        void useReviewStore.persist.rehydrate();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Auto-select frames[0] when no valid frame is selected. Edge_#3 Case 3 (a):
  // the timeline policy is "always exactly one frame selected" — there is no
  // null path. Also self-heals if selectedFrameId points to an id that no
  // longer exists in the current data (dev hot-reload, dataset swap), which
  // would otherwise leave the page stuck on the "Selecting frame…" placeholder.
  useEffect(() => {
    if (!frames || frames.length === 0) return;
    const exists =
      selectedFrameId !== null && frames.some((f) => f.id === selectedFrameId);
    if (!exists) {
      setSelectedFrame(frames[0].id);
    }
  }, [frames, selectedFrameId, setSelectedFrame]);

  // (F7) When the frames change under the selection (another scene arrived) the
  // stored frame id is not in them for one render, until the effect above has
  // run. The first frame stands in for that render — returning "no frame" would
  // show the loading placeholder and tear the 3D canvas down.
  const storedFrame = useMemo(() => {
    if (!frames) return null;
    return frames.find((f) => f.id === selectedFrameId) ?? frames[0] ?? null;
  }, [frames, selectedFrameId]);
  // (F8) While a box is being dragged in the top view it is laid over this ONE
  // frame, so the 3D view and the six photos follow the drag — they are drawn
  // from `currentFrame` like always. `storedFrame` is the same frame without
  // the drag: an element of `frames`, used where the frame's PLACE in the
  // sequence matters (what to fetch ahead).
  const boxDraft = useBoxDraft();
  const currentFrame = useDraftFrame(storedFrame, boxDraft.draft);
  // The frame everything on screen is about. Use this — not the store's
  // `selectedFrameId` — wherever "the current frame" is meant.
  const currentFrameId = currentFrame?.id ?? null;

  // Class chips must stay reachable across frames even if the active frame
  // doesn't contain the class. Edge_#7.md Case 1 Option A. Iterates detections3D
  // (the superset): on nuScenes a class may appear only on a 3D-only box (no 2D
  // projection), and it must still be toggleable. COCO is 1:1 so this is
  // identical to iterating detections2D.
  const allClasses = useMemo(() => {
    if (!frames) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const frame of frames) {
      for (const d of frame.detections3D) {
        if (!seen.has(d.class)) {
          seen.add(d.class);
          out.push(d.class);
        }
      }
    }
    // (F7) The class filter is kept across scenes, and scenes do not share all
    // classes. A class that is switched ON but absent from this scene still
    // gets its chip — otherwise the filter would hide boxes with nothing on
    // screen to show why, or to undo it.
    for (const name of visibleClasses) {
      if (!seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
    return out;
  }, [frames, visibleClasses]);

  const frameIndex = useMemo(() => {
    if (!frames || !currentFrame) return 0;
    return frames.findIndex((f) => f.id === currentFrame.id) + 1;
  }, [frames, currentFrame]);

  // (F2-D-2) The NEXT keyframe in the sequence (the one autoplay would advance
  // to), so each tracked box can tween from its current pose toward its
  // next-keyframe pose. nuScenes only (COCO frames are independent → no tween);
  // null when there is no meaningful "next" (single frame / no selection yet).
  const nextFrame = useMemo(() => {
    if (!tracksAcrossFrames || !frames || frames.length <= 1) return null;
    const idx = frames.findIndex((f) => f.id === currentFrameId);
    const next = nextFrameIndex(idx, frames.length, { loop: true });
    return next === null ? null : frames[next];
  }, [tracksAcrossFrames, frames, currentFrameId]);

  // (F4) Review applies to MEASURED 3D boxes only. COCO's 3D is estimated from
  // 2D — there is no annotated 3D box to approve or reject (Rule #6) — so on
  // COCO none of the review UI is rendered and the page looks as it did in F3.
  const reviewEnabled =
    datasetId === 'nuscenes' && frames?.[0]?.source === 'nuscenes-measured';
  // (F5) Evaluate mode is on screen. Needs the same measured labels as review,
  // and the REAL ones: a practice set has deliberately wrong labels and cannot
  // be the answer key for a model (keyed on `plantedErrors`, i.e. on the data
  // actually shown, like every other honesty check).
  const evaluating = mode === 'evaluate' && reviewEnabled && plantedErrors === null;
  // (F7) Explore mode is on screen. It searches the dataset's REAL boxes in
  // every scene, so — like evaluate — it is not available on a practice set.
  const exploring = mode === 'explore' && reviewEnabled && plantedErrors === null;
  // (F7.5) The sample check is on screen.
  const sampleCheckOn = evaluating && sampleChecking;
  const reportOn = evaluating && reportOpen && !sampleChecking;

  // (F6) Which camera the camera cell shows. A VIEW setting (not a selection,
  // Rule #2): it follows the selected object — the photo that shows the box is
  // put on screen — and a thumbnail click overrides it until the selection or
  // the frame changes. The same in both modes: evaluate mode scores every
  // camera's photo, and shows the one on screen.
  // (F7.5) A selected model box names its own photo (its id carries the camera).
  const { activeCamera, setCamera, resetCamera } = useActiveCamera(
    currentFrame,
    selectedObjectId,
    true,
    cameraOfPredictionId(selectedObjectId),
  );
  // The current frame AS THAT CAMERA SEES IT: its photo and its 2D boxes in
  // the usual fields. Everything that deals with one photo (the 2D viewer,
  // the 2D filter, the details panel's 2D row) takes this frame; everything
  // about the objects themselves (3D view, list, review) takes `currentFrame`.
  const viewFrame = useMemo(
    () => (currentFrame ? frameAsCamera(currentFrame, activeCamera) : null),
    [currentFrame, activeCamera],
  );
  // The frame's cameras in look-around order (thumbnail row, [ / ] keys).
  // One entry for a single-camera frame (COCO, old sample files): no row.
  const cameraRow = useMemo(
    () => (currentFrame ? inDisplayOrder(cameraViews(currentFrame), (view) => view.name) : []),
    [currentFrame],
  );
  // (F6) The most cameras any frame of the dataset has. The thumbnail row is
  // laid out for this many, and is shown whenever it is more than one — also on
  // a frame that happens to have fewer — so the panes do not move from frame to
  // frame when the data is uneven (Edge_F#6 Case 2). COCO: 1 → no row.
  const cameraSlots = useMemo(
    () => (frames ? frames.reduce((max, frame) => Math.max(max, cameraViews(frame).length), 0) : 0),
    [frames],
  );
  // Fetch the coming frames' photos in the background (nuScenes only: the
  // frames that have several cameras).
  const preloadUrls = useMemo(() => {
    if (!frames || !storedFrame?.cameras) return [];
    return preloadOrder(frames, frames.indexOf(storedFrame), PRELOAD_FRAMES_AHEAD);
  }, [frames, storedFrame]);
  usePhotoPreload(preloadUrls, PHOTOS_KEPT);
  // (F7) The current frame's point cloud. nuScenes frames arrive without their
  // points (85 % of the data); they are fetched per frame, the same few frames
  // ahead as the photos. COCO frames carry their points and pass through.
  const framePoints = useFramePoints(frames, storedFrame, PRELOAD_FRAMES_AHEAD, POINT_CLOUDS_KEPT);
  const framePointList = framePoints.points;
  // The frame as the 3D view draws it: the same boxes, with the fetched points.
  // Until they arrive the boxes are drawn without a cloud (and the name tag
  // says so) — never with another frame's points.
  const frame3D = useMemo(
    () =>
      currentFrame && currentFrame.pointCloudSource
        ? { ...currentFrame, pointCloud: framePointList ?? NO_POINTS }
        : currentFrame,
    [currentFrame, framePointList],
  );

  // In evaluate mode the store's `confidenceThreshold` is the MODEL's minimum
  // score (set on entering, see `handleSelectMode`). It must not filter the
  // labels — they carry a placeholder confidence, not a score — and the
  // distance slider is not shown, so the distance filter is off as well.
  // (F7) Explore mode shows no class / distance controls (its bar holds the
  // search), so none of those filters may hide boxes there.
  const labelThreshold = evaluating || exploring ? 0 : confidenceThreshold;
  const labelMaxDistance = evaluating || exploring ? DISTANCE_MAX : maxDistance;
  const labelClasses = exploring ? NO_CLASS_FILTER : visibleClasses;

  // Distance filter (F2-A): ids of 3D boxes within maxDistance of the ego
  // vehicle. On COCO this passes everything (estimated centers are well within
  // the 90 m default) so it is a no-op there; on nuScenes it is the real filter.
  const withinDistance = useMemo(
    () =>
      currentFrame
        ? selectIdsWithinDistance(currentFrame.detections3D, labelMaxDistance)
        : new Set<string>(),
    [currentFrame, labelMaxDistance],
  );

  // Two visible-id sets. The 2D set drives Viewer2D; the 3D set drives Viewer3D
  // and ObjectList (F3: the list shows every 3D box). They diverge only on nuScenes, where a measured 3D box may
  // have no 2D projection (behind camera / off-screen, Edge_F#2 Case 1) — the
  // 3D set must still include it so the box renders. Both are intersected with
  // the distance filter. COCO is 1:1, so both sets coincide there.
  const visibleIds = useMemo(
    () =>
      viewFrame
        ? intersectIds(
            selectVisibleDetectionIds(viewFrame, labelThreshold, labelClasses),
            withinDistance,
          )
        : new Set<string>(),
    [viewFrame, labelThreshold, labelClasses, withinDistance],
  );
  // The 3D rule as a function of the frame, so the SAME rule can be applied to
  // a frame other than the current one (F4: the queue of the frame we are about
  // to jump to).
  const visibleIds3DOf = useCallback(
    (frame: Frame) =>
      intersectIds(
        selectVisibleDetectionIds3D(frame, labelThreshold, labelClasses),
        selectIdsWithinDistance(frame.detections3D, labelMaxDistance),
      ),
    [labelThreshold, labelClasses, labelMaxDistance],
  );
  const visibleIds3D = useMemo(
    () => (currentFrame ? visibleIds3DOf(currentFrame) : new Set<string>()),
    [currentFrame, visibleIds3DOf],
  );

  // (F7) The scene on screen and the one on its way, by name.
  const shownSceneName = sceneOnScreen?.info.name ?? null;
  const pendingSceneName = scenes.pending?.name ?? null;
  // (F7) Explore: whether a search condition is about the model, and — only
  // then — every loaded scene's evaluation at the DEFAULT rules.
  const conditionsNeedModel = needsEvaluation(conditions);
  // Model conditions need each scene's evaluation at the DEFAULT rules (not the
  // slider's): computed only while such a condition is in use.
  const searchEvaluations = useMemo(() => {
    if (!exploring || !conditionsNeedModel) return null;
    const byScene = new Map<string, ReturnType<typeof evaluateFrames>['byFrame']>();
    for (const [name, loaded] of sceneLibrary) {
      if (!loaded.predictions) continue;
      byScene.set(
        name,
        evaluateFrames(loaded.frames, loaded.predictions, DEFAULT_EVALUATION_RULES).byFrame,
      );
    }
    return byScene;
  }, [exploring, conditionsNeedModel, sceneLibrary]);
  const catalogScenes = scenes.catalog?.scenes;

  // Phase 3 analytics aggregations. Selectors are intentionally unfiltered:
  // the histogram threshold line and class-bar toggles only carry meaning
  // when painted on top of the frame's raw distribution.
  const confidenceBuckets = useMemo(
    () => (currentFrame ? selectConfidenceBuckets(currentFrame) : []),
    [currentFrame],
  );
  const classCounts = useMemo(
    () => (currentFrame ? selectClassCounts(currentFrame) : new Map<string, number>()),
    [currentFrame],
  );

  // (F5) The evaluation: every frame's labels against the model's predictions
  // at the current minimum score. Computed here, at the selector level, from
  // (frames, predictions, score) — nothing is filtered when the file is parsed,
  // so moving the slider re-scores everything. Only computed in evaluate mode.
  // (F7.5) During the sample check everything on screen is scored at the FIXED
  // default rules — the rules the sample's population is defined with — so the
  // sampled box is always a result on screen, whatever the slider was left at.
  const evaluationRules = useMemo<EvaluationRules>(
    () =>
      sampleCheckOn
        ? DEFAULT_EVALUATION_RULES
        : { minScore: confidenceThreshold, iouThreshold },
    [sampleCheckOn, confidenceThreshold, iouThreshold],
  );
  const evaluation = useMemo(
    () =>
      evaluating && frames && predictions.set
        ? evaluateFrames(frames, predictions.set, evaluationRules)
        : null,
    [evaluating, frames, predictions.set, evaluationRules],
  );
  // Timeline badges in evaluate mode: how many labels the model missed in each
  // frame. A frame the model was not run on says so instead of "0 missed".
  const evaluationBadges = useMemo(() => {
    if (!evaluation || !frames) return undefined;
    const badges = new Map<string, TimelineBadge>();
    for (const frame of frames) {
      const result = evaluation.byFrame.get(frame.id);
      if (!result) {
        badges.set(frame.id, {
          text: 'no preds',
          tone: 'muted',
          title: 'No predictions for this frame — not evaluated',
        });
        continue;
      }
      // (F6) Added over the frame's photos (one per camera).
      const { missed, found, falseAlarm } = result.counts;
      const photos = result.byCamera.size;
      badges.set(frame.id, {
        text: `${missed} missed`,
        value: missed,
        tone: missed > 0 ? 'alert' : 'good',
        title: `${missed} missed · ${found} found · ${falseAlarm} ${outcomeCountLabel('false-alarm', falseAlarm)}${photos > 1 ? ` · in ${photos} photos` : ''}`,
      });
    }
    return badges;
  }, [evaluation, frames]);
  // (F6) The current frame's evaluation: every photo of it, and the outcome
  // per object across the cameras (what the 3D boxes are coloured by).
  //
  // (F7) Explore mode with a condition about the MODEL shows the same thing —
  // what the model did in this frame — at the default rules the search uses
  // (`searchEvaluations`), so the photo and the 3D view explain the hit.
  const exploringModel = exploring && conditionsNeedModel;
  const frameEvaluation =
    (currentFrame &&
      (exploringModel
        ? shownSceneName !== null
          ? searchEvaluations?.get(shownSceneName)?.get(currentFrame.id)
          : undefined
        : evaluation?.byFrame.get(currentFrame.id))) ??
    null;
  // The evaluation of the PHOTO on screen — what the list, the camera image
  // and the J / K queue show. `null` → empty list, no overlay.
  const wholePhotoEvaluation =
    (activeCamera !== null && frameEvaluation?.byCamera.get(activeCamera)) || null;
  // In Explore only the results the conditions COUNT are drawn in the photo
  // (the missed labels, or the false alarms with no label nearby), so the boxes
  // on screen are the ones that made the frame match.
  const photoEvaluation = useMemo(
    () =>
      exploringModel && wholePhotoEvaluation
        ? {
            ...wholePhotoEvaluation,
            results: resultsForConditions(conditions, wholePhotoEvaluation.results),
          }
        : wholePhotoEvaluation,
    [exploringModel, wholePhotoEvaluation, conditions],
  );
  const frameResults = useFrameResults({
    frame: viewFrame,
    predictions:
      currentFrame && activeCamera !== null
        ? predictions.set?.byFrame.get(currentFrame.id)?.get(activeCamera)
        : undefined,
    frameEvaluation: photoEvaluation,
    objectOutcomes: frameEvaluation?.objects ?? null,
    boxFrame: currentFrame,
    selectedId: selectedObjectId,
    // (F7.5) The sample check shows no class / outcome controls, so neither
    // filter may hide the box being judged.
    classes: exploring || sampleCheckOn ? NO_CLASS_FILTER : visibleClasses,
    kinds: exploring || sampleCheckOn ? NO_KIND_FILTER : shownKinds,
  });
  // ---- (F7) Evaluate: every scene, once the slider rests ------------------
  // The scene on screen is scored at once (above). Scoring all ten scenes takes
  // ~70–100 ms — too long to do on every step of the score slider — so it
  // follows the rules only after they have stopped changing for a moment
  // (`useSettledValue`; why not `useDeferredValue` is measured there). While
  // the slider moves, the "All scenes" block is shown as catching up.
  const deferredRules = useSettledValue(evaluationRules, ALL_SCENES_SETTLE_MS);
  const scenesEvaluation = useMemo(() => {
    if (!evaluating || !catalogScenes) return null;
    return evaluateScenes(
      catalogScenes.flatMap((info) => {
        const loaded = sceneLibrary.get(info.name);
        return loaded
          ? [
              {
                name: info.name,
                night: info.night,
                drive: info.log?.name ?? null,
                driveDate: info.log?.date,
                driveLocation: info.log?.location,
                frames: loaded.frames,
                predictions: loaded.predictions,
              },
            ]
          : [];
      }),
      deferredRules,
    );
  }, [evaluating, catalogScenes, sceneLibrary, deferredRules]);
  const scenesEvaluationStale = deferredRules !== evaluationRules;
  // (F7.5) The report's two tables: the same scores regrouped per drive, and
  // day against night band by band. Only computed while the report is open.
  const reportTables = useMemo(
    () =>
      reportOn && scenesEvaluation
        ? {
            drives: summarizeDrives(scenesEvaluation.scenes),
            comparison: compareByDistance(
              scenesEvaluation.day.byDistance,
              scenesEvaluation.night.byDistance,
            ),
          }
        : null,
    [reportOn, scenesEvaluation],
  );
  const handleToggleKind = useCallback((kind: EvalKind) => {
    setShownKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);
  // (F5) A false alarm is selected by its PREDICTION id, through the same
  // `selectedObjectId` as everything else (Rule #2). Such an id only means
  // something while that prediction is a result on screen: drop it when the
  // frame changes, when evaluate mode is left, when the score slider moves past
  // it, or (F6) when another camera's photo is shown — otherwise an invisible
  // "selection" would linger.
  //
  // (F7.5) One exception, in the sample check: the box under judgment stays
  // selected while ANOTHER CAMERA OF ITS OWN FRAME is on screen. Looking around
  // through the other cameras is how a reviewer gets context, and before this
  // the box was deselected by the first thumbnail click and did not come back
  // (Edge_F#7.5 Case 5). Another frame still drops it.
  useEffect(() => {
    if (!selectedObjectId || !isPredictionId(selectedObjectId)) return;
    if (
      sampleCheckOn &&
      frameOfPredictionId(selectedObjectId) === currentFrameId &&
      cameraOfPredictionId(selectedObjectId) !== activeCamera
    ) {
      return;
    }
    if (!photoEvaluation || !findResult(photoEvaluation, selectedObjectId)) {
      setSelectedObject(null);
    }
  }, [selectedObjectId, photoEvaluation, setSelectedObject, sampleCheckOn, currentFrameId, activeCamera]);

  const reviewProgress = useMemo(
    () => (reviewEnabled && frames ? summarizeProgress(frames, reviews) : null),
    [reviewEnabled, frames, reviews],
  );
  const frameVerdicts = useMemo(
    () => (reviewEnabled && currentFrame ? verdictsOfFrame(currentFrame, reviews) : undefined),
    [reviewEnabled, currentFrame, reviews],
  );
  // Why the selected box cannot get a verdict right now (null = it can).
  const reviewBlock = useMemo(
    () =>
      currentFrame
        ? getReviewBlock({
            frame: currentFrame,
            selectedId: selectedObjectId,
            visibleIds: visibleIds3D,
            playing: isPlaying,
          })
        : 'no-selection',
    [currentFrame, selectedObjectId, visibleIds3D, isPlaying],
  );
  // Review actions target the selected box of the current frame. Each one
  // re-checks `reviewBlock`, so a disabled button and a stray call agree.
  // (F4-C) The list order and the review queue. The list shows every box in
  // `orderedBoxes`; the queue is the part of it that passes the filters — the
  // boxes J / K walk and the pool "next unreviewed" is drawn from.
  const orderedBoxes = useMemo(
    () =>
      currentFrame
        ? orderBoxes(
            currentFrame,
            reviewEnabled ? queueOrder : 'scene',
            // Only the "unsure first" order depends on the verdicts; the others
            // must not re-sort on every key press.
            queueOrder === 'unsure' ? reviews : undefined,
          )
        : [],
    [currentFrame, reviewEnabled, queueOrder, reviews],
  );
  const queue = useMemo(() => buildQueue(orderedBoxes, visibleIds3D), [orderedBoxes, visibleIds3D]);
  const queueRemaining = useMemo(
    () =>
      currentFrameId === null
        ? 0
        : queue.filter((id) => !getReview(reviews, currentFrameId, id)).length,
    [queue, reviews, currentFrameId],
  );
  // The next frame that still has unreviewed boxes the current filters let
  // through (for the N shortcut) — the same rule as the queue, so N never lands
  // on a frame whose remaining boxes are all hidden.
  const nextReviewFrameId = useMemo(
    () =>
      reviewEnabled && frames
        ? nextFrameWithUnreviewed(frames, reviews, currentFrameId, visibleIds3DOf)
        : null,
    [reviewEnabled, frames, reviews, currentFrameId, visibleIds3DOf],
  );

  // Approve and Unsure move on to the next unreviewed box of the queue, so a
  // run of ordinary boxes is one key press each. Reject stays put: the reviewer
  // still has to say why. At the end of the queue the selection stays where it
  // is — the frame never changes behind the reviewer's back.
  const handleVerdict = useCallback(
    (verdict: Verdict) => {
      if (reviewBlock || !currentFrameId || !selectedObjectId) return;
      setVerdict(reviewScope, currentFrameId, selectedObjectId, verdict);
      if (verdict === 'rejected') return;
      // Read the records AFTER the update (the `reviews` in this closure is the
      // pre-update snapshot and would still count this box as unreviewed).
      const latest = useReviewStore.getState().reviews[reviewScope];
      // (F6) Working through the "unsure first" list: go on to the next box
      // that is still unsure; when none is left, to the next unreviewed one.
      const next =
        (queueOrder === 'unsure'
          ? nextUnsure(queue, latest, currentFrameId, selectedObjectId)
          : null) ?? nextUnreviewed(queue, latest, currentFrameId, selectedObjectId);
      if (next) setSelectedObject(next);
    },
    [
      reviewBlock,
      currentFrameId,
      selectedObjectId,
      reviewScope,
      setVerdict,
      queue,
      queueOrder,
      setSelectedObject,
    ],
  );
  const handleToggleReason = useCallback(
    (reason: RejectReason) => {
      if (reviewBlock || !currentFrameId || !selectedObjectId) return;
      toggleReason(reviewScope, currentFrameId, selectedObjectId, reason);
    },
    [reviewBlock, currentFrameId, selectedObjectId, reviewScope, toggleReason],
  );
  const handleNote = useCallback(
    (note: string) => {
      if (reviewBlock || !currentFrameId || !selectedObjectId) return;
      setNote(reviewScope, currentFrameId, selectedObjectId, note);
    },
    [reviewBlock, currentFrameId, selectedObjectId, reviewScope, setNote],
  );
  const handleClearReview = useCallback(() => {
    if (reviewBlock || !currentFrameId || !selectedObjectId) return;
    clearReview(reviewScope, currentFrameId, selectedObjectId);
  }, [reviewBlock, currentFrameId, selectedObjectId, reviewScope, clearReview]);

  // (F4-E) Export. The document is built by the pure functions in
  // `lib/review/export` from the frames + records; this only stamps the time and
  // hands the text to the browser as a download. No backend is involved.
  //
  // (F7) Records are kept per (frame, box) and frames belong to scenes, so the
  // file covers every scene whose boxes are in memory — normally all of them a
  // moment after the page opens — and lists which. A practice export covers the
  // practice scene on screen: that is the only data its records are about.
  const handleExport = useCallback(
    (type: ReviewExportFileType) => {
      if (!sceneFrames || !sceneOnScreen) return;
      const now = new Date();
      // (F8) The DATA's frames, never the ones with the edits laid over: the
      // file says what each edited box was changed FROM.
      const exportScenes = plantedErrors
        ? [{ name: sceneOnScreen.info.name, frames: sceneFrames }]
        : (scenes.catalog?.scenes ?? []).flatMap((info) => {
            const loaded = sceneLibrary.get(info.name);
            return loaded ? [{ name: info.name, frames: loaded.frames }] : [];
          });
      const data = buildSceneReviewExport(exportScenes, reviews, {
        scope: reviewScope,
        exportedAt: now.toISOString(),
        edits: storedEdits.edits,
      });
      const filename = reviewExportFilename(reviewScope, now, type);
      if (type === 'json') {
        downloadTextFile(filename, reviewExportToJson(data), 'application/json');
      } else {
        downloadTextFile(filename, UTF8_BOM + reviewExportToCsv(data), 'text/csv');
      }
    },
    [
      sceneFrames,
      sceneOnScreen,
      plantedErrors,
      scenes.catalog,
      sceneLibrary,
      reviews,
      reviewScope,
      storedEdits.edits,
    ],
  );
  // (F7) What the export menu acts on: every record of the scope, whatever
  // scene it belongs to. And a caveat when the file cannot hold all of them.
  const reviewRecordCount = useMemo(() => Object.keys(reviews).length, [reviews]);
  const editRecordCount = useMemo(() => Object.keys(storedEdits.edits).length, [storedEdits.edits]);
  const catalogSceneCount = scenes.catalog?.scenes.length ?? 0;
  const exportNote = plantedErrors
    ? 'The file covers the practice set of the scene on screen only.'
    : sceneLibrary.size < catalogSceneCount
      ? `The file covers the ${sceneLibrary.size} of ${catalogSceneCount} scenes that are loaded; records of the others are left out.`
      : undefined;
  const handleResetReviews = useCallback(
    () => resetReviewScope(reviewScope),
    [resetReviewScope, reviewScope],
  );

  // (F4-C) Jump to the next frame that still has unreviewed boxes and land on
  // its first unreviewed box. Playback stops: the reviewer asked for a frame to
  // work on. The target frame's queue is built with the same order and the same
  // filter rule as the current one.
  const handleNextReviewFrame = useCallback(() => {
    const target = frames?.find((f) => f.id === nextReviewFrameId);
    if (!target) return;
    setIsPlaying(false);
    setSelectedFrame(target.id);
    const targetQueue = buildQueue(
      orderBoxes(target, queueOrder, reviews),
      visibleIds3DOf(target),
    );
    setSelectedObject(nextUnreviewed(targetQueue, reviews, target.id, null));
  }, [
    frames,
    nextReviewFrameId,
    queueOrder,
    visibleIds3DOf,
    reviews,
    setSelectedFrame,
    setSelectedObject,
  ]);

  // (F7) Scene switch. The scene is only REQUESTED here; it replaces the one on
  // screen when its data has arrived (`useScenes`). Playback stops at once — it
  // belongs to the scene being left.
  const retryScene = scenes.retry;
  const handleSelectScene = useCallback(
    (name: string) => {
      retryScene(name); // a scene that failed earlier is asked for again
      setRequestedScene(name);
      setIsPlaying(false);
      setPendingFrame(null); // a scene chosen by hand opens on its first frame
    },
    [retryScene],
  );
  const sceneNames = useMemo(
    () => scenes.catalog?.scenes.map((scene) => scene.name) ?? [],
    [scenes.catalog],
  );
  const handleStepScene = useCallback(
    (delta: 1 | -1) => {
      // Step from where the user is HEADING, so two quick presses move two scenes.
      const next = stepScene(sceneNames, pendingSceneName ?? shownSceneName, delta);
      if (next) handleSelectScene(next);
    },
    [sceneNames, pendingSceneName, shownSceneName, handleSelectScene],
  );
  // When another scene comes on screen: the selection is cleared (an object id
  // means nothing in another scene), playback stays stopped, and the camera
  // cell goes back to its default camera. Filters and the mode are kept. The
  // first scene to arrive after the page (or the dataset) opens changes nothing.
  const previousSceneName = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousSceneName.current;
    previousSceneName.current = shownSceneName;
    if (previous === null || shownSceneName === null || previous === shownSceneName) return;
    setSelectedObject(null);
    setIsPlaying(false);
    resetCamera();
  }, [shownSceneName, setSelectedObject, resetCamera]);
  // (F7) A number per scene for the scene list: review progress, or — in
  // evaluate mode — recall. Computed for the scenes whose boxes are in memory,
  // and only when the list asks (it is closed most of the time).
  const sceneStat = useCallback(
    (name: string): SceneStat | null => {
      const loaded = sceneLibrary.get(name);
      if (!loaded) return null;
      if (evaluating) {
        if (!loaded.predictions) return { text: 'no preds', title: 'No predictions for this scene' };
        const score = scenesEvaluation?.scenes.find((entry) => entry.scene === name);
        if (!score) return null;
        return {
          text: formatPercent(recallOf(score.counts)),
          title: `${score.counts.found} of ${score.counts.found + score.counts.missed} labels found in this scene's photos`,
        };
      }
      const { overall } = summarizeProgress(loaded.frames, reviewsByScope.nuscenes);
      return {
        text: `${overall.reviewed} / ${overall.total.toLocaleString('en-US')}`,
        title: `${overall.reviewed} of ${overall.total} boxes reviewed in this scene`,
        tone: overall.total > 0 && overall.reviewed >= overall.total ? 'good' : 'default',
      };
    },
    [sceneLibrary, evaluating, scenesEvaluation, reviewsByScope],
  );

  // ---- (F7) Explore: search every loaded scene ----------------------------
  // The search runs directly on the boxes in memory with the pure functions of
  // `lib/search` (one pass per condition, ~0.5 ms for all 404 frames), so it is
  // simply recomputed whenever the conditions or the loaded scenes change.
  const searchInput = useMemo<SearchScene[]>(() => {
    if (!exploring || !catalogScenes) return [];
    return catalogScenes.flatMap((info) => {
      const loaded = sceneLibrary.get(info.name);
      return loaded
        ? [
            {
              name: info.name,
              night: info.night,
              frames: loaded.frames,
              evaluation: searchEvaluations?.get(info.name) ?? null,
            },
          ]
        : [];
    });
  }, [exploring, catalogScenes, sceneLibrary, searchEvaluations]);
  const search = useMemo(
    () => (exploring ? searchScenes(searchInput, conditions) : null),
    [exploring, searchInput, conditions],
  );
  const orderedHits = useMemo(
    () => (search ? sortHits(search.hits, hitOrder) : NO_HITS),
    [search, hitOrder],
  );
  // The frame on screen, measured on the same conditions.
  const sceneIsNight = sceneOnScreen?.info.night ?? false;
  const frameSearch = useMemo(() => {
    if (!exploring || !currentFrame || !shownSceneName) return null;
    const context: SearchFrameContext = {
      frame: currentFrame,
      night: sceneIsNight,
      evaluation: searchEvaluations?.get(shownSceneName)?.get(currentFrame.id) ?? null,
    };
    return {
      values: conditions.map((condition) => conditionValue(condition, context)),
      matches: conditions.every((condition) => matchesCondition(condition, context)),
      boxIds: highlightedBoxIds(conditions, context),
    };
  }, [exploring, currentFrame, shownSceneName, sceneIsNight, searchEvaluations, conditions]);
  // 3D: boxes that count toward the search keep their class colour; the others
  // are drawn grey, so it is visible WHY the frame was found. No condition
  // about boxes → nothing is dimmed.
  const searchBoxIds = frameSearch?.boxIds ?? null;
  const searchBoxColors = useMemo(() => {
    if (!searchBoxIds || !currentFrame) return undefined;
    const colors = new Map<string, string>();
    for (const box of currentFrame.detections3D) {
      if (!searchBoxIds.has(box.id)) colors.set(box.id, SEARCH_DIM_COLOR);
    }
    return colors;
  }, [searchBoxIds, currentFrame]);
  // Timeline: which frames of the scene on screen match, and by how much.
  const searchBadges = useMemo(() => {
    if (!exploring || conditions.length === 0 || !frames || !shownSceneName) return undefined;
    const first = conditions[0];
    const badges = new Map<string, TimelineBadge>();
    for (const frame of frames) {
      const context: SearchFrameContext = {
        frame,
        night: sceneIsNight,
        evaluation: searchEvaluations?.get(shownSceneName)?.get(frame.id) ?? null,
      };
      const matches = conditions.every((condition) => matchesCondition(condition, context));
      const value = conditionValue(first, context);
      badges.set(
        frame.id,
        matches
          ? { text: describeValue(first, value), value: first.kind === 'time' ? 1 : (value ?? 0), tone: 'match' }
          : { text: 'no match', value: 0, tone: 'muted' },
      );
    }
    return badges;
  }, [exploring, conditions, frames, shownSceneName, sceneIsNight, searchEvaluations]);
  // The classes offered in the condition form: every class of the loaded scenes.
  const searchClasses = useMemo(() => {
    if (!exploring) return [];
    const counts = new Map<string, number>();
    for (const loaded of sceneLibrary.values()) {
      for (const frame of loaded.frames) {
        for (const box of frame.detections3D) counts.set(box.class, (counts.get(box.class) ?? 0) + 1);
      }
    }
    // Most frequent first: the common classes are at the top of the list.
    return [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [exploring, sceneLibrary]);
  // Open a search result: the frame, in whatever scene it is. Another scene is
  // requested first and the frame is selected when that scene is on screen.
  // (F7.5) `objectId`: what to select in that frame — a sampled model box.
  const handleOpenHit = useCallback(
    (hit: { scene: string; frameId: string; objectId?: string }) => {
      setIsPlaying(false);
      if (hit.scene === shownSceneName && pendingSceneName === null) {
        setPendingFrame(null);
        setSelectedFrame(hit.frameId);
        if (hit.objectId) setSelectedObject(hit.objectId);
        return;
      }
      handleSelectScene(hit.scene);
      setPendingFrame({ scene: hit.scene, frameId: hit.frameId, objectId: hit.objectId });
    },
    [shownSceneName, pendingSceneName, handleSelectScene, setSelectedFrame, setSelectedObject],
  );
  const handleOpenSceneHits = useCallback(
    (scene: string) => {
      const firstHit = search?.hits.find((hit) => hit.scene === scene);
      if (firstHit) handleOpenHit(firstHit);
    },
    [search, handleOpenHit],
  );
  // Declared AFTER the scene-change effect above on purpose: that one clears
  // the selection when another scene comes on screen, and this one then
  // selects what was asked for in it (effects run in declaration order).
  useEffect(() => {
    if (!pendingFrame || !frames || shownSceneName !== pendingFrame.scene) return;
    if (frames.some((frame) => frame.id === pendingFrame.frameId)) {
      setSelectedFrame(pendingFrame.frameId);
      if (pendingFrame.objectId) setSelectedObject(pendingFrame.objectId);
    }
    setPendingFrame(null);
  }, [pendingFrame, frames, shownSceneName, setSelectedFrame, setSelectedObject]);

  // ---- (F7.5) Sample check ------------------------------------------------
  // The population, the drawn sample, its summary and the actions on it live in
  // `useSampleCheckController` (pure functions of lib/sampling underneath); the
  // page only says where a box is opened and whether the check is on screen.
  const stopPlayback = useCallback(() => setIsPlaying(false), []);
  // Opening a sampled box always ends on ITS photo. When the box is already the
  // selection (the reviewer looked at another camera and clicks its row again)
  // nothing about the selection changes, so the camera is put back explicitly.
  // For a box in another scene the selection change does it (`useActiveCamera`).
  const handleOpenSampleBox = useCallback(
    (target: { scene: string; frameId: string; objectId: string }) => {
      handleOpenHit(target);
      const camera = cameraOfPredictionId(target.objectId);
      if (camera !== null && target.scene === shownSceneName && pendingSceneName === null) {
        setCamera(camera);
      }
    },
    [handleOpenHit, shownSceneName, pendingSceneName, setCamera],
  );
  const sampleCheck = useSampleCheckController({
    on: sampleCheckOn,
    setOn: setSampleChecking,
    // The report shows how many such false alarms there are and what the
    // sample says so far, so it needs the same derived state.
    alsoNeeded: reportOn,
    sceneNames,
    loaded: sceneLibrary,
    failed: scenes.library.errors,
    rules: DEFAULT_EVALUATION_RULES,
    selectedId: selectedObjectId,
    playing: isPlaying,
    stopPlayback,
    openBox: handleOpenSampleBox,
  });
  // The photo the sampled box is in, and whether that photo is the one on screen.
  const sampleBoxCamera = sampleCheck.current?.item.camera ?? null;
  const handleShowSampleBox = useCallback(() => {
    if (sampleBoxCamera !== null) setCamera(sampleBoxCamera);
  }, [sampleBoxCamera, setCamera]);
  const enterSampleCheck = sampleCheck.enter;
  const handleEnterSampleCheck = useCallback(() => {
    setReportOpen(false); // from the report: the report gives way to the check
    enterSampleCheck();
  }, [enterSampleCheck]);
  const handleOpenReport = useCallback(() => setReportOpen(true), []);
  const handleCloseReport = useCallback(() => setReportOpen(false), []);

  // ---- (F8) Box editing ---------------------------------------------------
  // The editor's state and everything it derives live in `useBoxEditor`; the
  // page only says what is on screen and puts the pieces into the workspace
  // slots. WHICH box is edited is not a state of its own: it is the selected
  // object of the current frame (Rule #2).
  const labelFrame = useMemo(
    () => sceneFrames?.find((f) => f.id === currentFrameId) ?? null,
    [sceneFrames, currentFrameId],
  );
  const editor = useBoxEditor({
    available: reviewEnabled && mode === 'review',
    scope: plantedErrors ? 'nuscenes-practice' : 'nuscenes',
    edits: storedEdits.edits,
    labelFrame,
    shownFrame: currentFrame,
    selectedId: selectedObjectId,
    block: reviewBlock,
    points: framePointList,
    pointsLoading: framePoints.status === 'loading',
    draft: boxDraft.draft,
    setDraft: boxDraft.setDraft,
    activeCamera,
    setCamera,
    stopPlayback,
  });
  useEditShortcuts(
    {
      onDone: editor.exit,
      onToggleView: editor.toggleView,
      onUndo: editor.undo,
      onRedo: editor.redo,
      onNudge: editor.nudge,
    },
    editor.editing,
  );
  // What the "edited" marks show (list rows, 3D name tag, top bar). Only where
  // edits are drawn at all: review mode.
  const edited = useEditedSummary(
    sceneFrames,
    labelFrame,
    storedEdits.edits,
    datasetId === 'nuscenes' && mode === 'review',
  );
  const editing = editor.editing;
  const enterEditor = editor.enter;

  // (F4-C) Keyboard shortcuts. `resolveShortcut` (lib/review) decides what a key
  // means; this decides what the action does — always through the same handlers
  // the buttons use, so mouse and keyboard cannot drift apart.
  const { judge: judgeSample, clear: clearSample, step: stepSample } = sampleCheck;
  const handleReviewAction = useCallback(
    (action: ReviewAction) => {
      // (F7.5) Sample check: the same keys as the label review, applied to the
      // sampled model box — A / R / U judge it, C clears, J / K walk the sample.
      // Zoom and camera keys fall through to the shared handling below; every
      // other key (reject reasons, next frame) does nothing here.
      if (sampleCheckOn) {
        if (action.type === 'verdict') return judgeSample(toSampleVerdict(action.verdict));
        if (action.type === 'clear') return clearSample();
        if (action.type === 'step') return stepSample(action.direction);
        if (action.type !== 'toggle-zoom' && action.type !== 'camera') return;
      }
      // (F8) While a box is being edited only looking around works (the other
      // cameras, the photo zoom). The keys that WRITE a review are off: a stray
      // "A" must not approve the box that is being changed.
      if (editing && action.type !== 'toggle-zoom' && action.type !== 'camera') return;
      // (F5) Evaluate mode only looks: moving through the list (J / K) and the
      // camera zoom (Z) work; the keys that WRITE a review do nothing, so a
      // stray "A" cannot approve a box whose verdict is not even on screen.
      if (
        (evaluating || exploring) &&
        action.type !== 'step' &&
        action.type !== 'toggle-zoom' &&
        action.type !== 'camera'
      ) {
        return;
      }
      // (F7) Explore mode: J / K walk the result list (frames, not boxes).
      if (exploring && action.type === 'step') {
        const hit = stepHit(orderedHits, currentFrameId, action.direction);
        if (hit && hit.frameId !== currentFrameId) handleOpenHit(hit);
        return;
      }
      switch (action.type) {
        case 'camera': {
          // (F6) The camera to the left / right in the thumbnail row.
          const next = stepCamera(
            cameraRow.map((view) => view.name),
            activeCamera,
            action.direction,
          );
          if (next !== null && cameraRow.length > 1) setCamera(next);
          break;
        }
        case 'verdict':
          handleVerdict(action.verdict);
          break;
        case 'clear':
          handleClearReview();
          break;
        case 'reason':
          handleToggleReason(action.reason);
          break;
        case 'step': {
          // Evaluate mode walks the result list; review mode the box queue.
          const current = evaluating
            ? frameResults.selectedResult
              ? selectionIdOf(frameResults.selectedResult)
              : null
            : selectedObjectId;
          const id = stepInQueue(evaluating ? frameResults.queue : queue, current, action.direction);
          if (id) setSelectedObject(id);
          break;
        }
        case 'next-frame':
          handleNextReviewFrame();
          break;
        case 'toggle-zoom':
          setCameraZoom((z) => !z);
          break;
        case 'edit':
          enterEditor();
          break;
      }
    },
    [
      editing,
      enterEditor,
      sampleCheckOn,
      judgeSample,
      clearSample,
      stepSample,
      evaluating,
      exploring,
      orderedHits,
      currentFrameId,
      handleOpenHit,
      cameraRow,
      activeCamera,
      setCamera,
      frameResults.queue,
      frameResults.selectedResult,
      handleVerdict,
      handleClearReview,
      handleToggleReason,
      handleNextReviewFrame,
      queue,
      selectedObjectId,
      setSelectedObject,
    ],
  );
  // (F7.5) While the report covers the list and the 3D view, the keys must not
  // act on what is hidden underneath.
  useReviewShortcuts(handleReviewAction, reviewEnabled && currentFrame !== null && !reportOn);

  // Frame switch. The object-selection policy is DATASET-AWARE (F2-C):
  //  - COCO: clear the selection. COCO ids are `imageId-annId`, unstable across
  //    frames, so a kept id could ghost-highlight (a stale object) or
  //    accidentally re-highlight a different object that happens to share the id.
  //    Edge_#5 Case 6 — this is why the clear exists.
  //  - nuScenes: KEEP the selection. The id is an `instance` token, stable for
  //    the SAME physical object across frames, so keeping it tracks that object;
  //    if the object leaves the frame the highlight simply isn't drawn (no id
  //    match), and re-appears correctly when the object returns (Edge_F#2 Case 5).
  // Kept in page.tsx (not the store) so store actions stay single-purpose, and
  // Immutable Rule #2 holds — still one `selectedObjectId`, only *when* we clear
  // it differs.
  const handleSelectFrame = useCallback(
    (id: string) => {
      if (id === selectedFrameId) return;
      setSelectedFrame(id);
      if (!tracksAcrossFrames) setSelectedObject(null);
    },
    [selectedFrameId, setSelectedFrame, setSelectedObject, tracksAcrossFrames],
  );

  // Reset the sequence to the first frame and stop playback (nuScenes only —
  // wired below). Mirrors the Filters reset affordance but for the sequence
  // position: during/after autoplay the user can return to frame 1 without
  // scrolling the timeline back. The tracked object selection is intentionally
  // KEPT (nuScenes policy, Immutable Rule #2) — only the frame position resets.
  const handleResetSequence = useCallback(() => {
    setIsPlaying(false);
    if (frames && frames.length > 0) setSelectedFrame(frames[0].id);
  }, [frames, setSelectedFrame]);

  // (F2-C) Autoplay timer. Steps to the next keyframe every
  // AUTOPLAY_INTERVAL_MS (~2 Hz, the real nuScenes cadence) while `isPlaying`.
  // The next index is the pure `nextFrameIndex` (loops at the end); reaching a
  // hard stop (loop=false) would flip `isPlaying` off. The current frame is read
  // via `getState()` each tick rather than closed over, so the interval never
  // goes stale as frames advance. Autoplay runs on nuScenes only (the play
  // control is hidden on COCO), where advancing keeps the tracked selection.
  useEffect(() => {
    if (!isPlaying || !frames || frames.length <= 1) return;
    const timer = setInterval(() => {
      const currentId = useViewerStore.getState().selectedFrameId;
      const idx = frames.findIndex((f) => f.id === currentId);
      const next = nextFrameIndex(idx, frames.length, { loop: true });
      if (next === null) {
        setIsPlaying(false);
        return;
      }
      // nuScenes-only path → keep the tracked object selection (no clear).
      setSelectedFrame(frames[next].id);
    }, AUTOPLAY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isPlaying, frames, setSelectedFrame]);

  // Dataset switch: clear the object selection and reset all filters (the class
  // universe and the meaningful metric filter both differ between datasets).
  // The frame auto-select effect re-homes to the new frames[0].
  const handleSelectDataset = useCallback(
    (id: DatasetId) => {
      if (id === datasetId) return;
      setDatasetId(id);
      setSelectedObject(null);
      resetFilters();
      setIsPlaying(false); // (F2-C) stop autoplay when leaving the sequence
      setCameraMode('fixed'); // (F2-D-1) reset to the default overview camera
      setQueueOrder('scene'); // (F4) back to the dataset order
      setPractice(false); // (F4-F) practice is a nuScenes-only mode
      setMode('review'); // (F5) evaluate is a nuScenes-only mode
      setSampleChecking(false); // (F7.5) the sample check is part of evaluate mode
      setReportOpen(false); // (F7.5) so is the report
      setIouThreshold(IOU_THRESHOLD); // (F7.5) back to the default overlap
      setShownKinds(new Set()); // (F5) show every outcome again
      resetCamera(); // (F6) back to the default camera
    },
    [datasetId, setSelectedObject, resetFilters, resetCamera],
  );

  // (F5) Switch between reviewing and evaluating. The frame and the selected
  // object are kept. The store's one threshold changes meaning with the mode:
  // in evaluate mode it is the model's minimum score and starts at the
  // detector's default; in review mode on nuScenes there is no score to filter
  // by, so it goes back to 0 (= off).
  const evaluateBlocked =
    practice || plantedErrors !== null
      ? 'Not available in practice mode: its labels are deliberately modified, so they cannot be used to score a model. Turn Practice off first.'
      : undefined;
  const handleSelectMode = useCallback(
    (next: WorkMode) => {
      if (next === mode) return;
      if (next !== 'review' && evaluateBlocked) return;
      setMode(next);
      setSampleChecking(false); // (F7.5) the sample check does not outlive a mode switch
      setReportOpen(false); // (F7.5) nor does the report
      setConfidenceThreshold(next === 'evaluate' ? DEFAULT_MIN_SCORE : 0);
    },
    [mode, evaluateBlocked, setConfidenceThreshold],
  );
  // Reset in evaluate mode: classes back to "all", score back to its default
  // (not to 0, which would count every low-score guess as a prediction).
  // `resetFilters` also clears the distance filter, which evaluate mode neither
  // shows nor applies — it belongs to review mode, so it is put back: a Reset
  // here must not silently undo a filter of the other mode (Edge_F#5 Case 1).
  const handleResetEvaluationFilters = useCallback(() => {
    resetFilters();
    setMaxDistance(maxDistance);
    setConfidenceThreshold(DEFAULT_MIN_SCORE);
    setIouThreshold(IOU_THRESHOLD); // (F7.5) Reset means the default rules again
  }, [resetFilters, setMaxDistance, maxDistance, setConfidenceThreshold]);

  // (F4-F) Enter / leave practice mode. The scene's practice set is built and
  // then swapped in (F7: the scene on screen stays until it is ready, so the 3D
  // canvas is kept); the frame position is kept (same frame ids), the object
  // selection and playback are not — the boxes themselves change.
  const handleTogglePractice = useCallback(() => {
    setPractice((p) => !p);
    setSelectedObject(null);
    setIsPlaying(false);
  }, [setSelectedObject]);
  const practiceScores = useMemo(
    () =>
      plantedErrors && currentFrameId
        ? {
            frame: scorePractice(plantedErrors, reviews, currentFrameId),
            overall: scorePractice(plantedErrors, reviews),
            plantedInFrame: plantedErrors.filter((p) => p.frameId === currentFrameId),
          }
        : null,
    [plantedErrors, reviews, currentFrameId],
  );
  // (F8) Practice mode: the edited boxes of this frame against the REAL label
  // (the scene's own boxes are still in the library while its practice set is
  // on screen). Shown by the practice card only after "Reveal answers".
  const practiceCloseness = usePracticeCloseness(
    plantedErrors,
    labelFrame,
    sceneOnScreen ? sceneLibrary.get(sceneOnScreen.info.name)?.frames : undefined,
    storedEdits.edits,
  );

  // (F3) Every state — loading, error, empty, loaded — renders inside the same
  // WorkspaceShell, so the panes sit in the same place before and after the
  // data arrives (no layout jump). The shell owns zone sizes; the camera cell's
  // ratio follows the dataset (nuScenes photos are 16:9, COCO photos vary → 4:3).
  const cameraAspect = datasetId === 'nuscenes' ? 16 / 9 : 4 / 3;
  // The header stays live in every state so the dataset switcher is usable
  // while loading or after a failed load.
  const header = (
    <Header
      frameIndex={frameIndex}
      frameCount={frames?.length ?? 0}
      // Count by 3D boxes — the main view (Rule #5) renders 3D, and on nuScenes
      // the 3D set is the superset (some boxes have no 2D projection).
      detectionCount={currentFrame?.detections3D.length ?? 0}
      datasetId={datasetId}
      onSelectDataset={handleSelectDataset}
      source={currentFrame?.source}
      practiceActive={plantedErrors !== null}
      practiceRequested={practice}
      // (F5) Practice and evaluate exclude each other: the toggle is hidden
      // while evaluating, and Evaluate is blocked while practising.
      onTogglePractice={
        datasetId === 'nuscenes' && mode === 'review' ? handleTogglePractice : undefined
      }
      modeSwitch={
        datasetId === 'nuscenes' ? (
          <ModeSwitch
            mode={mode}
            onSelect={handleSelectMode}
            evaluateBlocked={evaluateBlocked}
            exploreBlocked={
              evaluateBlocked
                ? 'Not available in practice mode: the search runs on the dataset’s real boxes. Turn Practice off first.'
                : undefined
            }
          />
        ) : undefined
      }
    >
      {exploring && search ? (
        <span className="text-xs text-zinc-400 tabular-nums lg:whitespace-nowrap">
          <span className="font-semibold text-zinc-100">{search.hits.length}</span> of {search.frames}{' '}
          frames match · {search.scenesWithMatches} of {search.byScene.length} scenes
          {scenes.catalog && search.byScene.length < scenes.catalog.scenes.length && (
            <span className="ml-1.5 text-sky-300">
              ({search.byScene.length} / {scenes.catalog.scenes.length} scenes loaded)
            </span>
          )}
        </span>
      ) : evaluating ? (
        <>
        {!sampleCheckOn && (
          <button
            type="button"
            onClick={reportOn ? handleCloseReport : handleOpenReport}
            aria-pressed={reportOn}
            title="All scenes on one screen: conditions, totals, recall by drive, day and night at the same distance, the unchecked false alarms"
            className={[
              'text-xs px-2 py-0.5 rounded border transition-colors whitespace-nowrap',
              reportOn
                ? 'border-sky-400/50 bg-sky-500/15 text-sky-200'
                : 'border-zinc-700 text-zinc-300 hover:border-sky-400/40 hover:text-zinc-100',
            ].join(' ')}
          >
            Report
          </button>
        )}
        <EvaluationHeadline
          summary={evaluation?.summary ?? null}
          status={predictions.status === 'none' ? 'failed' : predictions.status}
          modelName={predictions.set?.model.name}
          basis={
            evaluation
              ? `${shownSceneName ?? 'This scene'}: all ${evaluation.evaluatedPhotos} evaluated photos (${evaluation.evaluatedFrames} frames × ${evaluation.byCamera.length} camera${evaluation.byCamera.length === 1 ? '' : 's'}), each scored on its own · score ≥ ${evaluationRules.minScore.toFixed(2)} · IoU ≥ ${evaluationRules.iouThreshold} · one scene of one drive — see "All scenes" in the panel`
              : undefined
          }
        />
        </>
      ) : (
        reviewProgress && (
        <>
          <ReviewProgress
            counts={reviewProgress.overall}
            notSaved={reviewStorageFailed || storedEdits.storageFailed}
            edited={edited.inScene}
            // The practice badge is wider than "Measured".
            tight={plantedErrors !== null}
          />
          <ExportMenu
            // (F7) Export and reset act on EVERY scene's records, so the menu
            // counts those — not the scene on screen (Edge_F#7 Case 2).
            reviewedCount={reviewRecordCount}
            editedCount={editRecordCount}
            scope="in all scenes"
            exportNote={exportNote}
            onExport={handleExport}
            onReset={handleResetReviews}
          />
        </>
        )
      )}
    </Header>
  );

  // (F7) The scene picker. Built once, because it is needed in two places: in
  // the timeline, and — when the scene that should be on screen failed or is
  // empty — in the timeline's place of the error state, so there is always a
  // way to another scene (Edge_F#7 Case 1).
  const scenePicker =
    datasetId === 'nuscenes' && scenes.catalog && scenes.catalog.scenes.length > 0 ? (
      <ScenePicker
        scenes={scenes.catalog.scenes}
        current={shownSceneName}
        pending={scenes.pending}
        onSelect={handleSelectScene}
        onStep={handleStepScene}
        states={scenes.library.states}
        // Practice verdicts are about modified boxes of one scene; the
        // per-scene numbers describe the real data, so they are hidden.
        statLabel={plantedErrors ? undefined : evaluating ? 'Recall' : 'Reviewed'}
        stat={plantedErrors ? undefined : sceneStat}
      />
    ) : undefined;

  if (error || !frames || frames.length === 0 || !currentFrame || !viewFrame) {
    // Loading (no frames yet) and the one render between frames arriving and
    // the auto-select effect firing (no currentFrame) both show skeletons.
    const loading = !error && (!frames || frames.length > 0);
    const pane = <PanePlaceholder pulse={loading} />;
    let mainContent: ReactNode = pane;
    if (error) {
      mainContent = (
        <PaneMessage>
          <p className="text-rose-400 text-sm">Failed to load sample data</p>
          <p className="text-zinc-600 text-xs font-mono">{error}</p>
          {scenePicker && (
            <p className="text-zinc-500 text-xs">Another scene can be opened from the scene picker below.</p>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Retry
          </button>
        </PaneMessage>
      );
    } else if (frames && frames.length === 0) {
      mainContent = (
        <PaneMessage>
          <p className="text-zinc-400 text-sm">No frames.</p>
        </PaneMessage>
      );
    }
    return (
      <WorkspaceShell
        cameraAspect={cameraAspect}
        topBar={header}
        filterBar={<div className="h-full min-h-10 bg-zinc-900/60 border-b border-zinc-800" />}
        list={pane}
        main={mainContent}
        camera={pane}
        // (F6) nuScenes has the thumbnail row; keep its place while loading
        // so the details panel does not jump when the photos arrive.
        cameraStrip={
          datasetId === 'nuscenes' ? <CameraStripPlaceholder pulse={loading} /> : undefined
        }
        details={<PanePlaceholder pulse={loading} className="min-h-48 lg:min-h-0" />}
        timeline={
          scenePicker && !loading ? (
            <div className={`flex h-full w-full min-h-[84px] items-center px-3 ${PANEL_CLASS}`}>
              {scenePicker}
            </div>
          ) : (
            <PanePlaceholder pulse={loading} className="min-h-[84px]" />
          )
        }
      />
    );
  }

  const totalCount = currentFrame.detections3D.length;
  // nuScenes labels have measured metres and no score → the distance slider.
  // (F5) In evaluate mode the model's predictions DO have a score → the
  // confidence slider again, named "Min score".
  const filterMode = datasetId === 'nuscenes' && !evaluating ? 'distance' : 'confidence';
  // (F3) Viewer name tags, keyed on the frame's provenance so the 3D tag never
  // claims measured depth for estimated data (Immutable Rule #6). The camera name
  // is the camera on screen (F6); a frame without camera names says "Image".
  const isMeasured = currentFrame.source === 'nuscenes-measured';
  // Practice set: the points are still measured, the boxes are not the
  // dataset's any more — the tag must not read "measured 3D".
  // (F7) The point cloud is fetched per frame: say when it is not there (yet).
  const pointsNote =
    framePoints.status === 'loading'
      ? ' · loading points…'
      : framePoints.status === 'failed'
        ? ' · points unavailable'
        : '';
  const label3D =
    (plantedErrors
      ? 'LiDAR measured · boxes modified (practice)'
      : isMeasured
        ? 'LiDAR · measured 3D'
        : '3D · estimated from 2D') +
    // (F8) With an edited box on screen the picture is no longer only the
    // dataset's labels — the tag says so (Rule #6), as it does for practice.
    (edited.inFrame.size > 0 ? ` · ${edited.inFrame.size} edited` : '') +
    pointsNote;
  const label2D = isMeasured && activeCamera ? activeCamera : 'Image';
  const frameReviewCounts = reviewProgress?.byFrame.get(currentFrame.id);
  // (F4-D) Dataset facts about the selected box, for the strip above the
  // verdict buttons. Null when nothing (in this frame) is selected.
  const selectedBox = selectedObjectId
    ? currentFrame.detections3D.find((d) => d.id === selectedObjectId) ?? null
    : null;
  const selectedEvidence = selectedBox
    ? {
        lidarPoints: selectedBox.annotation?.lidarPoints,
        visibility: selectedBox.annotation?.visibility,
        // (F6) Every camera whose photo shows the box, best view first.
        seenBy: camerasByBestView(currentFrame, selectedBox.id),
        // (F8) The counts above are the dataset's, about ITS box.
        edited: edited.inFrame.has(selectedBox.id),
      }
    : null;
  // (F6) The thumbnail row: each camera's photo, and where the selected box is
  // in it. Only for frames with several cameras. In evaluate mode each
  // thumbnail also says how many labels the model missed in that photo.
  const showCameraStrip = cameraSlots > 1;
  const cameraThumbs: CameraThumb[] = cameraRow.map((view) => {
    // (F7.5) In the sample check the "selected box" is a model box: it is in
    // exactly one photo, and that thumbnail carries the marker — the way back
    // after looking through another camera.
    const sampled = sampleCheckOn ? sampleCheck.current?.item : undefined;
    const box = sampled
      ? sampled.camera === view.name && sampled.bbox
        ? { bbox: sampled.bbox }
        : undefined
      : selectedObjectId
        ? view.detections2D.find((d) => d.id === selectedObjectId)
        : undefined;
    const photo =
      evaluating || exploringModel ? frameEvaluation?.byCamera.get(view.name) : undefined;
    // (F7) Explore with a model condition: how many of the results the search
    // counts are in each photo, so the photo to look at is one click away.
    const searched = exploringModel && photo ? resultsForConditions(conditions, photo.results).length : 0;
    const badge: CameraThumb['badge'] = exploringModel
      ? photo
        ? {
            text: String(searched),
            tone: searched > 0 ? 'alert' : 'muted',
            title: `${searched} of the results this search counts are in this photo`,
          }
        : undefined
      : !evaluating || !frameEvaluation
        ? undefined
        : photo
          ? {
              text: String(photo.counts.missed),
              tone: photo.counts.missed > 0 ? 'alert' : 'muted',
              title: `${photo.counts.missed} missed · ${photo.counts.found} found · ${photo.counts.falseAlarm} ${outcomeCountLabel('false-alarm', photo.counts.falseAlarm)} in this photo`,
            }
          : { text: '–', tone: 'muted', title: 'No predictions for this photo — not evaluated' };
    return {
      name: view.name,
      imageUrl: view.imageUrl,
      ...(badge ? { badge } : {}),
      ...(box
        ? {
            marker: {
              x: box.bbox.x / view.imageWidth,
              y: box.bbox.y / view.imageHeight,
              width: box.bbox.width / view.imageWidth,
              height: box.bbox.height / view.imageHeight,
            },
          }
        : {}),
    };
  });
  // (F6) Evaluate mode: the selected 3D box has no result in the photo on
  // screen. Four different reasons, and the panel must not confuse them.
  const selectedNotEvaluated: NotEvaluatedBox | null = (() => {
    if (frameResults.selectedResult || !selectedBox || !selectedEvidence) return null;
    const base = { class: selectedBox.class, distance: detectionDistance(selectedBox) };
    const inPhoto = viewFrame.detections2D.some((d) => d.id === selectedBox.id);
    if (inPhoto && selectedBox.class === BICYCLE_RACK_CLASS) {
      return {
        ...base,
        reason: 'group-region',
        ignoredCount:
          photoEvaluation?.ignored.filter((i) => i.regionObjectId === selectedBox.id).length ?? 0,
      };
    }
    if (inPhoto) return { ...base, reason: 'class-not-evaluated' };
    if (selectedEvidence.seenBy.length === 0) return { ...base, reason: 'no-camera' };
    // In another camera's photo: say how it did there, or at least where it is.
    const elsewhere = describeOtherViews(frameEvaluation?.objects.get(selectedBox.id), activeCamera);
    return {
      ...base,
      reason: 'outside-camera',
      where: elsewhere ?? `seen by ${selectedEvidence.seenBy.map(cameraShortName).join(', ')}`,
    };
  })();
  // The selected box is not in the photo on screen: say which camera has it.
  const otherCameras = (selectedEvidence?.seenBy ?? []).filter((name) => name !== activeCamera);
  const outsideNote =
    otherCameras.length > 0 ? `seen by ${otherCameras.map(cameraShortName).join(', ')}` : undefined;

  return (
    <WorkspaceShell
      cameraAspect={cameraAspect}
      topBar={header}
      filterBar={
        editing ? (
          // (F8) One box is being edited: no class chips, no distance slider.
          <EditBar
            box={editor.target}
            frameIndex={frameIndex}
            view={editor.view}
            onToggleView={editor.toggleView}
            onUndo={editor.undo}
            onRedo={editor.redo}
            onRevert={editor.revert}
            onDone={editor.exit}
            notSaved={storedEdits.storageFailed}
            practice={plantedErrors !== null}
          />
        ) : sampleCheckOn ? (
          // (F7.5) The sample is fixed: no score slider, no class chips.
          <SampleBar
            population={sampleCheck.population}
            size={sampleCheck.size}
            sizes={sampleCheck.sizes}
            onChangeSize={sampleCheck.setSize}
            minScore={DEFAULT_MIN_SCORE}
            onExport={sampleCheck.exportFile}
            canExport={sampleCheck.population !== null}
            onExit={sampleCheck.exit}
          />
        ) : exploring && search ? (
          <ExploreBar
            conditions={conditions}
            onChange={setConditions}
            presets={SEARCH_PRESETS}
            classes={searchClasses}
            allowModel={MODEL_CONDITIONS}
            matched={search.hits.length}
            total={search.frames}
          />
        ) : (
        <Filters
          classes={allClasses}
          confidenceThreshold={confidenceThreshold}
          visibleClasses={visibleClasses}
          // (F5) Evaluate mode counts results (what the list shows), not boxes.
          visibleCount={evaluating ? frameResults.queue.length : visibleIds3D.size}
          totalCount={evaluating ? frameResults.ordered.length : totalCount}
          filterMode={filterMode}
          {...(evaluating
            ? {
                countNoun: 'results',
                thresholdLabel: 'Min score',
                thresholdTitle:
                  'Model boxes scoring below this are treated as if the model had not reported them. Higher → fewer false alarms, more misses.',
                defaultThreshold: DEFAULT_MIN_SCORE,
              }
            : {})}
          maxDistance={maxDistance}
          onChangeThreshold={setConfidenceThreshold}
          onChangeDistance={setMaxDistance}
          onToggleClass={toggleClass}
          onReset={evaluating ? handleResetEvaluationFilters : resetFilters}
          onDeselect={() => setSelectedObject(null)}
          // (F7.5) Evaluate mode: the overlap threshold, next to the score.
          afterMetric={
            evaluating ? <IouChoice value={iouThreshold} onChange={setIouThreshold} /> : undefined
          }
          afterMetricIsDefault={!evaluating || iouThreshold === IOU_THRESHOLD}
          // (F7.5) The way into the sample check, next to the numbers it is about.
          extra={
            evaluating ? (
              <button
                type="button"
                onClick={handleEnterSampleCheck}
                title="Judge a random sample of the false alarms that have no label nearby: is the model wrong, or is the label missing?"
                aria-label="Sample check"
                className="text-xs px-2 py-0.5 rounded border border-amber-400/30 text-amber-200 hover:border-amber-300/60 hover:text-amber-100 transition-colors whitespace-nowrap"
              >
                {/* Below 1280 px the class chips need the room (the bar is one line). */}
                Sample<span className="hidden xl:inline"> check</span>
              </button>
            ) : undefined
          }
        />
        )
      }
      list={
        editing ? (
          // (F8) The top-view editor lies over this cell in both of its views,
          // so the list is not drawn at all while it is open. Drawn but hidden,
          // its rows (one per box, up to 156) were rebuilt on every pointer move
          // of a drag for nobody to see. An empty panel keeps the cell's place.
          <div className={`h-full w-full ${PANEL_CLASS}`} />
        ) : sampleCheckOn ? (
          // (F7.5) The sample check lists the SAMPLED model boxes, across scenes.
          <SampleList
            sample={sampleCheck.sample}
            records={sampleCheck.records}
            summary={sampleCheck.summary}
            selectedId={sampleCheck.current?.item.predictionId ?? null}
            onOpen={sampleCheck.open}
            unavailable={sampleCheck.message}
            stepHint={`${SHORTCUT_KEYS.next} / ${SHORTCUT_KEYS.previous} to step`}
          />
        ) : exploring && search ? (
          // (F7) Explore mode lists the FRAMES that match the search.
          <ExploreResults
            hits={orderedHits}
            conditions={conditions}
            order={hitOrder}
            onChangeOrder={setHitOrder}
            currentFrameId={currentFrameId}
            onOpen={handleOpenHit}
            scenesWithMatches={search.scenesWithMatches}
            scenesSearched={search.byScene.length}
            scenesPending={(scenes.catalog?.scenes.length ?? 0) - search.byScene.length}
            stepHint={`${SHORTCUT_KEYS.previous} / ${SHORTCUT_KEYS.next} to step`}
          />
        ) : evaluating ? (
          // (F5) Evaluate mode lists the frame's RESULTS (misses first), not
          // its boxes. A click still goes through the one `selectedObjectId`.
          <ResultList
            results={frameResults.ordered}
            // (F6) The list is the photo on screen; its title says which camera.
            scope={cameraRow.length > 1 && activeCamera ? cameraShortName(activeCamera) : undefined}
            scopeTitle={activeCamera ?? undefined}
            counts={photoEvaluation?.counts ?? null}
            filter={frameResults.filter}
            onToggleKind={handleToggleKind}
            selectedId={
              frameResults.selectedResult ? selectionIdOf(frameResults.selectedResult) : null
            }
            onSelect={setSelectedObject}
            notEvaluated={photoEvaluation?.notEvaluated ?? 0}
            unavailable={
              photoEvaluation
                ? undefined
                : predictions.status === 'loading'
                  ? 'Loading predictions…'
                  : !predictions.set
                    ? 'Predictions unavailable.'
                    : frameEvaluation
                      ? 'No predictions for this photo — not evaluated.'
                      : 'No predictions for this frame — not evaluated.'
            }
          />
        ) : (
        <ObjectList
          frame={currentFrame}
          selectedId={selectedObjectId}
          onSelect={setSelectedObject}
          visibleIds={visibleIds3D}
          verdicts={frameVerdicts}
          editedIds={edited.inFrame}
          // (F4-C) The review queue order, plus the bar that changes it.
          boxes={orderedBoxes}
          orderKey={queueOrder}
          toolbar={
            reviewEnabled ? (
              <QueueBar
                order={queueOrder}
                onChangeOrder={setQueueOrder}
                remaining={queueRemaining}
              />
            ) : undefined
          }
        />
        )
      }
      main={
        // (F2-C) DATASET-AWARE key.
        // - COCO: key=frame.id → full Canvas remount per frame, so
        //   OrbitControls resets cleanly on every switch. Edge_#4 Case 6.
        // - nuScenes: a single STABLE key → the Canvas does NOT remount on
        //   frame switch, so the camera holds its position/orbit across
        //   frames and autoplay. Frame-to-frame the boxes move within a still
        //   camera (the "objects move" effect); without this the camera would
        //   bounce every 0.5 s during playback. Edge_F#2 Case 6.
        <Viewer3D
          key={tracksAcrossFrames ? 'nuscenes-sequence' : currentFrame.id}
          // (F7) The frame with its fetched point cloud (same boxes).
          frame={frame3D ?? currentFrame}
          // (F7) A new scene re-fits the camera inside the SAME canvas.
          framingKey={shownSceneName ?? undefined}
          selectedId={selectedObjectId}
          onSelect={setSelectedObject}
          visibleIds={visibleIds3D}
          // (F2-D) Camera-follow + box-tween are nuScenes-only; COCO gets the
          // defaults (fixed camera, no tween) so its path is unchanged.
          cameraMode={tracksAcrossFrames ? cameraMode : undefined}
          nextFrame={tracksAcrossFrames ? nextFrame : null}
          playing={tracksAcrossFrames ? isPlaying : false}
          label={label3D}
          // (F5) Evaluate mode: boxes take the colour of their outcome, so the
          // 3D view shows WHERE the model missed. Only colours change — the
          // same Canvas, the same camera. No evaluation for this frame → class
          // colours and no legend.
          // (F7) Explore mode: boxes that do not count toward the search are grey.
          boxColors={
            exploringModel || evaluating
              ? (frameResults.boxColors ?? undefined)
              : exploring
                ? searchBoxColors
                : undefined
          }
          legend={
            exploringModel && frameResults.boxColors ? (
              <BoxColorLegend anyCamera={cameraRow.length > 1} />
            ) : exploring && searchBoxColors ? (
              <>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-[1px] border border-zinc-100" />
                  in colour: counts toward the search
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-[1px] border border-zinc-600" />
                  grey: other boxes
                </span>
              </>
            ) : evaluating && frameResults.boxColors ? (
              <BoxColorLegend anyCamera={cameraRow.length > 1} />
            ) : undefined
          }
        />
      }
      camera={
        <Viewer2D
          // (F6) The frame as the camera on screen sees it.
          frame={viewFrame}
          selectedId={selectedObjectId}
          onSelect={setSelectedObject}
          visibleIds={visibleIds}
          label={label2D}
          outsideNote={outsideNote}
          // (F4-D) Zoom + projected 3D box, only where 2D boxes ARE projections
          // of reviewed 3D boxes. COCO gets no toggle and stays as before.
          zoom={reviewEnabled && cameraZoom}
          onToggleZoom={reviewEnabled ? () => setCameraZoom((z) => !z) : undefined}
          zoomShortcut={SHORTCUT_KEYS.zoom}
          // (F5) Evaluate mode: labels (dashed) and model boxes (solid) in
          // outcome colours, instead of the frame's own boxes. The viewer just
          // draws the rectangles it is given. Without an evaluation for this
          // frame there is nothing to compare, and the labels show as usual.
          // (F7) Explore with a model condition: the results that condition counts.
          overlay={evaluating || exploringModel ? (frameResults.overlay ?? undefined) : undefined}
          legend={evaluating || exploringModel ? <OverlayLegend /> : undefined}
        />
      }
      cameraStrip={
        showCameraStrip && activeCamera !== null ? (
          <CameraStrip
            cameras={cameraThumbs}
            activeName={activeCamera}
            onSelect={setCamera}
            slots={cameraSlots}
            shortcutHint={`${SHORTCUT_KEYS.previousCamera} ${SHORTCUT_KEYS.nextCamera}`}
          />
        ) : undefined
      }
      details={
        editing ? (
          <EditPanel
            target={editor.target}
            projector={editor.projector}
            frameIndex={frameIndex}
            pointsStatus={framePoints.status}
            record={
              selectedObjectId ? getReview(reviews, currentFrame.id, selectedObjectId) : undefined
            }
            emptyMessage={EDIT_BLOCK_MESSAGES[reviewBlock ?? 'not-in-frame']}
            locked={editor.locked}
            onSetField={editor.setField}
            notSaved={storedEdits.storageFailed}
            practice={plantedErrors !== null}
          />
        ) : sampleCheckOn ? (
          <SamplePanel
            status={sampleCheck.availability.status}
            message={sampleCheck.message}
            item={sampleCheck.current?.item ?? null}
            position={sampleCheck.current?.position ?? null}
            verdict={sampleCheck.current?.verdict ?? null}
            summary={sampleCheck.summary}
            viewingCamera={activeCamera}
            onShowBox={handleShowSampleBox}
            onVerdict={sampleCheck.judge}
            onClear={sampleCheck.clear}
            blocked={sampleCheck.blocked}
            storageFailed={reviewStorageFailed}
            keys={{
              verdicts: [SHORTCUT_KEYS.approve, SHORTCUT_KEYS.reject, SHORTCUT_KEYS.unsure],
              clear: SHORTCUT_KEYS.clear,
              step: SHORTCUT_KEYS.next,
            }}
          />
        ) : exploring && search && frameSearch ? (
          <SearchPanel
            conditions={conditions}
            frameIndex={frameIndex}
            frameBoxCount={totalCount}
            frameValues={frameSearch.values}
            frameMatches={frameSearch.matches}
            byScene={search.byScene}
            currentScene={shownSceneName}
            onOpenScene={handleOpenSceneHits}
            scenesTotal={scenes.catalog?.scenes.length ?? 0}
            scenesPending={(scenes.catalog?.scenes.length ?? 0) - search.byScene.length}
            framesSearched={search.frames}
            // A model box or label clicked in the photo: say what it is and why.
            pinned={
              exploringModel && frameResults.selectedResult ? (
                <SelectedResult
                  result={frameResults.selectedResult}
                  visibility={visibilityText(selectedBox?.annotation?.visibility)}
                  notEvaluated={null}
                  rules={DEFAULT_EVALUATION_RULES}
                  camera={activeCamera ?? undefined}
                  otherViews={null}
                />
              ) : undefined
            }
          />
        ) : evaluating ? (
          // (F5) In evaluate mode the details panel is the evaluation panel.
          <EvaluationPanel
            status={predictions.status === 'none' ? 'failed' : predictions.status}
            error={predictions.error}
            evaluation={evaluation}
            frameEvaluation={frameEvaluation}
            frameIndex={frameIndex}
            frameBoxCount={totalCount}
            model={predictions.set?.model}
            rules={evaluationRules}
            // (F7) The headline is this scene's; every scene is listed below it.
            scope={shownSceneName ?? undefined}
            scenes={scenesEvaluation}
            scenesTotal={scenes.catalog?.scenes.length ?? 0}
            scenesStale={scenesEvaluationStale}
            onOpenScene={handleSelectScene}
            onOpenReport={handleOpenReport}
            photoNote={
              scenes.catalog?.photo && scenes.catalog.photo.width < scenes.catalog.photo.sourceWidth
                ? `the original ${scenes.catalog.photo.sourceWidth}×${scenes.catalog.photo.sourceHeight} photos (the photos shown here are ${scenes.catalog.photo.width}×${scenes.catalog.photo.height} copies)`
                : undefined
            }
            pinned={
              <SelectedResult
                result={frameResults.selectedResult}
                visibility={visibilityText(selectedBox?.annotation?.visibility)}
                // A selected 3D box with no result in this photo: say why.
                notEvaluated={selectedNotEvaluated}
                rules={evaluationRules}
                camera={activeCamera ?? undefined}
                // (F6) The same object in the other cameras' photos.
                otherViews={
                  frameResults.selectedResult && frameResults.selectedResult.kind !== 'false-alarm'
                    ? describeOtherViews(
                        frameEvaluation?.objects.get(frameResults.selectedResult.objectId),
                        activeCamera,
                      )
                    : null
                }
              />
            }
          />
        ) : (
        <AnalyticsPanel
          // (F6) The 2D bbox row describes the box in the photo on screen.
          frame={viewFrame}
          selectedId={selectedObjectId}
          buckets={confidenceBuckets}
          threshold={confidenceThreshold}
          counts={classCounts}
          visibleClasses={visibleClasses}
          onToggleClass={toggleClass}
          // (F8) What the reviewer changed on the selected box, if anything.
          editNote={
            editor.target?.edited ? editor.target.changeText.join(' · ') || 'edited' : undefined
          }
          // (F4) On reviewed datasets the details panel is the review panel:
          // verdict controls pinned above the scrolling details.
          {...(reviewEnabled && frameReviewCounts
            ? {
                title: 'Review',
                headerRight: (
                  <span className="text-[11px] text-zinc-500 tabular-nums">
                    Frame {frameIndex} · {frameReviewCounts.reviewed}/{frameReviewCounts.total}
                  </span>
                ),
                bodyTop: practiceScores ? (
                  <PracticeScoreCard
                    // Keyed on the frame: "Reveal answers" resets per frame.
                    key={currentFrame.id}
                    frameScore={practiceScores.frame}
                    overallScore={practiceScores.overall}
                    plantedInFrame={practiceScores.plantedInFrame}
                    closeness={practiceCloseness}
                    onSelect={setSelectedObject}
                  />
                ) : undefined,
                controls: (
                  <ReviewControls
                    record={
                      selectedObjectId
                        ? getReview(reviews, currentFrame.id, selectedObjectId)
                        : undefined
                    }
                    blocked={reviewBlock}
                    evidence={selectedEvidence}
                    onVerdict={handleVerdict}
                    onToggleReason={handleToggleReason}
                    onNote={handleNote}
                    onClear={handleClearReview}
                    // (F8) The way into the top-view editor, for any box whose
                    // frame can be edited.
                    edit={
                      editor.target
                        ? { edited: editor.target.edited, onEdit: editor.enter }
                        : undefined
                    }
                    queueDone={queue.length > 0 && queueRemaining === 0}
                    onNextFrame={nextReviewFrameId ? handleNextReviewFrame : undefined}
                    hiddenUnreviewed={
                      reviewProgress
                        ? reviewProgress.overall.total - reviewProgress.overall.reviewed
                        : 0
                    }
                  />
                ),
              }
            : {})}
        />
        )
      }
      // (F7.5) The evaluation report, over the list and the 3D view (both stay
      // mounted underneath — the canvas is not re-created).
      // (F8) The top-view editor uses the same slot. Focus view: over the list
      // and the 3D view. Split view: over the list only, with the list and the
      // 3D column made equally wide — the 3D view is the same grid item in the
      // same place in both, so its canvas is only resized.
      overlayLabel={editing ? 'Top view' : undefined}
      overlaySpan={editing && editor.view === 'split' ? 'list' : 'list+main'}
      evenColumns={editing && editor.view === 'split'}
      overlay={
        editing && editor.projector ? (
          <BevEditor
            frame={currentFrame}
            points={framePointList}
            pointsStatus={framePoints.status}
            projector={editor.projector}
            target={editor.target}
            emptyMessage={EDIT_BLOCK_MESSAGES[reviewBlock ?? 'not-in-frame']}
            growFrom={editor.growFrom}
            locked={editor.locked}
            practice={plantedErrors !== null}
            onDragStart={editor.beginDrag}
            onDrag={editor.dragTo}
            onDragEnd={editor.endDrag}
            onDragCancel={editor.cancelDrag}
          />
        ) : reportOn && scenesEvaluation && reportTables ? (
          <EvaluationReport
            scenes={scenesEvaluation}
            scenesTotal={scenes.catalog?.scenes.length ?? 0}
            stale={scenesEvaluationStale}
            model={predictions.set?.model}
            rules={evaluationRules}
            drives={reportTables.drives}
            comparison={reportTables.comparison}
            unlabelled={{
              status: sampleCheck.availability.status,
              message: sampleCheck.message,
              count: sampleCheck.population,
              falseAlarms: sampleCheck.falseAlarms,
              minScore: DEFAULT_MIN_SCORE,
              iouThreshold: IOU_THRESHOLD,
              summary: sampleCheck.summary,
            }}
            onCheckSample={handleEnterSampleCheck}
            onClose={handleCloseReport}
          />
        ) : undefined
      }
      timeline={
        // (F2-C) Autoplay controls are passed only when the dataset tracks
        // objects (nuScenes); on COCO the play button is hidden (independent
        // frames → playback would be a meaningless slideshow).
        <Timeline
          frames={frames}
          selectedFrameId={currentFrameId}
          onSelectFrame={handleSelectFrame}
          // (F7) A scene has ~40 frames: one bar per frame instead of one photo.
          // COCO keeps its ten thumbnails.
          variant={tracksAcrossFrames ? 'scrubber' : 'thumbnails'}
          leading={scenePicker}
          isPlaying={tracksAcrossFrames ? isPlaying : undefined}
          onTogglePlay={
            tracksAcrossFrames ? () => setIsPlaying((p) => !p) : undefined
          }
          // (F2-D-1) Fixed/Follow camera toggle, nuScenes only.
          cameraMode={tracksAcrossFrames ? cameraMode : undefined}
          onToggleCameraMode={
            tracksAcrossFrames
              ? () => setCameraMode((m) => (m === 'fixed' ? 'follow' : 'fixed'))
              : undefined
          }
          // Reset-to-frame-1 is sequence-only → nuScenes; COCO frames are
          // independent so it's hidden there (callback omitted).
          onReset={tracksAcrossFrames ? handleResetSequence : undefined}
          // (F5) Evaluate mode: "N missed" per frame instead of review counts.
          reviewCounts={evaluating || exploring ? undefined : reviewProgress?.byFrame}
          // (F7) Explore mode: which frames match the search, and by how much.
          badges={exploring ? searchBadges : evaluationBadges}
        />
      }
    />
  );
}

// (F3) Stand-in for a pane while loading / on error. Fills its cell so the
// workspace keeps its final geometry before data arrives.
function PanePlaceholder({ pulse, className = '' }: { pulse: boolean; className?: string }) {
  return (
    <div
      className={`h-full w-full ${PANEL_CLASS} ${pulse ? 'animate-pulse' : ''} ${className}`}
    />
  );
}

function PaneMessage({ children }: { children: ReactNode }) {
  return (
    <div className={`h-full w-full ${PANEL_CLASS} flex flex-col items-center justify-center gap-3 p-8 text-center`}>
      {children}
    </div>
  );
}
