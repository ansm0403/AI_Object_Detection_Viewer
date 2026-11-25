'use client';

import type { ReactNode } from 'react';
import {
  NOT_EVALUATED_COLOR,
  OUTCOME_COLOR,
  OUTCOME_LABEL,
  describeResult,
  type EvalResult,
  type EvaluationRules,
} from '@/lib/evaluation';
import { OutcomeIcon } from './icons';

/** A selected 3D box that takes no part in the evaluation, and why. */
export type NotEvaluatedBox = {
  class: string;
  /** Measured distance from the ego vehicle in metres. */
  distance: number;
  reason: 'outside-camera' | 'class-not-evaluated';
};

type Props = {
  /** The selected result, when the selection is one. */
  result: EvalResult | undefined;
  /** nuScenes visibility of the selected label as text ("60–80%"), if known. */
  visibility?: string | null;
  /** Set when the selection is a 3D box outside the evaluation. */
  notEvaluated?: NotEvaluatedBox | null;
  rules: EvaluationRules;
  /** Name of the camera the evaluation is about, e.g. "CAM_FRONT". */
  camera?: string;
};

/**
 * The selected result, pinned at the top of the Evaluation panel (F5): what it
 * is, and the one fact that explains it (`describeResult`).
 *
 * Fixed height — one headline and two lines of text — so the panel below does
 * not jump as the selection moves.
 */
export function SelectedResult({ result, visibility, notEvaluated, rules, camera }: Props) {
  let icon: ReactNode = null;
  let headline: ReactNode;
  let detail: string;

  if (result) {
    icon = <OutcomeIcon kind={result.kind} />;
    const name = (
      <span className="font-semibold" style={{ color: OUTCOME_COLOR[result.kind] }}>
        {OUTCOME_LABEL[result.kind]}
      </span>
    );
    headline =
      result.kind === 'false-alarm' ? (
        <>
          {name}
          <span className="text-zinc-200">
            model box: {result.class} · score {result.score.toFixed(2)}
          </span>
          {/* A model box is a 2D rectangle. It has no depth, so it is not
              placed in the 3D view (Immutable Rule #6). */}
          <span className="text-zinc-500" title="A model box is a 2D rectangle with no depth, so it is not drawn in the 3D view">
            2D only
          </span>
        </>
      ) : (
        <>
          {name}
          <span className="text-zinc-200">
            {result.class} · {Math.round(result.distance)} m
            {visibility ? ` · visible ${visibility}` : ''}
          </span>
        </>
      );
    detail = describeResult(result, rules);
  } else if (notEvaluated) {
    headline = (
      <>
        <span className="font-semibold" style={{ color: NOT_EVALUATED_COLOR }}>
          Not evaluated
        </span>
        <span className="text-zinc-200">
          {notEvaluated.class} · {Math.round(notEvaluated.distance)} m
        </span>
      </>
    );
    detail =
      notEvaluated.reason === 'outside-camera'
        ? `outside ${camera ?? 'the camera image'} — the model never saw it, so there is nothing to compare`
        : 'the model has no class for this kind of object, so there is nothing to compare';
  } else {
    headline = <span className="text-zinc-500">No result selected</span>;
    detail = 'Select a row, or a box in the photo or the 3D view, to see why it was scored that way.';
  }

  return (
    <div className="shrink-0 px-3 py-1.5 border-b border-zinc-800 bg-zinc-950/40">
      <div className="flex items-center gap-1.5 h-4 text-xs leading-4 tabular-nums whitespace-nowrap overflow-hidden">
        {icon}
        {headline}
      </div>
      <p
        className="mt-0.5 h-8 overflow-hidden text-[11px] leading-4 text-zinc-400 tabular-nums"
        title={detail}
      >
        {detail}
      </p>
    </div>
  );
}
