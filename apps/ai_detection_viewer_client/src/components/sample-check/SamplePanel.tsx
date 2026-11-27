'use client';

import type { MouseEvent } from 'react';
import type { UnlabelledFalseAlarm } from '@/lib/evaluation';
import { cameraShortName } from '@/lib/cameras';
import {
  SAMPLE_VERDICTS,
  SAMPLE_VERDICT_HINT,
  SAMPLE_VERDICT_LABEL,
  SAMPLE_VERDICT_NAME,
  describeEstimate,
  describeProgress,
  type SampleSummary,
  type SampleVerdict,
} from '@/lib/sampling';
import { classLabel } from '@/lib/ui/class-label';
import { PANEL_CLASS, PanelHeader, SECTION_TITLE_CLASS } from '@/components/workspace';
import { SAMPLE_VERDICT_FILL, SAMPLE_VERDICT_TEXT } from './icons';

type Props = {
  /** `ready` = the sample exists. Otherwise `message` says what is missing. */
  status: 'loading' | 'ready' | 'unavailable';
  message?: string;
  /** The sampled box on screen; `null` when the selection is not one of the sample. */
  item: UnlabelledFalseAlarm | null;
  /** 1-based position of `item` in the sample. */
  position: number | null;
  verdict: SampleVerdict | null;
  summary: SampleSummary | null;
  /**
   * The camera whose photo is on screen. When it is not the box's camera the
   * panel says so and offers the way back — the box stays selected meanwhile.
   */
  viewingCamera?: string | null;
  onShowBox?: () => void;
  onVerdict: (verdict: SampleVerdict) => void;
  onClear: () => void;
  /** Why a verdict cannot be given right now (e.g. the sequence is playing). */
  blocked?: string;
  /** Saving to the browser is failing: verdicts will not survive a reload. */
  storageFailed?: boolean;
  /** Keys shown on the buttons, in `SAMPLE_VERDICTS` order, then "clear". */
  keys: { verdicts: readonly [string, string, string]; clear: string; step: string };
};

// A verdict moves the selection to the next box; a button that kept the focus
// would fire again on Space / Enter there. Blur after a MOUSE click only
// (keyboard users keep their place) — the same rule as the F4 review buttons.
const blurAfterMouse = (event: MouseEvent<HTMLButtonElement>) => {
  if (event.detail > 0) event.currentTarget.blur();
};

function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-[3px] border border-current font-mono text-[10px] font-semibold leading-none opacity-70">
      {children}
    </kbd>
  );
}

/**
 * (F7.5) The details slot during the sample check: the facts about the model
 * box on screen, the three verdict buttons, and what the verdicts so far say
 * about the whole set — always as "N of M" with a range, never as a count of
 * the whole set (Immutable Rule #6).
 *
 * Pure presentation: counts, estimate and wording come from `lib/sampling`.
 */
export function SamplePanel({
  status,
  message,
  item,
  position,
  verdict,
  summary,
  viewingCamera,
  onShowBox,
  onVerdict,
  onClear,
  blocked,
  storageFailed = false,
  keys,
}: Props) {
  const canJudge = status === 'ready' && item !== null && !blocked;
  // Looking at the box's frame through another camera (for context).
  const elsewhere =
    item !== null && viewingCamera !== undefined && viewingCamera !== null && viewingCamera !== item.camera;
  return (
    <aside className={`flex flex-col h-full ${PANEL_CLASS}`}>
      <PanelHeader title="Sample check">
        {item && position !== null && summary && (
          <span className="text-[11px] text-zinc-500 tabular-nums truncate" title={`${item.scene} · frame ${item.frameIndex + 1} · ${item.camera}`}>
            box {position} of {summary.size} · {item.scene} · frame {item.frameIndex + 1} ·{' '}
            {cameraShortName(item.camera)}
          </span>
        )}
      </PanelHeader>

      {status !== 'ready' ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
          <p className={`text-sm ${status === 'loading' ? 'text-zinc-400' : 'text-amber-300'}`}>
            {status === 'loading' ? 'Preparing the sample…' : 'The sample cannot be drawn'}
          </p>
          {message && <p className="text-xs text-zinc-500">{message}</p>}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <section className="px-3 pt-2 pb-2 border-b border-zinc-800">
            {item ? (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 text-xs text-zinc-200 tabular-nums truncate">
                    The model says{' '}
                    <span className="font-semibold text-zinc-100">{classLabel(item.class)}</span>, score{' '}
                    {item.score.toFixed(2)}
                    {item.bbox && (
                      <span className="text-zinc-500">
                        {' '}
                        · {Math.round(item.bbox.width)}×{Math.round(item.bbox.height)} px
                      </span>
                    )}
                  </p>
                  {verdict && (
                    <button
                      type="button"
                      disabled={!canJudge}
                      title="Back to “not judged”"
                      onClick={(event) => {
                        blurAfterMouse(event);
                        onClear();
                      }}
                      className="shrink-0 inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-200 disabled:opacity-40"
                    >
                      <Key>{keys.clear}</Key> clear
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-400" aria-live="polite">
                  {blocked ? (
                    <span className="text-amber-300/90">{blocked}</span>
                  ) : elsewhere ? (
                    <span className="text-amber-300/90">
                      Showing {cameraShortName(viewingCamera ?? '')} — the box is in the{' '}
                      {cameraShortName(item.camera)} photo.{' '}
                      <button
                        type="button"
                        onClick={onShowBox}
                        className="rounded px-1 text-sky-200 ring-1 ring-inset ring-sky-400/40 hover:bg-sky-500/10"
                      >
                        Show the box
                      </button>
                    </span>
                  ) : verdict ? (
                    <>
                      Judged: <span className="text-zinc-200">{SAMPLE_VERDICT_NAME[verdict]}</span>
                    </>
                  ) : (
                    'No label of any class is under this box. Is the object really there?'
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-zinc-400">No sampled box is selected.</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  Pick a row in the list, or press {keys.step} for the next box without a verdict.
                </p>
              </>
            )}
            <div className="mt-2 flex gap-1.5" role="group" aria-label="Verdict">
              {SAMPLE_VERDICTS.map((option, index) => {
                const active = verdict === option;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={!canJudge}
                    aria-pressed={active}
                    title={SAMPLE_VERDICT_HINT[option]}
                    onClick={(event) => {
                      blurAfterMouse(event);
                      onVerdict(option);
                    }}
                    className={[
                      'flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 h-[30px] px-1.5 rounded-md text-xs whitespace-nowrap',
                      'ring-1 ring-inset transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                      SAMPLE_VERDICT_TEXT[option],
                      active ? 'bg-zinc-700 ring-zinc-400' : 'bg-zinc-800 ring-zinc-700 enabled:hover:ring-zinc-500',
                    ].join(' ')}
                  >
                    <Key>{keys.verdicts[index]}</Key>
                    <span>{SAMPLE_VERDICT_LABEL[option]}</span>
                  </button>
                );
              })}
            </div>
            {storageFailed && (
              <p className="mt-1 text-[11px] text-amber-300/90">
                Saving to this browser is failing — verdicts will be lost on reload. Export them.
              </p>
            )}
          </section>

          {summary && <Estimate summary={summary} />}
        </div>
      )}
    </aside>
  );
}

/** What the verdicts so far say about the whole population. */
function Estimate({ summary }: { summary: SampleSummary }) {
  const real = summary.estimates['real-object'];
  return (
    <section className="px-3 py-2" aria-label="Estimate">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className={SECTION_TITLE_CLASS}>{summary.complete ? 'Estimate' : 'Estimate so far'}</h3>
        <span className={`text-[11px] tabular-nums ${summary.complete ? 'text-zinc-400' : 'text-amber-300'}`}>
          {describeProgress(summary)}
        </span>
      </div>
      <div className="mt-1.5 flex h-1.5 rounded bg-zinc-800 overflow-hidden" aria-hidden="true">
        {summary.judged > 0 &&
          SAMPLE_VERDICTS.map((verdict) => (
            <span
              key={verdict}
              style={{
                width: `${(summary.counts[verdict] / summary.judged) * 100}%`,
                backgroundColor: SAMPLE_VERDICT_FILL[verdict],
              }}
            />
          ))}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-zinc-400">
        <span className="text-zinc-500">Real objects without a label:</span>{' '}
        <span className="text-zinc-200">{describeEstimate(real, summary.population)}</span>
        {real && '.'}
      </p>
      <p className="mt-1 text-[10px] leading-snug text-zinc-500">
        A sample estimate, not a count of all {summary.population.toLocaleString('en-US')} boxes. Per box: the
        same object is often boxed again in the next frame, so the true range is somewhat wider.
      </p>
      <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 tabular-nums">
        {SAMPLE_VERDICTS.map((verdict) => (
          <div key={verdict} className="inline-flex items-baseline gap-1">
            <dd className="font-semibold text-zinc-300">{summary.counts[verdict]}</dd>
            <dt>{SAMPLE_VERDICT_NAME[verdict].toLowerCase()}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}
