'use client';

import { ConfidenceSlider } from './ConfidenceSlider';
import { ClassToggles } from './ClassToggles';

type Props = {
  // Class names available for toggling. Caller (page.tsx) computes this as the
  // union across all frames so that a class toggled-on in frame N stays
  // reachable when navigating to frame M that lacks it. See Edge_#7.md Case 1.
  classes: string[];
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
  classes,
  confidenceThreshold,
  visibleClasses,
  onChangeThreshold,
  onToggleClass,
}: Props) {
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
