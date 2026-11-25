'use client';

import type { ReactNode } from 'react';
import {
  EVAL_KINDS,
  OUTCOME_LABEL,
  countOf,
  formatPercent,
  ratio,
  type DatasetEvaluation,
  type EvaluationRules,
  type FrameEvaluation,
  type PredictionModelInfo,
} from '@/lib/evaluation';
import { getClassColor } from '@/lib/ui/class-colors';
import { PANEL_CLASS, PanelHeader, SECTION_TITLE_CLASS } from '@/components/workspace';
import { OutcomeIcon } from './icons';

type Props = {
  /** State of the predictions file. Anything but `ready` shows a message instead of numbers. */
  status: 'ready' | 'loading' | 'failed';
  error?: string | null;
  /** All frames. `null` unless `status` is `ready`. */
  evaluation: DatasetEvaluation | null;
  /** The current frame; `null` when the model was not run on it. */
  frameEvaluation: FrameEvaluation | null;
  /** 1-based position of the current frame. */
  frameIndex: number;
  /** How many 3D boxes the current frame has in total. */
  frameBoxCount: number;
  model?: PredictionModelInfo;
  camera?: string;
  /** The rules the numbers were computed with — always shown next to them. */
  rules: EvaluationRules;
  /** A block pinned above the scrolling area (the selected result). */
  pinned?: ReactNode;
};

/**
 * The details panel in evaluate mode (F5): how well the camera detector did
 * against the labels — overall, in this frame, by distance and by class.
 *
 * Pure presentation. Every number arrives computed by `lib/evaluation`; this
 * only lays them out. Two things are always on screen with the numbers, because
 * without them the numbers mislead (Immutable Rule #6):
 *  - what they were measured with (model, camera, score, IoU, how many frames);
 *  - that a label's 2D box is a projected 3D box, i.e. approximate.
 */
export function EvaluationPanel({
  status,
  error,
  evaluation,
  frameEvaluation,
  frameIndex,
  frameBoxCount,
  model,
  camera,
  rules,
  pinned,
}: Props) {
  // The file only holds predictions down to the score it was written with
  // (`model.minScore`). A slider setting below that cannot bring in anything
  // more, so the panel states the score that is ACTUALLY in effect rather than
  // echoing a threshold the data cannot honour (Edge_F#5 Case 2).
  const fileMinScore =
    model?.minScore !== undefined && rules.minScore < model.minScore ? model.minScore : null;
  const basis = [
    model?.name,
    camera,
    fileMinScore !== null
      ? `score ≥ ${fileMinScore.toFixed(2)} (file minimum)`
      : `score ≥ ${rules.minScore.toFixed(2)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <aside className={`flex flex-col h-full ${PANEL_CLASS}`}>
      <PanelHeader title="Evaluation">
        {status === 'ready' && (
          <span className="text-[11px] text-zinc-500 tabular-nums truncate" title={basis}>
            {basis}
          </span>
        )}
      </PanelHeader>
      {status === 'ready' && evaluation ? (
        <>
          {pinned}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <Scores evaluation={evaluation} />
            <FrameCounts frameEvaluation={frameEvaluation} frameIndex={frameIndex} />
            <RecallBars
              title="Recall by distance"
              note={sampleNote(evaluation)}
              empty="No scored label in the camera image."
              rows={evaluation.summary.byDistance.map((bin) => ({
                key: String(bin.from),
                label: `${bin.from}–${bin.to} m`,
                found: bin.found,
                total: bin.total,
              }))}
            />
            <RecallBars
              title="Recall by class"
              empty="No scored label in the camera image."
              rows={evaluation.summary.byClass.map((c) => ({
                key: c.class,
                label: c.class,
                found: c.found,
                total: c.total,
                color: getClassColor(c.class),
              }))}
            />
            <Notes
              rules={rules}
              fileMinScore={fileMinScore}
              frameEvaluation={frameEvaluation}
              frameBoxCount={frameBoxCount}
              framesWithoutPredictions={evaluation.framesWithoutPredictions}
            />
          </div>
        </>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          {status === 'loading' ? (
            <p className="text-sm text-zinc-500">Loading predictions…</p>
          ) : (
            <>
              <p className="text-sm text-amber-300">Predictions unavailable</p>
              {error && <p className="text-xs text-zinc-600 font-mono break-all">{error}</p>}
              <p className="text-xs text-zinc-500">
                Nothing can be scored without the model&apos;s predictions. Review mode is not
                affected.
              </p>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

const sampleNote = (evaluation: DatasetEvaluation): string =>
  `${evaluation.evaluatedFrames} frame${evaluation.evaluatedFrames === 1 ? '' : 's'} · small sample`;

/** Precision and Recall over every evaluated frame, each with the counts behind it. */
function Scores({ evaluation }: { evaluation: DatasetEvaluation }) {
  const { summary } = evaluation;
  const reported = summary.found + summary.falseAlarm;
  const scored = summary.found + summary.missed;
  return (
    <section className="px-3 pt-2 pb-1.5">
      <dl className="grid grid-cols-[auto_auto_1fr] items-baseline gap-x-3 gap-y-0.5">
        <dt
          className={SECTION_TITLE_CLASS}
          title="Precision = found ÷ (found + false alarms): of the boxes the model reported, how many matched a label"
        >
          Precision
        </dt>
        <dd className="text-base font-semibold text-zinc-100 tabular-nums text-right">
          {formatPercent(summary.precision)}
        </dd>
        <dd className="text-[11px] text-zinc-500 tabular-nums truncate">
          {reported > 0
            ? `${summary.found} of ${reported} model boxes matched a label`
            : 'the model reported no box at this score'}
        </dd>
        <dt
          className={SECTION_TITLE_CLASS}
          title="Recall = found ÷ (found + missed): of the labelled objects, how many the model found"
        >
          Recall
        </dt>
        <dd className="text-base font-semibold text-zinc-100 tabular-nums text-right">
          {formatPercent(summary.recall)}
        </dd>
        <dd className="text-[11px] text-zinc-500 tabular-nums truncate">
          {scored > 0
            ? `${summary.found} of ${scored} labelled objects were found`
            : 'no scored label in the camera image'}
        </dd>
      </dl>
    </section>
  );
}

/** The four outcome counts of the current frame. */
function FrameCounts({
  frameEvaluation,
  frameIndex,
}: {
  frameEvaluation: FrameEvaluation | null;
  frameIndex: number;
}) {
  return (
    <section className="flex items-center flex-wrap gap-x-3 gap-y-1 px-3 pb-2 text-[11px] text-zinc-400 tabular-nums">
      <span className="text-zinc-500">Frame {frameIndex}</span>
      {frameEvaluation ? (
        EVAL_KINDS.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1">
            <OutcomeIcon kind={kind} size={13} />
            <span className="text-zinc-200">{countOf(frameEvaluation.counts, kind)}</span>
            {/* "not scored" keeps its icon and number only (the words are in the
                icon's tooltip and for screen readers): with all four spelled
                out the row wraps, and in the 275px-tall panel at 1536×700 that
                pushes the distance bars out of view. */}
            <span className={kind === 'not-scored' ? 'sr-only' : undefined}>
              {OUTCOME_LABEL[kind].toLowerCase()}
            </span>
          </span>
        ))
      ) : (
        // Not "0 found": the model was never run on this frame.
        <span className="text-amber-300/90">no predictions for this frame — not evaluated</span>
      )}
    </section>
  );
}

type BarRow = { key: string; label: string; found: number; total: number; color?: string };

/** Recall as rows of "label · bar · percentage · found/total". Hand-made bars (no chart library). */
function RecallBars({
  title,
  note,
  rows,
  empty,
}: {
  title: string;
  note?: string;
  rows: BarRow[];
  empty: string;
}) {
  return (
    <section className="px-3 py-2 border-t border-zinc-800">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className={SECTION_TITLE_CLASS}>{title}</h3>
        {note && <span className="text-[11px] text-zinc-600">{note}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-zinc-500">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((row) => {
            const value = ratio(row.found, row.total);
            return (
              <li key={row.key} className="flex items-center gap-2 text-xs tabular-nums">
                <span title={row.label} className="w-20 shrink-0 truncate text-zinc-300">
                  {row.label}
                </span>
                <span className="flex-1 h-1.5 rounded bg-zinc-800 overflow-hidden">
                  <span
                    className="block h-full rounded bg-sky-400"
                    style={{
                      width: `${(value ?? 0) * 100}%`,
                      ...(row.color ? { backgroundColor: row.color } : {}),
                    }}
                  />
                </span>
                <span className="w-9 shrink-0 text-right text-zinc-100">{formatPercent(value)}</span>
                {/* The counts stay next to every percentage: 0% of 40 and 0% of 2
                    are not the same finding. */}
                <span className="w-12 shrink-0 text-right text-[11px] text-zinc-500">
                  {row.found}/{row.total}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** What the numbers do and do not mean. Always rendered with them. */
function Notes({
  rules,
  fileMinScore,
  frameEvaluation,
  frameBoxCount,
  framesWithoutPredictions,
}: {
  rules: EvaluationRules;
  /** Set when the slider is below what the predictions file contains. */
  fileMinScore: number | null;
  frameEvaluation: FrameEvaluation | null;
  frameBoxCount: number;
  framesWithoutPredictions: number;
}) {
  return (
    <section className="px-3 py-2.5 border-t border-zinc-800 space-y-1.5 text-[11px] leading-relaxed text-zinc-500">
      <p>
        <span className="text-zinc-400">Label boxes are approximate:</span> each is a nuScenes 3D
        box projected into the photo, not a hand-drawn 2D box, and is looser than the object.
      </p>
      <p>
        Found = a model box of the same class, scoring ≥{' '}
        {(fileMinScore ?? rules.minScore).toFixed(2)}, overlapping the label with IoU ≥{' '}
        {rules.iouThreshold}. Labels less than 40% visible (as rated by nuScenes over all six
        cameras) are not scored.
      </p>
      {fileMinScore !== null && (
        <p className="text-amber-300/80">
          The predictions file only holds boxes scoring ≥ {fileMinScore.toFixed(2)}. A lower Min
          score changes nothing.
        </p>
      )}
      {frameEvaluation && frameEvaluation.notEvaluated > 0 && (
        <p>
          {frameEvaluation.notEvaluated} of this frame&apos;s {frameBoxCount} boxes are outside the
          camera image or of a class the model cannot name — not evaluated.
        </p>
      )}
      {framesWithoutPredictions > 0 && (
        <p className="text-amber-300/80">
          {framesWithoutPredictions} frame{framesWithoutPredictions === 1 ? ' has' : 's have'} no
          predictions in the file and {framesWithoutPredictions === 1 ? 'is' : 'are'} left out of
          the totals.
        </p>
      )}
    </section>
  );
}
