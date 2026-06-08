'use client';

import { DISTANCE_MAX, DISTANCE_STEP } from '@/lib/ui/distance';

type Props = {
  value: number;
  onChange: (v: number) => void;
};

// Distance filter (F2-A, nuScenes only). Mirrors ConfidenceSlider's shape but
// expresses real metres: "hide boxes farther than N m from the ego vehicle".
// At the max the filter is off (every box is within range). Shown in place of
// the confidence slider on measured frames, where confidence is a constant 1.0
// no-op and metres are the meaningful filter.
export function DistanceSlider({ value, onChange }: Props) {
  const atMax = value >= DISTANCE_MAX;
  return (
    <label className="flex items-center gap-3 text-sm text-zinc-300 select-none">
      <span className="font-semibold uppercase tracking-wide text-xs text-zinc-400">
        Distance
      </span>
      <input
        type="range"
        min={0}
        max={DISTANCE_MAX}
        step={DISTANCE_STEP}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-40 accent-sky-400 cursor-pointer"
      />
      <span className="tabular-nums text-zinc-100 w-12 text-right">
        {atMax ? 'All' : `${value}m`}
      </span>
    </label>
  );
}
