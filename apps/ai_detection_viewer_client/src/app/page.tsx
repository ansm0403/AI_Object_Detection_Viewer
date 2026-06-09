'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseCoco } from '@/lib/coco';
import { parseNuScenes } from '@/lib/nuscenes';
import { enrichFrame } from '@/lib/geometry';
import { AUTOPLAY_INTERVAL_MS, nextFrameIndex } from '@/lib/sequence';
import {
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
import { Timeline } from '@/components/timeline';
import { AnalyticsPanel } from '@/components/analytics';
import { useViewerStore } from '@/store';
import type { Frame } from '@/lib/types';

// Static sample sources, one per dataset. Both are served from /public; there
// is no backend (nuScenes was flattened offline by scripts/prep_nuscenes.py).
const DATASET_SOURCES: Record<DatasetId, string> = {
  coco: '/sample-data/sample.json',
  nuscenes: '/sample-data/nuscenes/nuscenes.json',
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

  // Load the active dataset. Re-runs on dataset switch; clears stale frames so
  // the loading skeleton shows and the auto-select effect re-homes to the new
  // frames[0] (the old selectedFrameId won't exist in the new set).
  useEffect(() => {
    const ac = new AbortController();
    setFrames(null);
    setError(null);
    fetch(DATASET_SOURCES[datasetId], { signal: ac.signal })
      .then((r) => r.json())
      .then((raw) => {
        // COCO: parse → estimate 3D (enrichFrame). nuScenes: parseNuScenes
        // already returns measured, enriched frames — do not estimate again.
        const parsed =
          datasetId === 'coco'
            ? parseCoco(raw).map((f) => enrichFrame(f))
            : parseNuScenes(raw);
        setFrames(parsed);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(String(err));
      });
    return () => ac.abort();
  }, [datasetId]);

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

  // Distance filter (F2-A): ids of 3D boxes within maxDistance of the ego
  // vehicle. On COCO this passes everything (estimated centers are well within
  // the 90 m default) so it is a no-op there; on nuScenes it is the real filter.
  const withinDistance = useMemo(
    () =>
      currentFrame
        ? selectIdsWithinDistance(currentFrame.detections3D, maxDistance)
        : new Set<string>(),
    [currentFrame, maxDistance],
  );

  // Two visible-id sets. The 2D set drives Viewer2D + ObjectList; the 3D set
  // drives Viewer3D. They diverge only on nuScenes, where a measured 3D box may
  // have no 2D projection (behind camera / off-screen, Edge_F#2 Case 1) — the
  // 3D set must still include it so the box renders. Both are intersected with
  // the distance filter. COCO is 1:1, so both sets coincide there.
  const visibleIds = useMemo(
    () =>
      currentFrame
        ? intersectIds(
            selectVisibleDetectionIds(currentFrame, confidenceThreshold, visibleClasses),
            withinDistance,
          )
        : new Set<string>(),
    [currentFrame, confidenceThreshold, visibleClasses, withinDistance],
  );
  const visibleIds3D = useMemo(
    () =>
      currentFrame
        ? intersectIds(
            selectVisibleDetectionIds3D(currentFrame, confidenceThreshold, visibleClasses),
            withinDistance,
          )
        : new Set<string>(),
    [currentFrame, confidenceThreshold, visibleClasses, withinDistance],
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
    },
    [datasetId, setSelectedObject, resetFilters],
  );

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <p className="text-rose-400 text-sm">Failed to load sample data</p>
          <p className="text-zinc-600 text-xs font-mono">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-3 py-1.5 rounded text-xs bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!frames) {
    return (
      <main className="p-4 max-w-screen-xl mx-auto flex flex-col gap-4">
        <div className="h-12 rounded-lg bg-zinc-900 animate-pulse" />
        <div className="h-14 rounded-lg bg-zinc-900 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-5 aspect-[4/3] rounded-lg bg-zinc-900 animate-pulse" />
          <div className="md:col-span-7 aspect-[4/3] rounded-lg bg-zinc-900 animate-pulse" />
          <div className="md:col-span-12 h-28 rounded-lg bg-zinc-900 animate-pulse" />
          <div className="md:col-span-5 rounded-lg bg-zinc-900 animate-pulse h-64 md:h-72" />
          <div className="md:col-span-7 rounded-lg bg-zinc-900 animate-pulse h-64 md:h-72" />
        </div>
      </main>
    );
  }

  if (frames.length === 0)
    return <main className="p-4 text-zinc-400">No frames.</main>;
  // selectedFrameId is null for one render between frames arriving and the
  // auto-select effect firing; render a placeholder rather than crash.
  if (!currentFrame) return <main className="p-4 text-zinc-400">Selecting frame…</main>;

  // Count by 3D boxes — the main view (Rule #5) renders 3D, and on nuScenes the
  // 3D set is the superset (some boxes have no 2D projection). COCO is 1:1, so
  // this matches the previous detections2D count there.
  const totalCount = currentFrame.detections3D.length;
  const filterMode = datasetId === 'nuscenes' ? 'distance' : 'confidence';

  // Layout: 12-column grid with Timeline wedged between row 1 (viewers) and
  // row 2 (list + analytics) so frame navigation stays within reach of the
  // viewers it controls.
  // Row 1 — Viewer2D (5) | Viewer3D (7): the 7-wide Viewer3D promotes it as
  //   the main view per Immutable Rule #5.
  // Timeline (full width) — placed here, not at the bottom, because it is the
  //   primary frame-switch control and belongs next to the viewers it drives.
  // Row 2 — ObjectList (5) | AnalyticsPanel (7): downstream views of the
  //   currently selected frame; living below the Timeline matches the
  //   "select frame → inspect" reading order.
  // Header / Filters span the full width above.
  return (
    <main className="p-4 max-w-screen-xl mx-auto flex flex-col gap-4">
      <Header
        frameIndex={frameIndex}
        frameCount={frames.length}
        detectionCount={totalCount}
        datasetId={datasetId}
        onSelectDataset={handleSelectDataset}
        source={currentFrame.source}
      />
      <Filters
        classes={allClasses}
        confidenceThreshold={confidenceThreshold}
        visibleClasses={visibleClasses}
        visibleCount={visibleIds3D.size}
        totalCount={totalCount}
        filterMode={filterMode}
        maxDistance={maxDistance}
        onChangeThreshold={setConfidenceThreshold}
        onChangeDistance={setMaxDistance}
        onToggleClass={toggleClass}
        onReset={resetFilters}
        onDeselect={() => setSelectedObject(null)}
      />
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-5">
          <Viewer2D
            frame={currentFrame}
            selectedId={selectedObjectId}
            onSelect={setSelectedObject}
            visibleIds={visibleIds}
          />
        </div>
        <div className="md:col-span-7">
          {/* (F2-C) DATASET-AWARE key.
              - COCO: key=frame.id → full Canvas remount per frame, so
                OrbitControls resets cleanly on every switch. Edge_#4 Case 6.
              - nuScenes: a single STABLE key → the Canvas does NOT remount on
                frame switch, so the camera holds its position/orbit across
                frames and autoplay. Frame-to-frame the boxes move within a still
                camera (the "objects move" effect); without this the camera would
                bounce every 0.5 s during playback. Edge_F#2 Case 6. */}
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
          />
        </div>
        <div className="md:col-span-12">
          {/* (F2-C) Autoplay controls are passed only when the dataset tracks
              objects (nuScenes); on COCO the play button is hidden (independent
              frames → playback would be a meaningless slideshow). */}
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
          />
        </div>
        <div className="md:col-span-5">
          <ObjectList
            frame={currentFrame}
            selectedId={selectedObjectId}
            onSelect={setSelectedObject}
            visibleIds={visibleIds}
          />
        </div>
        <div className="md:col-span-7">
          <AnalyticsPanel
            frame={currentFrame}
            selectedId={selectedObjectId}
            buckets={confidenceBuckets}
            threshold={confidenceThreshold}
            counts={classCounts}
            visibleClasses={visibleClasses}
            onToggleClass={toggleClass}
          />
        </div>
      </div>
    </main>
  );
}
