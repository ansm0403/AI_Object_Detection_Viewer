'use client';

import { useMemo } from 'react';
import type { Frame } from '@/lib/types';
import {
  boxOutcomeColors,
  buildOverlay,
  findResult,
  orderResults,
  resultQueue,
  type EvalKind,
  type EvalResult,
  type FrameEvaluation,
  type Prediction2D,
  type ResultFilter,
} from '@/lib/evaluation';
import type { ImageOverlay } from '@/lib/ui/image-overlay';

type Input = {
  frame: Frame | null;
  /** The model's predictions for this frame (all scores), if it was run on it. */
  predictions: readonly Prediction2D[] | undefined;
  /** The frame's evaluation, or `null` when there is none (not evaluating, no predictions). */
  frameEvaluation: FrameEvaluation | null;
  /** The app's single selection (`selectedObjectId`). */
  selectedId: string | null;
  /** Class chips of the filter bar (empty = all). */
  classes: ReadonlySet<string>;
  /** Outcome chips of the result list (empty = all). */
  kinds: ReadonlySet<EvalKind>;
};

export type FrameResults = {
  filter: ResultFilter;
  /** Every result of the frame, in list order. */
  ordered: EvalResult[];
  /** Selection ids of the VISIBLE results, in list order — what J / K walk. */
  queue: string[];
  /** The result the selection refers to, if any. */
  selectedResult: EvalResult | undefined;
  /** What the camera image draws; `null` when there is no evaluation. */
  overlay: ImageOverlay | null;
  /** Outcome colour of every 3D box of the frame; `null` when there is no evaluation. */
  boxColors: Map<string, string> | null;
};

/**
 * Everything the evaluate-mode panes derive from one frame's evaluation (F5),
 * memoised in one place so the page only wires it up.
 *
 * It holds no state and decides nothing itself: order, filtering, the overlay
 * and the selection lookup are the pure functions of `lib/evaluation`.
 */
export function useFrameResults({
  frame,
  predictions,
  frameEvaluation,
  selectedId,
  classes,
  kinds,
}: Input): FrameResults {
  const filter = useMemo<ResultFilter>(() => ({ kinds, classes }), [kinds, classes]);
  const ordered = useMemo(
    () => (frameEvaluation ? orderResults(frameEvaluation.results) : []),
    [frameEvaluation],
  );
  const queue = useMemo(() => resultQueue(ordered, filter), [ordered, filter]);
  const selectedResult = useMemo(
    () => (frameEvaluation ? findResult(frameEvaluation, selectedId) : undefined),
    [frameEvaluation, selectedId],
  );
  const overlay = useMemo(
    () =>
      frame && frameEvaluation
        ? buildOverlay(frame, predictions ?? [], frameEvaluation, { selectedId, filter })
        : null,
    [frame, predictions, frameEvaluation, selectedId, filter],
  );
  const boxColors = useMemo(
    () => (frame && frameEvaluation ? boxOutcomeColors(frame, frameEvaluation) : null),
    [frame, frameEvaluation],
  );
  return { filter, ordered, queue, selectedResult, overlay, boxColors };
}
