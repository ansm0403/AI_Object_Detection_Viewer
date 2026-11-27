'use client';

import { useEffect, useRef } from 'react';
import {
  describeModelConditions,
  ratio,
  type DistanceComparison,
  type DriveScore,
  type EvaluationRules,
  type PredictionModelInfo,
  type ScenesEvaluation,
} from '@/lib/evaluation';
import { describeEstimate, describeProgress, type SampleSummary } from '@/lib/sampling';
import { PANEL_CLASS, SECTION_TITLE_CLASS } from '@/components/workspace';
import { DayNightByDistance } from './DayNightByDistance';
import { DriveTable } from './DriveTable';

const number = (n: number) => n.toLocaleString('en-US');
const pct1 = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`);

/** The false alarms with no label nearby, at the sample check's FIXED rules. */
export type UnlabelledFacts = {
  status: 'loading' | 'ready' | 'unavailable';
  /** Why it is loading / unavailable. */
  message?: string;
  /** How many there are, and out of how many false alarms (both at the fixed rules). */
  count: number | null;
  falseAlarms: number | null;
  /** The fixed minimum score those two numbers were computed with. */
  minScore: number;
  iouThreshold: number;
  /** The sample check's verdicts so far; `null` until the sample exists. */
  summary: SampleSummary | null;
};

type Props = {
  /** Every scene's score at the rules in effect. */
  scenes: ScenesEvaluation;
  /** Scenes in the catalog (more than `scenes` covers while some are loading). */
  scenesTotal: number;
  /** The numbers are catching up with a rule change. */
  stale?: boolean;
  model?: PredictionModelInfo;
  rules: EvaluationRules;
  drives: readonly DriveScore[];
  comparison: DistanceComparison;
  unlabelled: UnlabelledFacts;
  onCheckSample: () => void;
  onClose: () => void;
};

/**
 * (F7.5) The evaluation report: everything a reader needs before quoting a
 * number, on one screen — the conditions first, then the totals, the drives
 * the totals rest on, day against night at the same distance, and the open
 * question of the false alarms that have no label nearby.
 *
 * It is laid over the list and the 3D view (which stays mounted underneath —
 * the canvas is not re-created) and closed with Esc. Pure presentation: every
 * number arrives computed by `lib/evaluation` and `lib/sampling`.
 */
export function EvaluationReport({
  scenes,
  scenesTotal,
  stale = false,
  model,
  rules,
  drives,
  comparison,
  unlabelled,
  onCheckSample,
  onClose,
}: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { total, day, night } = scenes;
  const labels = total.counts.found + total.counts.missed;
  const reported = total.counts.found + total.counts.falseAlarm;
  const pending = scenesTotal - scenes.scenes.length - scenes.notEvaluated.length;
  // The predictions file holds nothing below its own minimum score.
  const score = Math.max(rules.minScore, model?.minScore ?? 0);
  const conditions = [
    ...describeModelConditions(model),
    `score ≥ ${score.toFixed(2)}`,
    `IoU ≥ ${rules.iouThreshold}`,
  ];

  return (
    <div
      role="dialog"
      aria-label="Evaluation report"
      className={`flex flex-col h-full ${PANEL_CLASS} border-zinc-700 shadow-2xl shadow-black/60`}
    >
      {/* The title wraps on a narrow screen instead of being cut (Edge_F#7.5 Case 2). */}
      <div className="flex items-center justify-between gap-3 min-h-9 px-3.5 py-1.5 border-b border-zinc-800 shrink-0">
        <h2 className="min-w-0 flex flex-wrap items-baseline gap-x-2 text-xs font-semibold text-zinc-100">
          Evaluation report
          <span className="font-normal text-zinc-500">
            {pending > 0
              ? `${scenes.scenes.length} of ${scenesTotal} scenes loaded`
              : `all ${scenes.scenes.length} scenes`}{' '}
            · {number(total.frames)} frames · {number(total.photos)} photos
          </span>
        </h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="shrink-0 inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:text-zinc-100"
        >
          Close
          <kbd className="rounded-[3px] border border-current px-1 font-mono text-[10px] leading-4 opacity-70">Esc</kbd>
        </button>
      </div>

      {/* The conditions come before any number. */}
      <div
        aria-label="Measured with"
        className="shrink-0 flex flex-wrap items-center gap-1.5 px-3.5 py-2 border-b border-zinc-800"
      >
        <span className="mr-0.5 text-[11px] text-zinc-500">Measured with</span>
        {conditions.map((condition) => (
          <span
            key={condition}
            className="rounded-full px-2 py-px text-[11px] text-zinc-200 ring-1 ring-inset ring-zinc-700 whitespace-nowrap tabular-nums"
          >
            {condition}
          </span>
        ))}
        <span className="rounded-full px-2 py-px text-[11px] text-zinc-400 ring-1 ring-inset ring-zinc-700 whitespace-nowrap">
          labels = 3D boxes projected into the photo (approximate)
        </span>
      </div>

      <div
        className={`flex-1 min-h-0 overflow-y-auto transition-opacity ${stale ? 'opacity-60' : ''}`}
        aria-busy={stale}
      >
        {/* Three columns only where the drive table's rows fit (≥ 1536 px);
            two columns with the totals on top from 1280 px; one below that.
            The drive table gets the wider column: its rows hold more. */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] min-[1536px]:grid-cols-[17rem_minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 min-[1536px]:grid-cols-1 gap-x-6 gap-y-3 content-start p-3.5 xl:col-span-2 min-[1536px]:col-span-1 border-b min-[1536px]:border-b-0 min-[1536px]:border-r border-zinc-800">
            <section aria-label="Total">
              <h3 className={`${SECTION_TITLE_CLASS} mb-1.5`}>Total</h3>
              <dl className="grid grid-cols-[auto_auto_1fr] items-baseline gap-x-3 gap-y-1 tabular-nums">
                <dt className="text-xs text-zinc-400">Precision</dt>
                <dd className="text-xl font-semibold leading-6 text-zinc-100">{pct1(total.precision)}</dd>
                <dd className="text-[11px] text-zinc-500">
                  {number(total.counts.found)} of {number(reported)} model boxes matched a label
                </dd>
                <dt className="text-xs text-zinc-400">Recall</dt>
                <dd className="text-xl font-semibold leading-6 text-zinc-100">{pct1(total.recall)}</dd>
                <dd className="text-[11px] text-zinc-500">
                  {number(total.counts.found)} of {number(labels)} labels were found
                </dd>
              </dl>
              <p className="mt-2 text-[11px] leading-snug text-zinc-500">
                The {number(labels)} labels are{' '}
                <span className="text-zinc-300">{number(total.scoredObjects)} distinct objects</span> seen again and
                again (frames are 0.5 s apart), in{' '}
                <span className="text-zinc-300">
                  {total.drives} drive{total.drives === 1 ? '' : 's'}
                </span>
                . Observed on this data under these rules — not “the model’s performance”.
              </p>
              {pending > 0 && (
                <p className="mt-1 text-[11px] text-sky-200">
                  {pending} scene{pending === 1 ? ' is' : 's are'} not loaded (still on the way, or failed) — these
                  numbers do not cover {pending === 1 ? 'it' : 'them'}.
                </p>
              )}
              {scenes.notEvaluated.length > 0 && (
                <p className="mt-1 text-[11px] text-amber-300/90">
                  Not evaluated (no predictions): {scenes.notEvaluated.join(', ')}
                </p>
              )}
            </section>
            <FalseAlarms facts={unlabelled} onCheckSample={onCheckSample} />
          </div>
          <div className="p-3.5 border-b xl:border-b-0 xl:border-r border-zinc-800">
            <DriveTable drives={drives} day={day} night={night} />
          </div>
          <div className="p-3.5">
            <DayNightByDistance comparison={comparison} day={day} night={night} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The false alarms with no label nearby, and what is known about them: nothing
 * until a sample has been judged; afterwards the sample's estimate — worded by
 * `lib/sampling` so it can never read as a count of all of them.
 */
function FalseAlarms({ facts, onCheckSample }: { facts: UnlabelledFacts; onCheckSample: () => void }) {
  const { summary } = facts;
  const share = facts.count !== null && facts.falseAlarms !== null ? ratio(facts.count, facts.falseAlarms) : null;
  const started = summary !== null && summary.judged > 0;
  return (
    <section aria-label="False alarms with no label nearby">
      <h3 className={`${SECTION_TITLE_CLASS} mb-1.5`}>False alarms</h3>
      {facts.status !== 'ready' || facts.count === null ? (
        <p className={`text-[11px] ${facts.status === 'unavailable' ? 'text-amber-300/90' : 'text-zinc-500'}`}>
          {facts.message ?? 'Counting the false alarms with no label nearby…'}
        </p>
      ) : (
        <>
          <p className="text-xs leading-snug text-zinc-300 tabular-nums">
            <span className="font-semibold text-zinc-100">{number(facts.count)}</span>
            {facts.falseAlarms !== null && (
              <>
                {' '}
                of {number(facts.falseAlarms)}
                {share !== null && ` (${Math.round(share * 100)}%)`}
              </>
            )}{' '}
            have no label of any class nearby.
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-500 tabular-nums">
            Counted at score ≥ {facts.minScore.toFixed(2)}, IoU ≥ {facts.iouThreshold} — the sample check&apos;s
            fixed rules.
          </p>
          <div
            className={[
              'mt-2 rounded-md px-2.5 py-2 ring-1 ring-inset',
              started ? 'bg-zinc-800/50 ring-zinc-700' : 'bg-amber-400/[0.07] ring-amber-400/25',
            ].join(' ')}
          >
            {summary && started ? (
              <>
                <p className={`text-[11px] tabular-nums ${summary.complete ? 'text-zinc-300' : 'text-amber-300'}`}>
                  Sample check: {describeProgress(summary)}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
                  Real objects without a label:{' '}
                  <span className="text-zinc-200">
                    {describeEstimate(summary.estimates['real-object'], summary.population)}
                  </span>
                  . Model wrong: {summary.counts['model-wrong']}, unclear: {summary.counts.unclear}.
                </p>
                <p className="mt-1 text-[10px] leading-snug text-zinc-500">
                  A sample estimate, judged by one person. Precision still counts all of them as false alarms —
                  nothing was re-scored.
                </p>
              </>
            ) : (
              <>
                <p className="text-[11px] text-amber-300">Not checked yet</p>
                <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
                  Each is either a mistake of the model or a real object nuScenes did not label. Nobody has looked,
                  so precision may be understated by an unknown amount.
                </p>
              </>
            )}
            <button
              type="button"
              onClick={onCheckSample}
              className="mt-1.5 rounded px-2 py-0.5 text-xs text-sky-200 ring-1 ring-inset ring-sky-400/40 hover:bg-sky-500/10"
            >
              {summary && started
                ? summary.complete
                  ? 'Open the sample check →'
                  : 'Continue the sample check →'
                : `Check a sample of ${summary?.size ?? 100} →`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
