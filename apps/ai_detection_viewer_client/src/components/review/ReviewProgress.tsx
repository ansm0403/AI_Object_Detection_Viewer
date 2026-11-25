'use client';

import type { ReviewCounts } from '@/lib/review';

/**
 * Overall review progress for the top bar (F4): reviewed / total across every
 * frame, a thin bar split by verdict, and the counts that need attention.
 * Pure presentation — the numbers come from `summarizeProgress`.
 */
export function ReviewProgress({ counts }: { counts: ReviewCounts }) {
  const pct = (n: number) => (counts.total > 0 ? (n / counts.total) * 100 : 0);
  // A sliver stays visible even at 1 of 583.
  const width = (n: number) => (n > 0 ? `${Math.max(pct(n), 1.5)}%` : '0%');

  return (
    <div
      className="flex items-center gap-2 text-xs text-zinc-400 tabular-nums"
      title="Reviewed boxes across all frames"
    >
      <span>
        Reviewed <span className="font-semibold text-zinc-100">{counts.reviewed}</span> /{' '}
        {counts.total}
      </span>
      <span
        role="progressbar"
        aria-label="Review progress"
        aria-valuemin={0}
        aria-valuemax={counts.total}
        aria-valuenow={counts.reviewed}
        className="flex w-20 h-1 rounded-full bg-zinc-800 overflow-hidden"
      >
        <span className="bg-emerald-400" style={{ width: width(counts.approved) }} />
        <span className="bg-zinc-400" style={{ width: width(counts.unsure) }} />
        <span className="bg-rose-400" style={{ width: width(counts.rejected) }} />
      </span>
      <span className={counts.rejected > 0 ? 'text-rose-300' : 'text-zinc-600'}>
        {counts.rejected} rejected
      </span>
      <span className={counts.unsure > 0 ? 'text-zinc-300' : 'text-zinc-600'}>
        {counts.unsure} unsure
      </span>
    </div>
  );
}
