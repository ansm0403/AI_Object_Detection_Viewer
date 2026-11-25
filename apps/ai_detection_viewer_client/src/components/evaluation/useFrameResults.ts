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
  type ObjectOutcome,
  type Prediction2D,
  type ResultFilter,
} from '@/lib/evaluation';
import type { ImageOverlay } from '@/lib/ui/image-overlay';

type Input = {
  frame: Frame | null;
  /** The model's predictions for this frame (all scores), if it was run on it. */
  predictions: readonly Prediction2D[] | undefined;
  /**
   * The evaluation of the PHOTO on screen (`frame` is the frame as that camera
   * sees it), or `null` when there is none (not evaluating, no predictions).
   */
  frameEvaluation: FrameEvaluation | null;
  /**
   * (F6) What became of each labelled object across ALL cameras of the frame —
   * the 3D boxes are coloured by this, not by the one photo on screen. `null`
   * when no photo of the frame was evaluated.
   */
  objectOutcomes: ReadonlyMap<string, ObjectOutcome> | null;
  /** The frame with all its 3D boxes (the same object for every camera). */
  boxFrame: Frame | null;
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
 * Everything the evaluate-mode panes derive from one photo's evaluation (F5;
 * F6: the photo of the camera on screen, plus the per-object colours),
 * memoised in one place so the page only wires it up.
 *
 * It holds no state and decides nothing itself: order, filtering, the overlay
 * and the selection lookup are the pure functions of `lib/evaluation`.
 */
export function useFrameResults({
  frame,
  predictions,
  frameEvaluation,
  objectOutcomes,
  boxFrame,
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
    () => (boxFrame && objectOutcomes ? boxOutcomeColors(boxFrame, objectOutcomes) : null),
    [boxFrame, objectOutcomes],
  );
  return { filter, ordered, queue, selectedResult, overlay, boxColors };
}
