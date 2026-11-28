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
  /**
   * (F8) Boxes of the scene on screen that carry an edit. Shown from 1440px
   * and always in the tooltip. 0 / absent → nothing is shown.
   */
  edited?: number;
  /**
   * The other half of the top bar is wider than usual: the practice badge
   * ("Practice · labels modified") takes about 92px more than "Measured". Some
   * of the counts then appear later, so the bar still fits on one line.
   */
  tight?: boolean;
};

/**
 * Overall review progress for the top bar (F4): reviewed / total across every
 * frame, a thin bar split by verdict, and the counts that need attention.
 * Pure presentation — the numbers come from `summarizeProgress`.
 */
export function ReviewProgress({ counts, notSaved = false, edited = 0, tight = false }: Props) {
  const pct = (n: number) => (counts.total > 0 ? (n / counts.total) * 100 : 0);
  // A sliver stays visible even at 1 of 583.
  const width = (n: number) => (n > 0 ? `${Math.max(pct(n), 1.5)}%` : '0%');
  // The top bar must stay on ONE line (it sits right above the filter bar),
  // so what is shown depends on the window width AND on what else is in the
  // bar. Measured on the running app over 18 widths (1024–1536px):
  //  - the two counts fit from 1280px; with the "Not saved" note from 1400px
  //    (the bar wrapped at 1280–1320px);
  //  - the "N edited" count fits from 1440px;
  //  - with the practice badge (`tight`; the Header then also holds the app
  //    name back until 1400px): the counts with "Not saved" from 1536px, and
  //    "N edited" from 1536px.
  // Whatever is not shown is in the tooltip.
  const countsFrom = !notSaved
    ? 'xl:inline'
    : tight
      ? 'min-[1536px]:inline'
      : 'min-[1400px]:inline';
  const editedFrom = tight ? 'min-[1536px]:inline' : 'min-[1440px]:inline';

  return (
    <div
      className="flex items-center gap-2 text-xs text-zinc-400 tabular-nums"
      // The two counts below are hidden under 1280px (the top bar must stay on
      // one line); the tooltip keeps them reachable there.
      title={`Reviewed boxes across all frames — ${counts.approved} approved, ${counts.rejected} rejected, ${counts.unsure} unsure${edited > 0 ? ` · ${edited} box${edited === 1 ? '' : 'es'} edited in this scene` : ''}`}
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
      <span className={`hidden ${countsFrom} ${counts.rejected > 0 ? 'text-rose-300' : 'text-zinc-600'}`}>
        {counts.rejected} rejected
      </span>
      <span className={`hidden ${countsFrom} ${counts.unsure > 0 ? 'text-zinc-300' : 'text-zinc-600'}`}>
        {counts.unsure} unsure
      </span>
      {edited > 0 && (
        <span data-part="edited-count" className={`hidden ${editedFrom} text-amber-300`}>
          {edited} edited
        </span>
      )}
      {notSaved && (
        <span
          role="status"
          title="This browser is not storing the reviews and box edits (storage is blocked or full). They will be lost when the page is reloaded — export them to keep a copy."
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/40"
        >
          Not saved
        </span>
      )}
    </div>
  );
}
