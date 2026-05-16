'use client';

import { useEffect, useState } from 'react';
import { parseCoco } from '@/lib/coco';
import { Viewer2D } from '@/components/viewer-2d';
import type { Frame } from '@/lib/types';

export default function Index() {
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/sample-data/sample.json')
      .then((r) => r.json())
      .then((raw) => setFrames(parseCoco(raw)))
      .catch((err) => setError(String(err)));
  }, []);

  if (error) return <main className="p-4 text-red-500">Failed to load: {error}</main>;
  if (!frames) return <main className="p-4 text-gray-400">Loading…</main>;
  if (frames.length === 0) return <main className="p-4 text-gray-400">No frames.</main>;

  return (
    <main className="p-4 max-w-3xl mx-auto">
      <Viewer2D
        frame={frames[0]}
        onSelect={(id) => console.log('[Step 2] selected:', id)}
      />
    </main>
  );
}
