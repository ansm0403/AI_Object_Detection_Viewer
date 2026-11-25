'use client';

import type { ReviewCounts } from '@/lib/review';

type Props = {
  counts: ReviewCounts;
  /**
   * True when the browser refused to store the reviews (storage blocked or
   * full). They still work for this visit but will be gone after a reload, so
   * the bar says so instead of letting the reviewer find out later.
   */
  notSaved?: boolean;
};

/**
 * Overall review progress for the top bar (F4): reviewed / total across every
 * frame, a thin bar split by verdict, and the counts that need attention.
 * Pure presentation — the numbers come from `summarizeProgress`.
 */
export function ReviewProgress({ counts, notSaved = false }: Props) {
  const pct = (n: number) => (counts.total > 0 ? (n / counts.total) * 100 : 0);
  // A sliver stays visible even at 1 of 583.
  const width = (n: number) => (n > 0 ? `${Math.max(pct(n), 1.5)}%` : '0%');

  return (
    <div
      className="flex items-center gap-2 text-xs text-zinc-400 tabular-nums"
      // The two counts below are hidden under 1280px (the top bar must stay on
      // one line); the tooltip keeps them reachable there.
      title={`Reviewed boxes across all frames — ${counts.approved} approved, ${counts.rejected} rejected, ${counts.unsure} unsure`}
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
      <span className={`hidden xl:inline ${counts.rejected > 0 ? 'text-rose-300' : 'text-zinc-600'}`}>
        {counts.rejected} rejected
      </span>
      <span className={`hidden xl:inline ${counts.unsure > 0 ? 'text-zinc-300' : 'text-zinc-600'}`}>
        {counts.unsure} unsure
      </span>
      {notSaved && (
        <span
          role="status"
          title="This browser is not storing the reviews (storage is blocked or full). They will be lost when the page is reloaded — export them to keep a copy."
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/40"
        >
          Not saved
        </span>
      )}
    </div>
  );
}
