'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { parseCoco } from '@/lib/coco';
import { parseNuScenes } from '@/lib/nuscenes';
import { fetchJson } from '@/lib/data/fetch-json';
import { enrichFrame } from '@/lib/geometry';
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
import { Viewer3D } from '@/components/viewer-3d';
import { ObjectList } from '@/components/object-list';
import { Filters } from '@/components/filters';
import { Header, type DatasetId } from '@/components/header';
import { Timeline, type TimelineBadge } from '@/components/timeline';
import { AnalyticsPanel } from '@/components/analytics';
import { PANEL_CLASS, WorkspaceShell } from '@/components/workspace';
import {
  BoxColorLegend,
  EvaluationHeadline,
  EvaluationPanel,
  ModeSwitch,
  OverlayLegend,
  ResultList,
  SelectedResult,
  useFrameResults,
  usePredictions,
  type WorkMode,
} from '@/components/evaluation';
import {
  DEFAULT_MIN_SCORE,
  IOU_THRESHOLD,
  evaluateFrames,
  findResult,
  isPredictionId,
  selectionIdOf,
  visibilityText,
  type EvalKind,
  type EvaluationRules,
} from '@/lib/evaluation';
import { DISTANCE_MAX } from '@/lib/ui/distance';
import {
  ExportMenu,
  PracticeScoreCard,
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
  buildReviewExport,
  getReview,
  getReviewBlock,
  makePracticeSet,
  nextFrameWithUnreviewed,
  nextUnreviewed,
  orderBoxes,
  reviewExportFilename,
  reviewExportToCsv,
  reviewExportToJson,
  scorePractice,
  stepInQueue,
  summarizeProgress,
  verdictsOfFrame,
  type PlantedError,
  type QueueOrder,
  type RejectReason,
  type ReviewAction,
  type ReviewExportFileType,
  type ReviewScope,
  type Verdict,
} from '@/lib/review';
import { REVIEW_STORAGE_KEY, useReviewStore, useViewerStore } from '@/store';
import type { Frame } from '@/lib/types';

// Static sample sources, one per dataset. Both are served from /public; there
// is no backend (nuScenes was flattened offline by scripts/prep_nuscenes.py).
const DATASET_SOURCES: Record<DatasetId, string> = {
  coco: '/sample-data/sample.json',
  nuscenes: '/sample-data/nuscenes/nuscenes.json',
};

// (F5) Camera-detector predictions for a dataset, written offline by
// scripts/predict_nuscenes.py. A separate file on purpose: the labels file does
// not change when the model is re-run, and review works without it.
const PREDICTION_SOURCES: Partial<Record<DatasetId, string>> = {
  nuscenes: '/sample-data/nuscenes/predictions.json',
};

// Set intersection (no Set.prototype.intersection in our target runtimes).
const intersectIds = (a: Set<string>, b: Set<string>): Set<string> =>
  new Set([...a].filter((id) => b.has(id)));

export default function Index() {
  // The active dataset. COCO and nuScenes coexist (F2-A) — the switcher in the
  // Header flips this, which re-runs the loader below. Default = nuScenes so the
  // app opens on the measured-3D headline feature.
  const [datasetId, setDatasetId] = useState<DatasetId>('nuscenes');
  // `frames` holds FINAL (enriched) frames ready to render. COCO frames are
  // enriched here (estimated 3D); nuScenes frames arrive already enriched from
  // parseNuScenes (measured 3D) and must NOT be re-enriched.
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  const [plantedErrors, setPlantedErrors] = useState<PlantedError[] | null>(null);
  // (F5) What the workspace is used for: reviewing the labels, or evaluating a
  // camera detector against them. A VIEW setting like `cameraMode` — the frame
  // and the selected object are shared by both modes (Rule #2: still one
  // `selectedObjectId`). nuScenes only; reset to 'review' on a dataset switch.
  const [mode, setMode] = useState<WorkMode>('review');
  // The model's predictions, loaded next to the dataset. Independent of the
  // dataset request: if this one fails, review still works.
  const predictions = usePredictions(PREDICTION_SOURCES[datasetId] ?? null);
  // (F5) Which outcomes the result list and the camera image show (empty = all
  // four, the same convention as `visibleClasses`). A VIEW filter of evaluate
  // mode; it never changes a number.
  const [shownKinds, setShownKinds] = useState<ReadonlySet<EvalKind>>(() => new Set());

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

  // Load the active dataset. Re-runs on dataset switch; clears stale frames so
  // the loading skeleton shows and the auto-select effect re-homes to the new
  // frames[0] (the old selectedFrameId won't exist in the new set).
  useEffect(() => {
    const ac = new AbortController();
    setFrames(null);
    setPlantedErrors(null);
    setError(null);
    // `fetchJson` rejects with the HTTP status on a non-2xx answer, so a failed
    // request is reported as what it is and not as a JSON parse error.
    fetchJson(DATASET_SOURCES[datasetId], { signal: ac.signal })
      .then((raw) => {
        // COCO: parse → estimate 3D (enrichFrame). nuScenes: parseNuScenes
        // already returns measured, enriched frames — do not estimate again.
        if (datasetId === 'coco') {
          setFrames(parseCoco(raw).map((f) => enrichFrame(f)));
          return;
        }
        // (F4-F) Practice set: modify a few boxes in the RAW data, then parse as
        // usual — 3D boxes, camera projections and ids all follow from the same
        // modified values. The file on disk is never changed.
        if (practice) {
          // Which boxes the camera sees decides where an error is FAIR (a wrong
          // class can only be recognised in the photo). That needs one plain
          // parse of the original data first; the practice set is parsed after.
          const seen = new Set(
            parseNuScenes(raw).flatMap((f) => f.detections2D.map((d) => `${f.id}/${d.id}`)),
          );
          const set = makePracticeSet(raw, {
            inCamera: (frameToken, instanceToken) => seen.has(`${frameToken}/${instanceToken}`),
          });
          setFrames(parseNuScenes(set.prepped));
          setPlantedErrors(set.planted);
        } else {
          setFrames(parseNuScenes(raw));
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(String(err));
      });
    return () => ac.abort();
  }, [datasetId, practice]);

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

  const currentFrame = useMemo(() => {
    if (!frames) return null;
    return frames.find((f) => f.id === selectedFrameId) ?? null;
  }, [frames, selectedFrameId]);

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
    return out;
  }, [frames]);

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
    const idx = frames.findIndex((f) => f.id === selectedFrameId);
    const next = nextFrameIndex(idx, frames.length, { loop: true });
    return next === null ? null : frames[next];
  }, [tracksAcrossFrames, frames, selectedFrameId]);

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

  // In evaluate mode the store's `confidenceThreshold` is the MODEL's minimum
  // score (set on entering, see `handleSelectMode`). It must not filter the
  // labels — they carry a placeholder confidence, not a score — and the
  // distance slider is not shown, so the distance filter is off as well.
  const labelThreshold = evaluating ? 0 : confidenceThreshold;
  const labelMaxDistance = evaluating ? DISTANCE_MAX : maxDistance;

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
      currentFrame
        ? intersectIds(
            selectVisibleDetectionIds(currentFrame, labelThreshold, visibleClasses),
            withinDistance,
          )
        : new Set<string>(),
    [currentFrame, labelThreshold, visibleClasses, withinDistance],
  );
  // The 3D rule as a function of the frame, so the SAME rule can be applied to
  // a frame other than the current one (F4: the queue of the frame we are about
  // to jump to).
  const visibleIds3DOf = useCallback(
    (frame: Frame) =>
      intersectIds(
        selectVisibleDetectionIds3D(frame, labelThreshold, visibleClasses),
        selectIdsWithinDistance(frame.detections3D, labelMaxDistance),
      ),
    [labelThreshold, visibleClasses, labelMaxDistance],
  );
  const visibleIds3D = useMemo(
    () => (currentFrame ? visibleIds3DOf(currentFrame) : new Set<string>()),
    [currentFrame, visibleIds3DOf],
  );

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
  const evaluationRules = useMemo<EvaluationRules>(
    () => ({ minScore: confidenceThreshold, iouThreshold: IOU_THRESHOLD }),
    [confidenceThreshold],
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
      const { missed, found, falseAlarm } = result.counts;
      badges.set(frame.id, {
        text: `${missed} missed`,
        tone: missed > 0 ? 'alert' : 'good',
        title: `${missed} missed · ${found} found · ${falseAlarm} false alarm${falseAlarm === 1 ? '' : 's'}`,
      });
    }
    return badges;
  }, [evaluation, frames]);
  // (F5) The current frame's results, as the list, the camera image and the
  // J / K queue need them. `null` evaluation → empty list, no overlay.
  const frameEvaluation = (currentFrame && evaluation?.byFrame.get(currentFrame.id)) ?? null;
  const frameResults = useFrameResults({
    frame: currentFrame,
    predictions: currentFrame ? predictions.set?.byFrame.get(currentFrame.id) : undefined,
    frameEvaluation,
    selectedId: selectedObjectId,
    classes: visibleClasses,
    kinds: shownKinds,
  });
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
  // frame changes, when evaluate mode is left, or when the score slider moves
  // past it — otherwise an invisible "selection" would linger.
  useEffect(() => {
    if (!selectedObjectId || !isPredictionId(selectedObjectId)) return;
    if (!frameEvaluation || !findResult(frameEvaluation, selectedObjectId)) {
      setSelectedObject(null);
    }
  }, [selectedObjectId, frameEvaluation, setSelectedObject]);

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
  const currentFrameId = currentFrame?.id ?? null;
  // (F4-C) The list order and the review queue. The list shows every box in
  // `orderedBoxes`; the queue is the part of it that passes the filters — the
  // boxes J / K walk and the pool "next unreviewed" is drawn from.
  const orderedBoxes = useMemo(
    () => (currentFrame ? orderBoxes(currentFrame, reviewEnabled ? queueOrder : 'scene') : []),
    [currentFrame, reviewEnabled, queueOrder],
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
      const next = nextUnreviewed(queue, latest, currentFrameId, selectedObjectId);
      if (next) setSelectedObject(next);
    },
    [
      reviewBlock,
      currentFrameId,
      selectedObjectId,
      reviewScope,
      setVerdict,
      queue,
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
  const handleExport = useCallback(
    (type: ReviewExportFileType) => {
      if (!frames) return;
      const now = new Date();
      const data = buildReviewExport(frames, reviews, {
        scope: reviewScope,
        exportedAt: now.toISOString(),
      });
      const filename = reviewExportFilename(reviewScope, now, type);
      if (type === 'json') {
        downloadTextFile(filename, reviewExportToJson(data), 'application/json');
      } else {
        downloadTextFile(filename, UTF8_BOM + reviewExportToCsv(data), 'text/csv');
      }
    },
    [frames, reviews, reviewScope],
  );
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
    const targetQueue = buildQueue(orderBoxes(target, queueOrder), visibleIds3DOf(target));
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

  // (F4-C) Keyboard shortcuts. `resolveShortcut` (lib/review) decides what a key
  // means; this decides what the action does — always through the same handlers
  // the buttons use, so mouse and keyboard cannot drift apart.
  const handleReviewAction = useCallback(
    (action: ReviewAction) => {
      // (F5) Evaluate mode only looks: moving through the list (J / K) and the
      // camera zoom (Z) work; the keys that WRITE a review do nothing, so a
      // stray "A" cannot approve a box whose verdict is not even on screen.
      if (evaluating && action.type !== 'step' && action.type !== 'toggle-zoom') return;
      switch (action.type) {
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
      }
    },
    [
      evaluating,
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
  useReviewShortcuts(handleReviewAction, reviewEnabled && currentFrame !== null);

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
      setShownKinds(new Set()); // (F5) show every outcome again
    },
    [datasetId, setSelectedObject, resetFilters],
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
      if (next === 'evaluate' && evaluateBlocked) return;
      setMode(next);
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
  }, [resetFilters, setMaxDistance, maxDistance, setConfidenceThreshold]);

  // (F4-F) Enter / leave practice mode. The data reloads (the loader effect
  // depends on `practice`); the frame position is kept (same frame ids), the
  // object selection and playback are not — the boxes themselves change.
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
        datasetId === 'nuscenes' && mode !== 'evaluate' ? handleTogglePractice : undefined
      }
      modeSwitch={
        datasetId === 'nuscenes' ? (
          <ModeSwitch mode={mode} onSelect={handleSelectMode} evaluateBlocked={evaluateBlocked} />
        ) : undefined
      }
    >
      {evaluating ? (
        <EvaluationHeadline
          summary={evaluation?.summary ?? null}
          status={predictions.status === 'none' ? 'failed' : predictions.status}
          modelName={predictions.set?.model.name}
          basis={
            evaluation
              ? `All ${evaluation.evaluatedFrames} evaluated frames · ${predictions.set?.camera ?? 'camera'} · score ≥ ${confidenceThreshold.toFixed(2)} · IoU ≥ ${IOU_THRESHOLD} · small sample`
              : undefined
          }
        />
      ) : (
        reviewProgress && (
        <>
          <ReviewProgress counts={reviewProgress.overall} notSaved={reviewStorageFailed} />
          <ExportMenu
            reviewedCount={reviewProgress.overall.reviewed}
            onExport={handleExport}
            onReset={handleResetReviews}
          />
        </>
        )
      )}
    </Header>
  );

  if (error || !frames || frames.length === 0 || !currentFrame) {
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
        details={<PanePlaceholder pulse={loading} className="min-h-48 lg:min-h-0" />}
        timeline={<PanePlaceholder pulse={loading} className="min-h-[84px]" />}
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
  // is fixed because scripts/prep_nuscenes.py exports CAM_FRONT only (until F6).
  const isMeasured = currentFrame.source === 'nuscenes-measured';
  // Practice set: the points are still measured, the boxes are not the
  // dataset's any more — the tag must not read "measured 3D".
  const label3D = plantedErrors
    ? 'LiDAR measured · boxes modified (practice)'
    : isMeasured
      ? 'LiDAR · measured 3D'
      : '3D · estimated from 2D';
  const label2D = isMeasured ? 'CAM_FRONT' : 'Image';
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
        inCamera: currentFrame.detections2D.some((d) => d.id === selectedBox.id),
      }
    : null;

  return (
    <WorkspaceShell
      cameraAspect={cameraAspect}
      topBar={header}
      filterBar={
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
        />
      }
      list={
        evaluating ? (
          // (F5) Evaluate mode lists the frame's RESULTS (misses first), not
          // its boxes. A click still goes through the one `selectedObjectId`.
          <ResultList
            results={frameResults.ordered}
            counts={frameEvaluation?.counts ?? null}
            filter={frameResults.filter}
            onToggleKind={handleToggleKind}
            selectedId={
              frameResults.selectedResult ? selectionIdOf(frameResults.selectedResult) : null
            }
            onSelect={setSelectedObject}
            notEvaluated={frameEvaluation?.notEvaluated ?? 0}
            unavailable={
              frameEvaluation
                ? undefined
                : predictions.status === 'loading'
                  ? 'Loading predictions…'
                  : predictions.set
                    ? 'No predictions for this frame — not evaluated.'
                    : 'Predictions unavailable.'
            }
          />
        ) : (
        <ObjectList
          frame={currentFrame}
          selectedId={selectedObjectId}
          onSelect={setSelectedObject}
          visibleIds={visibleIds3D}
          verdicts={frameVerdicts}
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
          frame={currentFrame}
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
          boxColors={evaluating ? (frameResults.boxColors ?? undefined) : undefined}
          legend={evaluating && frameResults.boxColors ? <BoxColorLegend /> : undefined}
        />
      }
      camera={
        <Viewer2D
          frame={currentFrame}
          selectedId={selectedObjectId}
          onSelect={setSelectedObject}
          visibleIds={visibleIds}
          label={label2D}
          // (F4-D) Zoom + projected 3D box, only where 2D boxes ARE projections
          // of reviewed 3D boxes. COCO gets no toggle and stays as before.
          zoom={reviewEnabled && cameraZoom}
          onToggleZoom={reviewEnabled ? () => setCameraZoom((z) => !z) : undefined}
          zoomShortcut={SHORTCUT_KEYS.zoom}
          // (F5) Evaluate mode: labels (dashed) and model boxes (solid) in
          // outcome colours, instead of the frame's own boxes. The viewer just
          // draws the rectangles it is given. Without an evaluation for this
          // frame there is nothing to compare, and the labels show as usual.
          overlay={evaluating ? (frameResults.overlay ?? undefined) : undefined}
          legend={evaluating ? <OverlayLegend /> : undefined}
        />
      }
      details={
        evaluating ? (
          // (F5) In evaluate mode the details panel is the evaluation panel.
          <EvaluationPanel
            status={predictions.status === 'none' ? 'failed' : predictions.status}
            error={predictions.error}
            evaluation={evaluation}
            frameEvaluation={evaluation?.byFrame.get(currentFrame.id) ?? null}
            frameIndex={frameIndex}
            frameBoxCount={totalCount}
            model={predictions.set?.model}
            camera={predictions.set?.camera}
            rules={evaluationRules}
            pinned={
              <SelectedResult
                result={frameResults.selectedResult}
                visibility={visibilityText(selectedBox?.annotation?.visibility)}
                // A selected 3D box with no result: say why it is not scored.
                notEvaluated={
                  !frameResults.selectedResult && selectedBox && selectedEvidence
                    ? {
                        class: selectedBox.class,
                        distance: detectionDistance(selectedBox),
                        reason: selectedEvidence.inCamera
                          ? 'class-not-evaluated'
                          : 'outside-camera',
                      }
                    : null
                }
                rules={evaluationRules}
                camera={predictions.set?.camera}
              />
            }
          />
        ) : (
        <AnalyticsPanel
          frame={currentFrame}
          selectedId={selectedObjectId}
          buckets={confidenceBuckets}
          threshold={confidenceThreshold}
          counts={classCounts}
          visibleClasses={visibleClasses}
          onToggleClass={toggleClass}
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
      timeline={
        // (F2-C) Autoplay controls are passed only when the dataset tracks
        // objects (nuScenes); on COCO the play button is hidden (independent
        // frames → playback would be a meaningless slideshow).
        <Timeline
          frames={frames}
          selectedFrameId={selectedFrameId}
          onSelectFrame={handleSelectFrame}
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
          reviewCounts={evaluating ? undefined : reviewProgress?.byFrame}
          badges={evaluationBadges}
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
