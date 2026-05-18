'use client';

import { useEffect, useMemo, useState } from 'react';
import { parseCoco } from '@/lib/coco';
import { enrichFrame } from '@/lib/geometry';
import { selectVisibleDetectionIds } from '@/lib/selectors';
import { Viewer2D } from '@/components/viewer-2d';
import { Viewer3D } from '@/components/viewer-3d';
import { ObjectList } from '@/components/object-list';
import { Filters } from '@/components/filters';
import { useViewerStore } from '@/store';
import type { Frame } from '@/lib/types';


export default function Index() {
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedObjectId = useViewerStore((s) => s.selectedObjectId);
  const setSelectedObject = useViewerStore((s) => s.setSelectedObject);
  const confidenceThreshold = useViewerStore((s) => s.confidenceThreshold);
  const setConfidenceThreshold = useViewerStore((s) => s.setConfidenceThreshold);
  const visibleClasses = useViewerStore((s) => s.visibleClasses);
  const toggleClass = useViewerStore((s) => s.toggleClass);

  useEffect(() => {
    fetch('/sample-data/sample.json')
      .then((r) => r.json())
      .then((raw) => setFrames(parseCoco(raw)))
      .catch((err) => setError(String(err)));
  }, []);

  const currentFrame = useMemo(
    () => (frames && frames[0] ? enrichFrame(frames[0]) : null),
    [frames],
  );

  const visibleIds = useMemo(
    () =>
      currentFrame
        ? selectVisibleDetectionIds(currentFrame, confidenceThreshold, visibleClasses)
        : new Set<string>(),
    [currentFrame, confidenceThreshold, visibleClasses],
  );

  if (error) return <main className="p-4 text-red-500">Failed to load: {error}</main>;
  if (!frames) return <main className="p-4 text-gray-400">Loading…</main>;
  if (frames.length === 0 || !currentFrame)
    return <main className="p-4 text-gray-400">No frames.</main>;

  // Layout: change grid-cols classes here to switch column arrangement.
  // e.g. "md:grid-cols-2" (2D+3D only), "md:grid-cols-[280px_1fr_1fr]" (list left)
  return (
    <main className="p-4 max-w-screen-xl mx-auto flex flex-col gap-4">
      <Filters
        frame={currentFrame}
        confidenceThreshold={confidenceThreshold}
        visibleClasses={visibleClasses}
        onChangeThreshold={setConfidenceThreshold}
        onToggleClass={toggleClass}
      />
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_280px] gap-4">
        <Viewer2D
          frame={currentFrame}
          selectedId={selectedObjectId}
          onSelect={setSelectedObject}
          visibleIds={visibleIds}
        />
        <Viewer3D
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
    </main>
  );
}
