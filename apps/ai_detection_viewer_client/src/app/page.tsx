'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseCoco } from '@/lib/coco';
import { enrichFrame } from '@/lib/geometry';
import { selectVisibleDetectionIds } from '@/lib/selectors';
import { Viewer2D } from '@/components/viewer-2d';
import { Viewer3D } from '@/components/viewer-3d';
import { ObjectList } from '@/components/object-list';
import { Filters } from '@/components/filters';
import { Header } from '@/components/header';
import { Timeline } from '@/components/timeline';
import { useViewerStore } from '@/store';
import type { Frame } from '@/lib/types';


export default function Index() {
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedFrameId = useViewerStore((s) => s.selectedFrameId);
  const setSelectedFrame = useViewerStore((s) => s.setSelectedFrame);
  const selectedObjectId = useViewerStore((s) => s.selectedObjectId);
  const setSelectedObject = useViewerStore((s) => s.setSelectedObject);
  const confidenceThreshold = useViewerStore((s) => s.confidenceThreshold);
  const setConfidenceThreshold = useViewerStore((s) => s.setConfidenceThreshold);
  const visibleClasses = useViewerStore((s) => s.visibleClasses);
  const toggleClass = useViewerStore((s) => s.toggleClass);
  const resetFilters = useViewerStore((s) => s.resetFilters);

  useEffect(() => {
    const ac = new AbortController();
    fetch('/sample-data/sample.json', { signal: ac.signal })
      .then((r) => r.json())
      .then((raw) => setFrames(parseCoco(raw)))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(String(err));
      });
    return () => ac.abort();
  }, []);

  // Eager enrich: 10 frames × ~5 detections × ~80 points is trivial memory.
  // Enriching once also pins the point-cloud RNG output per frame so revisits
  // show a stable distribution. See Step 8 plan, decision #2.
  const enrichedFrames = useMemo(
    () => (frames ? frames.map((f) => enrichFrame(f)) : null),
    [frames],
  );

  // Auto-select frames[0] when no valid frame is selected. Edge_#3 Case 3 (a):
  // the timeline policy is "always exactly one frame selected" — there is no
  // null path. Also self-heals if selectedFrameId points to an id that no
  // longer exists in the current data (dev hot-reload, dataset swap), which
  // would otherwise leave the page stuck on the "Selecting frame…" placeholder.
  useEffect(() => {
    if (!enrichedFrames || enrichedFrames.length === 0) return;
    const exists =
      selectedFrameId !== null &&
      enrichedFrames.some((f) => f.id === selectedFrameId);
    if (!exists) {
      setSelectedFrame(enrichedFrames[0].id);
    }
  }, [enrichedFrames, selectedFrameId, setSelectedFrame]);

  const currentFrame = useMemo(() => {
    if (!enrichedFrames) return null;
    return enrichedFrames.find((f) => f.id === selectedFrameId) ?? null;
  }, [enrichedFrames, selectedFrameId]);

  // Class chips must stay reachable across frames even if the active frame
  // doesn't contain the class. Edge_#7.md Case 1 Option A.
  const allClasses = useMemo(() => {
    if (!enrichedFrames) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const frame of enrichedFrames) {
      for (const d of frame.detections2D) {
        if (!seen.has(d.class)) {
          seen.add(d.class);
          out.push(d.class);
        }
      }
    }
    return out;
  }, [enrichedFrames]);

  const frameIndex = useMemo(() => {
    if (!enrichedFrames || !currentFrame) return 0;
    return enrichedFrames.findIndex((f) => f.id === currentFrame.id) + 1;
  }, [enrichedFrames, currentFrame]);

  const visibleIds = useMemo(
    () =>
      currentFrame
        ? selectVisibleDetectionIds(currentFrame, confidenceThreshold, visibleClasses)
        : new Set<string>(),
    [currentFrame, confidenceThreshold, visibleClasses],
  );

  // Frame switch clears the object selection so a stale id from frame N
  // cannot ghost-highlight in frame M (or accidentally re-highlight if
  // M happens to share the id). Edge_#5.md Case 6. Kept in page.tsx
  // (not in the store) so store actions stay single-purpose.
  const handleSelectFrame = useCallback(
    (id: string) => {
      if (id === selectedFrameId) return;
      setSelectedFrame(id);
      setSelectedObject(null);
    },
    [selectedFrameId, setSelectedFrame, setSelectedObject],
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

  if (!enrichedFrames) {
    return (
      <main className="p-4 max-w-screen-xl mx-auto flex flex-col gap-4">
        <div className="h-12 rounded-lg bg-zinc-900 animate-pulse" />
        <div className="h-14 rounded-lg bg-zinc-900 animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_280px] gap-4">
          <div className="aspect-[4/3] rounded-lg bg-zinc-900 animate-pulse" />
          <div className="aspect-[4/3] rounded-lg bg-zinc-900 animate-pulse" />
          <div className="rounded-lg bg-zinc-900 animate-pulse h-64 md:h-auto" />
        </div>
        <div className="h-28 rounded-lg bg-zinc-900 animate-pulse" />
      </main>
    );
  }

  if (enrichedFrames.length === 0)
    return <main className="p-4 text-zinc-400">No frames.</main>;
  // selectedFrameId is null for one render between enrichedFrames arriving
  // and the auto-select effect firing; render a placeholder rather than crash.
  if (!currentFrame) return <main className="p-4 text-zinc-400">Selecting frame…</main>;

  // Layout: change grid-cols classes here to switch column arrangement.
  // e.g. "md:grid-cols-2" (2D+3D only), "md:grid-cols-[280px_1fr_1fr]" (list left)
  return (
    <main className="p-4 max-w-screen-xl mx-auto flex flex-col gap-4">
      <Header
        frameIndex={frameIndex}
        frameCount={enrichedFrames.length}
        detectionCount={currentFrame.detections2D.length}
      />
      <Filters
        classes={allClasses}
        confidenceThreshold={confidenceThreshold}
        visibleClasses={visibleClasses}
        visibleCount={visibleIds.size}
        totalCount={currentFrame.detections2D.length}
        onChangeThreshold={setConfidenceThreshold}
        onToggleClass={toggleClass}
        onReset={resetFilters}
        onDeselect={() => setSelectedObject(null)}
      />
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_280px] gap-4">
        <Viewer2D
          frame={currentFrame}
          selectedId={selectedObjectId}
          onSelect={setSelectedObject}
          visibleIds={visibleIds}
        />
        {/* key forces full Canvas remount on frame change so the OrbitControls
            camera resets cleanly. Edge_#4.md Case 6 (remount option). */}
        <Viewer3D
          key={currentFrame.id}
          frame={currentFrame}
          selectedId={selectedObjectId}
          onSelect={setSelectedObject}
          visibleIds={visibleIds}
        />
        <ObjectList
          frame={currentFrame}
          selectedId={selectedObjectId}
          onSelect={setSelectedObject}
          visibleIds={visibleIds}
        />
      </div>
      <Timeline
        frames={enrichedFrames}
        selectedFrameId={selectedFrameId}
        onSelectFrame={handleSelectFrame}
      />
    </main>
  );
}
