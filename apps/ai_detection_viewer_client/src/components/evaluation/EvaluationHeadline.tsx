'use client';

import { formatPercent, type EvalSummary } from '@/lib/evaluation';

type Props = {
  /** `null` while there is nothing to show yet; `status` then says why. */
  summary: EvalSummary | null;
  status: 'ready' | 'loading' | 'failed';
  modelName?: string;
  /** Everything the two numbers depend on, for the tooltip. */
  basis?: string;
};

/**
 * Evaluate mode's content for the right of the top bar (F5): which model, and
 * its overall Precision / Recall. It takes the place of the review progress;
 * the breakdown and the conditions are in the Evaluation panel.
 */
export function EvaluationHeadline({ summary, status, modelName, basis }: Props) {
  if (status === 'loading') {
    return <span className="text-xs text-zinc-500">Loading predictions…</span>;
  }
  if (status === 'failed' || !summary) {
    return (
      <span
        role="status"
        className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/40"
      >
        Predictions unavailable
      </span>
    );
  }
  return (
    <div className="flex items-center gap-3 text-xs text-zinc-400 tabular-nums" title={basis}>
      {modelName && (
        <span className="rounded px-1.5 py-0.5 text-[11px] text-zinc-300 ring-1 ring-inset ring-zinc-700">
          {modelName}
        </span>
      )}
      <span>
        Precision{' '}
        <span className="font-semibold text-zinc-100">{formatPercent(summary.precision)}</span>
      </span>
      <span>
        Recall <span className="font-semibold text-zinc-100">{formatPercent(summary.recall)}</span>
      </span>
    </div>
  );
}
