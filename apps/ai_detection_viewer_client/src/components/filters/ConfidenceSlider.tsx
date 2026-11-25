'use client';

import { SECTION_TITLE_CLASS } from '@/components/workspace';

type Props = {
  value: number;
  onChange: (v: number) => void;
};

const STEP = 0.01;

export function ConfidenceSlider({ value, onChange }: Props) {
  return (
    <label className="flex items-center gap-3 text-xs text-zinc-300 select-none">
      <span className={SECTION_TITLE_CLASS}>
        Confidence
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={STEP}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-32 accent-sky-400 cursor-pointer"
      />
      <span className="tabular-nums text-zinc-100 w-10 text-right">
        {value.toFixed(2)}
      </span>
    </label>
  );
}
