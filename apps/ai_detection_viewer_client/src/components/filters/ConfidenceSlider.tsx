'use client';

import { SECTION_TITLE_CLASS } from '@/components/workspace';

type Props = {
  value: number;
  onChange: (v: number) => void;
  // (F5) What the 0–1 threshold is called. COCO filters its own detections by
  // "Confidence"; evaluate mode uses the same control as the model's "Min score".
  label?: string;
  title?: string;
};

const STEP = 0.01;

export function ConfidenceSlider({ value, onChange, label = 'Confidence', title }: Props) {
  return (
    <label className="flex items-center gap-3 text-xs text-zinc-300 select-none" title={title}>
      <span className={SECTION_TITLE_CLASS}>
        {label}
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
