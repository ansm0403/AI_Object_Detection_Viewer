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
  visibleCount: number;
  totalCount: number;
  onChangeThreshold: (v: number) => void;
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
  onChangeThreshold,
  onToggleClass,
  onReset,
  onDeselect,
}: Props) {
  const isDefault = confidenceThreshold === 0 && visibleClasses.size === 0;

  return (
    <div
      className="flex items-center justify-between flex-wrap gap-x-6 gap-y-3 bg-zinc-900 rounded-lg px-4 py-3"
      onClick={onDeselect}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <ConfidenceSlider value={confidenceThreshold} onChange={onChangeThreshold} />
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
