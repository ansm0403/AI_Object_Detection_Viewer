'use client';

import { useEffect, useMemo, useState } from 'react';
import { parseCoco } from '@/lib/coco';
import { enrichFrame } from '@/lib/geometry';
import { Viewer2D } from '@/components/viewer-2d';
import { Viewer3D } from '@/components/viewer-3d';
import { useViewerStore } from '@/store';
import type { Frame } from '@/lib/types';

export default function Index() {
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedObjectId = useViewerStore((s) => s.selectedObjectId);
  const setSelectedObject = useViewerStore((s) => s.setSelectedObject);

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

  if (error) return <main className="p-4 text-red-500">Failed to load: {error}</main>;
  if (!frames) return <main className="p-4 text-gray-400">Loading…</main>;
  if (frames.length === 0 || !currentFrame)
    return <main className="p-4 text-gray-400">No frames.</main>;

  return (
    <main className="p-4 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
      <Viewer2D
        frame={currentFrame}
        selectedId={selectedObjectId}
        onSelect={setSelectedObject}
      />
      <Viewer3D
        frame={currentFrame}
        selectedId={selectedObjectId}
        onSelect={setSelectedObject}
      />
    </main>
  );
}
