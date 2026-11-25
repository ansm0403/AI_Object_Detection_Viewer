'use client';

import { BUCKET_COUNT } from '@/lib/selectors';
import { SECTION_TITLE_CLASS } from '@/components/workspace';

type Props = {
  // Must be length BUCKET_COUNT — guaranteed by `selectConfidenceBuckets`.
  buckets: number[];
  // Current confidence threshold from the store (0..1). Drawn as a vertical
  // guide line so the user can read the slider position against the
  // underlying distribution.
  threshold: number;
};

// SVG coordinate space for the BARS only. The <svg> is stretched to the panel
// width at a fixed pixel height (preserveAspectRatio="none"), so bars keep
// their proportions while the chart never reflows. Text is NOT drawn inside the
// SVG: a stretched viewBox scales text with the panel (a 200-unit-wide viewBox
// in a 700px panel turned 8-unit labels into ~28px text). Tick labels are HTML
// below the chart instead, so they stay at the surrounding text size. (F3)
const W = 200;
const H = 48;
const PAD_X = 0;
const PAD_TOP = 4;
const PAD_BOTTOM = 1; // room for the baseline
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
      <h3 className={`${SECTION_TITLE_CLASS} mb-2`}>Confidence</h3>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-12 overflow-visible"
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
          vectorEffect="non-scaling-stroke"
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
          // Keep a crisp 1px dashed line even though the x axis is stretched.
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* Tick labels as HTML so they stay 10px at any panel width. */}
      <div className="mt-1 flex justify-between text-[10px] text-zinc-500 tabular-nums">
        <span>0</span>
        <span>0.5</span>
        <span>1</span>
      </div>
      <p className="mt-1 text-[10px] text-zinc-500 tabular-nums">
        threshold {threshold.toFixed(2)}
      </p>
    </section>
  );
}
