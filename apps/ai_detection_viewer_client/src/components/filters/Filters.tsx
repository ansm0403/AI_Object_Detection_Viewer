'use client';

import type { ReactNode } from 'react';
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
  // (F5) Evaluate mode reuses the confidence slider as the model's minimum
  // score: another name, and a resting value that is not 0. All three default
  // to the plain confidence filter, so the COCO bar is unchanged.
  thresholdLabel?: string;
  thresholdTitle?: string;
  /** The threshold's resting value — what Reset returns to and compares with. */
  defaultThreshold?: number;
  /** (F5) What the count on the right counts: "40/40 visible" (default) or "26/26 results". */
  countNoun?: string;
  maxDistance: number;
  onChangeThreshold: (v: number) => void;
  onChangeDistance: (v: number) => void;
  onToggleClass: (className: string) => void;
  onReset: () => void;
  onDeselect?: () => void;
  /** (F7.5) Extra controls placed before the count on the right (the bar knows nothing about them). */
  extra?: ReactNode;
};

export function Filters({
  classes,
  confidenceThreshold,
  visibleClasses,
  visibleCount,
  totalCount,
  filterMode,
  thresholdLabel,
  thresholdTitle,
  defaultThreshold = 0,
  countNoun = 'visible',
  maxDistance,
  onChangeThreshold,
  onChangeDistance,
  onToggleClass,
  onReset,
  onDeselect,
  extra,
}: Props) {
  // The active metric filter is "default" only when its own control is at rest:
  // confidence at 0, or distance at its max ("All"). The inactive metric is
  // ignored so toggling datasets doesn't leave Reset spuriously enabled.
  const metricIsDefault =
    filterMode === 'confidence'
      ? confidenceThreshold === defaultThreshold
      : maxDistance >= DISTANCE_MAX;
  const isDefault = metricIsDefault && visibleClasses.size === 0;

  return (
    // (F3) A flush bar under the header. Wide screens keep it on one line (the
    // class chips scroll sideways if they ever overflow); narrow screens wrap.
    <div
      className="flex items-center flex-wrap lg:flex-nowrap gap-x-4 gap-y-2 h-full bg-zinc-900/60 border-b border-zinc-800 px-4 py-1.5"
      onClick={onDeselect}
    >
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        {filterMode === 'distance' ? (
          <DistanceSlider value={maxDistance} onChange={onChangeDistance} />
        ) : (
          <ConfidenceSlider
            value={confidenceThreshold}
            onChange={onChangeThreshold}
            label={thresholdLabel}
            title={thresholdTitle}
          />
        )}
      </div>
      <span aria-hidden="true" className="hidden lg:block w-px h-5 bg-zinc-800 shrink-0" />
      <div className="min-w-0 lg:overflow-x-auto" onClick={(e) => e.stopPropagation()}>
        <ClassToggles
          classes={classes}
          visibleClasses={visibleClasses}
          onToggle={onToggleClass}
        />
      </div>
      <div
        className="flex items-center gap-3 ml-auto shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {extra}
        <span className="text-xs text-zinc-400 tabular-nums">
          {visibleCount}/{totalCount} {countNoun}
        </span>
        <button
          type="button"
          onClick={onReset}
          disabled={isDefault}
          className="text-xs px-2 py-0.5 rounded border border-zinc-800 text-zinc-400 hover:border-sky-400/40 hover:text-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
