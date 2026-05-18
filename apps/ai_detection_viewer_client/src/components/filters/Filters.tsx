'use client';

import { useMemo } from 'react';
import type { Frame } from '@/lib/types';
import { ConfidenceSlider } from './ConfidenceSlider';
import { ClassToggles } from './ClassToggles';

type Props = {
  frame: Frame;
  confidenceThreshold: number;
  visibleClasses: Set<string>;
  onChangeThreshold: (v: number) => void;
  onToggleClass: (className: string) => void;
};

/**
 * Filters bar. Controlled component — state lives in the Zustand store and
 * is passed in via props from `page.tsx`, matching the wire pattern used by
 * Viewer2D / Viewer3D / ObjectList.
 */
export function Filters({
  frame,
  confidenceThreshold,
  visibleClasses,
  onChangeThreshold,
  onToggleClass,
}: Props) {
  const classes = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const d of frame.detections2D) {
      if (!seen.has(d.class)) {
        seen.add(d.class);
        out.push(d.class);
      }
    }
    return out;
  }, [frame.detections2D]);

  return (
    <div className="flex items-center justify-between flex-wrap gap-x-6 gap-y-3 bg-gray-900 rounded-lg px-4 py-3">
      <ConfidenceSlider value={confidenceThreshold} onChange={onChangeThreshold} />
      <ClassToggles
        classes={classes}
        visibleClasses={visibleClasses}
        onToggle={onToggleClass}
      />
    </div>
  );
}
