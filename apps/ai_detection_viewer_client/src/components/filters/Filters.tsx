'use client';

import { ConfidenceSlider } from './ConfidenceSlider';
import { DistanceSlider } from './DistanceSlider';
import { ClassToggles } from './ClassToggles';
import { DISTANCE_MAX } from '@/lib/ui/distance';

type Props = {
  // Class names available for toggling. Caller (page.tsx) computes this as the
  // union across all frames so that a class toggled-on in frame N stays
  // reachable when navigating to frame M that lacks it. See Edge_#7.md Case 1.
  classes: string[];
  confidenceThreshold: number;
  visibleClasses: Set<string>;
  visibleCount: number;
  totalCount: number;
  // (F2-A) Which metric filter to surface. COCO frames have real confidence
  // scores but estimated depth → show the confidence slider. nuScenes frames
  // have measured metres but a constant 1.0 confidence → show the distance
  // slider instead. Exactly one is shown; we never present a metre filter over
  // estimated depth (Immutable Rule #6).
  filterMode: 'confidence' | 'distance';
  maxDistance: number;
  onChangeThreshold: (v: number) => void;
  onChangeDistance: (v: number) => void;
  onToggleClass: (className: string) => void;
  onReset: () => void;
  onDeselect?: () => void;
};

export function Filters({
  classes,
  confidenceThreshold,
  visibleClasses,
  visibleCount,
  totalCount,
  filterMode,
  maxDistance,
  onChangeThreshold,
  onChangeDistance,
  onToggleClass,
  onReset,
  onDeselect,
}: Props) {
  // The active metric filter is "default" only when its own control is at rest:
  // confidence at 0, or distance at its max ("All"). The inactive metric is
  // ignored so toggling datasets doesn't leave Reset spuriously enabled.
  const metricIsDefault =
    filterMode === 'confidence'
      ? confidenceThreshold === 0
      : maxDistance >= DISTANCE_MAX;
  const isDefault = metricIsDefault && visibleClasses.size === 0;

  return (
    <div
      className="flex items-center justify-between flex-wrap gap-x-6 gap-y-3 bg-zinc-900 rounded-lg px-4 py-3"
      onClick={onDeselect}
    >
      <div onClick={(e) => e.stopPropagation()}>
        {filterMode === 'distance' ? (
          <DistanceSlider value={maxDistance} onChange={onChangeDistance} />
        ) : (
          <ConfidenceSlider value={confidenceThreshold} onChange={onChangeThreshold} />
        )}
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <ClassToggles
          classes={classes}
          visibleClasses={visibleClasses}
          onToggle={onToggleClass}
        />
      </div>
      <div
        className="flex items-center gap-3 ml-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs text-zinc-400 tabular-nums">
          {visibleCount}/{totalCount} visible
        </span>
        <button
          type="button"
          onClick={onReset}
          disabled={isDefault}
          className="text-xs px-2 py-1 rounded border border-zinc-800 text-zinc-400 hover:border-sky-400/40 hover:text-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
