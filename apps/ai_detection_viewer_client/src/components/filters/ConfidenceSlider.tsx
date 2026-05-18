'use client';

type Props = {
  value: number;
  onChange: (v: number) => void;
};

const STEP = 0.01;

export function ConfidenceSlider({ value, onChange }: Props) {
  return (
    <label className="flex items-center gap-3 text-sm text-gray-300 select-none">
      <span className="font-semibold uppercase tracking-wide text-xs text-gray-400">
        Confidence
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={STEP}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-40 accent-sky-400 cursor-pointer"
      />
      <span className="tabular-nums text-gray-100 w-10 text-right">
        {value.toFixed(2)}
      </span>
    </label>
  );
}
