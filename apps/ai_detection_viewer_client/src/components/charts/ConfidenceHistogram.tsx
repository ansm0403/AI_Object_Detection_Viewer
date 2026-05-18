'use client';

import { BUCKET_COUNT } from '@/lib/selectors';

type Props = {
  // Must be length BUCKET_COUNT — guaranteed by `selectConfidenceBuckets`.
  buckets: number[];
  // Current confidence threshold from the store (0..1). Drawn as a vertical
  // guide line so the user can read the slider position against the
  // underlying distribution.
  threshold: number;
};

// SVG coordinate space. Width is logical (the <svg> stretches to its parent
// via `w-full`); the px values just give bars and the threshold line a stable
// proportion. Height stays fixed so the chart never reflows under the panel.
const W = 200;
const H = 60;
const PAD_X = 4;
const PAD_TOP = 6;
const PAD_BOTTOM = 12; // leaves room for the 0 / 0.5 / 1 tick labels
const PLOT_W = W - PAD_X * 2;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;
const BAR_GAP = 2;
const BAR_W = (PLOT_W - BAR_GAP * (BUCKET_COUNT - 1)) / BUCKET_COUNT;

export function ConfidenceHistogram({ buckets, threshold }: Props) {
  // Use `1` as the floor so all-zero frames render flat bars instead of NaN.
  const maxCount = Math.max(1, ...buckets);
  const thresholdX = PAD_X + threshold * PLOT_W;

  return (
    <section className="px-3 py-3 border-t border-zinc-800">
      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
        Confidence
      </h3>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label="Confidence distribution histogram"
      >
        {/* Baseline */}
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={H - PAD_BOTTOM}
          y2={H - PAD_BOTTOM}
          stroke="#27272a"
          strokeWidth={1}
        />
        {/* Bars. Below-threshold buckets fade to make the threshold line meaningful. */}
        {buckets.map((count, i) => {
          const x = PAD_X + i * (BAR_W + BAR_GAP);
          const h = (count / maxCount) * PLOT_H;
          const y = H - PAD_BOTTOM - h;
          const bucketUpper = (i + 1) / BUCKET_COUNT;
          // A bucket is "above threshold" if its upper edge is at or past
          // the threshold — matches `confidence >= threshold` filter semantics.
          const active = bucketUpper > threshold;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={BAR_W}
              height={h}
              fill={active ? '#38bdf8' : '#3f3f46'}
              opacity={active ? 0.7 : 1}
            />
          );
        })}
        {/* Threshold guide line */}
        <line
          x1={thresholdX}
          x2={thresholdX}
          y1={PAD_TOP}
          y2={H - PAD_BOTTOM}
          stroke="#f4f4f5"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
        {/* Tick labels */}
        <text
          x={PAD_X}
          y={H - 2}
          fill="#71717a"
          fontSize={8}
          textAnchor="start"
        >
          0
        </text>
        <text x={W / 2} y={H - 2} fill="#71717a" fontSize={8} textAnchor="middle">
          0.5
        </text>
        <text
          x={W - PAD_X}
          y={H - 2}
          fill="#71717a"
          fontSize={8}
          textAnchor="end"
        >
          1
        </text>
      </svg>
      <p className="mt-1 text-[10px] text-zinc-500 tabular-nums">
        threshold {threshold.toFixed(2)}
      </p>
    </section>
  );
}
